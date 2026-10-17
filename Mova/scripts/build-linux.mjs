import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = join(rootDir, 'src-tauri');
const tauriConfig = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));
const appVersion = tauriConfig.version;
const targetDir = join(tauriDir, 'target', 'release');
const bundleDir = join(targetDir, 'bundle');
const appDir = join(bundleDir, 'appimage', 'Mova.AppDir');
const appImagePath = join(bundleDir, 'appimage', `Mova_${appVersion}_amd64.AppImage`);
const toolchainDir = join(rootDir, '.linux-toolchain');
const appImageTool = join(toolchainDir, 'appimagetool-x86_64.AppImage');
const appImageToolUrl = 'https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage';

function withLinuxToolchainEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  const cargoBin = join(toolchainDir, 'cargo', 'bin');
  if (existsSync(join(cargoBin, 'cargo'))) {
    env.CARGO_HOME = join(toolchainDir, 'cargo');
    env.RUSTUP_HOME = join(toolchainDir, 'rustup');
    env.PATH = `${cargoBin}:${env.PATH ?? ''}`;
  }
  return env;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: withLinuxToolchainEnv(options.env ?? {}),
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
    error.status = result.status;
    throw error;
  }
}

function runAllowFailure(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: withLinuxToolchainEnv(options.env ?? {}),
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function downloadAppImageTool() {
  if (existsSync(appImageTool)) return;
  mkdirSync(toolchainDir, { recursive: true });
  run('curl', ['-L', '--fail', '-o', appImageTool, appImageToolUrl]);
  run('chmod', ['+x', appImageTool]);
}

if (process.platform !== 'linux') {
  console.error('build-linux only supports Linux.');
  process.exit(1);
}

console.log('Building Linux .deb and .rpm bundles...');
run('pnpm', ['tauri', 'build', '--bundles', 'deb', 'rpm']);

console.log('Building Linux AppImage AppDir...');
const appImageStatus = runAllowFailure('pnpm', ['tauri', 'build', '--bundles', 'appimage']);
if (appImageStatus !== 0) {
  // On newer distributions (for example Fedora 43), the linuxdeploy build used by
  // Tauri can fail while stripping system libraries that contain .relr.dyn
  // sections. It still leaves a complete AppDir, so package that AppDir with
  // appimagetool directly.
  if (!existsSync(appDir)) {
    console.error('Tauri AppImage bundling failed and no AppDir was produced.');
    process.exit(appImageStatus);
  }
  console.warn('Tauri AppImage bundling failed; packaging the generated AppDir with appimagetool fallback.');
}

const upperIcon = join(appDir, 'Mova.png');
const lowerIcon = join(appDir, 'mova.png');
if (existsSync(upperIcon) && !existsSync(lowerIcon)) {
  copyFileSync(upperIcon, lowerIcon);
}

downloadAppImageTool();
run(appImageTool, [appDir, appImagePath], { env: { ARCH: 'x86_64' } });

console.log('Linux export complete:');
console.log(`- ${join(bundleDir, 'deb', `Mova_${appVersion}_amd64.deb`)}`);
console.log(`- ${join(bundleDir, 'rpm', `Mova-${appVersion}-1.x86_64.rpm`)}`);
console.log(`- ${appImagePath}`);
