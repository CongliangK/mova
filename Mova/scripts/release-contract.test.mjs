import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const pkg = JSON.parse(read('Mova/package.json'))
const documents = ['AGENTS.md', 'README.md', 'Mova/README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'docs/RELEASE_CHECKLIST.md']

// Static publication checks only: no synthetic repositories, export or secret scanner.
// Passing these checks is not legal clearance, a product test or a release approval.
test('license text and application metadata agree', () => {
  assert.equal(pkg.license, 'GPL-3.0-only')
  assert.equal(pkg.private, true)
  assert.match(read('Mova/src-tauri/Cargo.toml'), /^license = "GPL-3.0-only"$/m)
  const hash = createHash('sha256').update(readFileSync(resolve(root, 'LICENSE'))).digest('hex')
  assert.equal(hash, '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986')
})

test('application versions, runtime pins, lockfiles and read-only CI agree', () => {
  assert.match(read('Mova/src-tauri/Cargo.toml'), new RegExp(`^version = "${pkg.version.replaceAll('.', '\\.')}"$`, 'm'))
  const tauri = JSON.parse(read('Mova/src-tauri/tauri.conf.json'))
  assert.equal(tauri.version, pkg.version)
  assert.equal(tauri.$schema, 'https://schema.tauri.app/config/2')
  assert.equal(read('.node-version').trim(), pkg.engines.node)
  assert.equal(pkg.packageManager, `pnpm@${pkg.engines.pnpm}`)
  const rust = read('rust-toolchain.toml').match(/^channel = "([^"]+)"$/m)?.[1]
  assert.ok(rust)
  assert.match(read('Mova/pnpm-lock.yaml'), /^lockfileVersion:/m)
  assert.ok(read('Mova/src-tauri/Cargo.lock').includes(`name = "mova"\nversion = "${pkg.version}"`))
  assert.doesNotMatch(read('Mova/src-tauri/Cargo.lock'), /(?:file:\/\/|\/home\/|\/Users\/)/)
  assert.doesNotMatch(read('Mova/.gitignore'), /^src-tauri\/Cargo\.lock$/m)
  const ci = read('.github/workflows/ci.yml')
  assert.match(ci, /permissions:\n  contents: read\n/)
  assert.ok(ci.includes('persist-credentials: false'))
  assert.doesNotMatch(ci, /pull_request_target|secrets\.|contents: write|packages: write/)
  assert.ok(ci.includes('node-version-file: .node-version'))
  assert.ok(ci.includes(`corepack prepare ${pkg.packageManager} --activate`))
  assert.ok(ci.includes(`rustup toolchain install ${rust} --profile minimal`))
  for (const command of ['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm typecheck', 'pnpm test:release', 'pnpm build', 'cargo check --manifest-path src-tauri/Cargo.toml --locked', 'cargo test --manifest-path src-tauri/Cargo.toml --locked']) {
    assert.ok(ci.includes(`- run: ${command}\n`), command)
  }
  // Only the isolated performance step is diagnostic; every other check stays blocking.
  const diagnosticSteps = [
    '      - name: Functional tests',
    '        run: pnpm test --exclude src/__tests__/perf/performance-baseline.test.ts',
    '      - name: Performance baseline (isolated)',
    '        id: performance',
    '        continue-on-error: true',
    '        run: pnpm test src/__tests__/perf/performance-baseline.test.ts --no-file-parallelism',
    '      - name: Report performance baseline outcome',
    "        if: ${{ !cancelled() && (steps.performance.outcome == 'success' || steps.performance.outcome == 'failure') }}",
    '        env:',
    '          PERFORMANCE_OUTCOME: ${{ steps.performance.outcome }}',
    '        run: |',
    '          echo "### Performance baseline (diagnostic)" >> "$GITHUB_STEP_SUMMARY"',
    '          echo "Actual step outcome: ${PERFORMANCE_OUTCOME}. This shared-runner check is non-blocking; its original budgets and assertions remain unchanged." >> "$GITHUB_STEP_SUMMARY"',
    '          if [ "$PERFORMANCE_OUTCOME" != "success" ]; then',
    '            echo "::warning::Performance baseline failed. See its test log for the actual failure; functional tests and build checks remain blocking."',
    '          fi',
    '',
  ].join('\n')
  assert.ok(ci.includes(diagnosticSteps), 'run the full partition and report actual performance outcome without blocking other checks')
  assert.doesNotMatch(ci.replace(diagnosticSteps, ''), /^\s*(?:continue-on-error|if):/m, 'no other tolerated failures or conditional skips')
  assert.doesNotMatch(ci, /--(?:retry|passWithNoTests|testNamePattern|bail)\b|\|\|\s*true\b|set\s+\+e\b/)
  assert.equal(pkg.scripts.test, 'vitest run', 'retain the full product test entry point')
  assert.equal(pkg.scripts['test:release'], 'node --test scripts/release-contract.test.mjs')
})

test('publication documents have existing relative Markdown link targets', () => {
  for (const path of documents) {
    for (const [, target] of read(path).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|mailto:|#)/.test(target)) continue
      const destination = resolve(root, dirname(path), decodeURIComponent(target.split('#')[0]))
      assert.ok(existsSync(destination), `${path}: missing ${target}`)
    }
  }
})

test('manual publication boundaries, real target and rights limitations remain explicit', () => {
  const checklist = read('docs/RELEASE_CHECKLIST.md')
  for (const text of ['GPL-3.0-only', '实验性项目', '绝不从原仓库 push', '完整最终 commit OID', 'git archive', 'git-common-dir', 'worktree list', '单提交', '无旧 refs', '无 remote', '匿名', 'tree', '有限扫描', '不 force', '不 mirror']) {
    assert.ok(checklist.includes(text), text)
  }
  for (const path of ['README.md', 'SECURITY.md', 'docs/RELEASE_CHECKLIST.md']) {
    assert.ok(read(path).includes('https://github.com/CongliangK/mova'), path)
  }
  assert.ok(read('SECURITY.md').includes('https://github.com/CongliangK/mova/security/advisories/new'))
  assert.match(read('SECURITY.md'), /是否启用尚需核实/)
  assert.match(read('README.md'), /localStorage/)
  const notices = read('THIRD_PARTY_NOTICES.md')
  for (const text of ['来源不确定，本次不分发', '权利人已明确确认这些品牌与图标有权开源', '不是独立法律核实', '不据此自动清除第三方来源的权利义务']) {
    assert.ok(notices.includes(text), text)
  }
})

test('public tracked manifest excludes uncertain helpers and removed automation, retaining runtime and product tests', () => {
  const tracked = execFileSync('git', ['--no-optional-locks', 'ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  assert.equal(tracked.some((path) => path.startsWith('skills/')), false)
  assert.match(read('.gitignore'), /^\/skills\/$/m)
  for (const name of ['skill-registry', 'map-generation-skill', 'sprite-generation-skill']) {
    assert.ok(tracked.includes(`Mova/src/services/ai/skills/${name}.ts`))
  }
  assert.ok(tracked.filter((path) => /^Mova\/src\/__tests__\/.*\.test\.tsx?$/.test(path)).length >= 54, 'do not drop original product tests')
  const removedTool = 'Mova/scripts/create-source-snapshot.py'
  assert.equal(tracked.includes(removedTool), false)
  assert.equal(existsSync(resolve(root, removedTool)), false)
  for (const path of [...documents, 'Mova/package.json', '.github/workflows/ci.yml']) {
    assert.equal(read(path).includes('create-source-snapshot.py'), false, `${path}: removed-tool dependency`)
  }
})
