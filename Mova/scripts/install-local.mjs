import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_NAME = 'Mova';
const BIN_NAME = 'mova';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = join(rootDir, 'src-tauri');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function psQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function installLinux() {
  run('bash', [join(rootDir, 'scripts', 'install-local.sh')]);
}

function installWindows() {
  const localAppData = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? rootDir, 'AppData', 'Local');
  const appData = process.env.APPDATA ?? join(process.env.USERPROFILE ?? rootDir, 'AppData', 'Roaming');
  const installDir = join(localAppData, APP_NAME);
  const startMenuDir = join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const releaseBin = join(tauriDir, 'target', 'release', `${BIN_NAME}.exe`);
  const installedBin = join(installDir, `${BIN_NAME}.exe`);
  const shimPath = join(installDir, `${BIN_NAME}.cmd`);
  const iconPath = join(tauriDir, 'icons', 'icon.ico');
  const shortcutPath = join(startMenuDir, `${APP_NAME}.lnk`);
  const cargoBin = join(process.env.USERPROFILE ?? '', '.cargo', 'bin');
  const corepack = 'corepack';
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path';

  if (existsSync(cargoBin)) {
    env[pathKey] = `${cargoBin};${env[pathKey] ?? ''}`;
  }

  console.log(`Building ${APP_NAME} production release binary...`);
  run(corepack, ['pnpm', 'tauri', 'build', '--no-bundle'], { env, shell: process.platform === 'win32' });

  if (!existsSync(releaseBin)) {
    throw new Error(`Release binary not found at ${releaseBin}`);
  }

  mkdirSync(installDir, { recursive: true });
  mkdirSync(startMenuDir, { recursive: true });
  copyFileSync(releaseBin, installedBin);
  writeFileSync(shimPath, `@echo off\r\nstart "" "%~dp0${BIN_NAME}.exe" %*\r\n`, 'utf8');

  const shortcutScript = [
    '$shell = New-Object -ComObject WScript.Shell',
    `$shortcut = $shell.CreateShortcut(${psQuote(shortcutPath)})`,
    `$shortcut.TargetPath = ${psQuote(installedBin)}`,
    `$shortcut.WorkingDirectory = ${psQuote(installDir)}`,
    existsSync(iconPath) ? `$shortcut.IconLocation = ${psQuote(iconPath)}` : '',
    '$shortcut.Save()',
  ]
    .filter(Boolean)
    .join('; ');

  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', shortcutScript]);

  console.log(`${APP_NAME} installed/updated: ${installedBin}`);
  console.log(`Command shim: ${shimPath}`);
  console.log(`Start menu shortcut: ${shortcutPath}`);
}

try {
  if (process.platform === 'linux') {
    installLinux();
  } else if (process.platform === 'win32') {
    installWindows();
  } else {
    throw new Error('install-local currently supports Linux and Windows user installs only.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
