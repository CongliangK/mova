import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const host = process.env.TAURI_DEV_HOST
const appRoot = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const verifiedPiAgentBrowserBundleVersion = '0.79.1'
const piAgentCorePackageJsonPath = require.resolve('@earendil-works/pi-agent-core/package.json')
const piAgentCorePackageRoot = dirname(piAgentCorePackageJsonPath)
const piAiPackageJsonPath = join(appRoot, 'node_modules/@earendil-works/pi-ai/package.json')
const piAiPackageRoot = dirname(piAiPackageJsonPath)
// The public pi-agent-core entry re-exports Node/provider helpers that the Mova browser runtime never uses.
// TypeScript still resolves the package's public d.ts; this runtime alias only covers the current Agent usage.
// Future value imports from @earendil-works/pi-agent-core must re-check this browser alias/shim contract.
const piAgentCoreBrowserEntry = normalizePath(join(piAgentCorePackageRoot, 'dist/agent.js'))
const piAiEventStreamEntry = normalizePath(join(piAiPackageRoot, 'dist/utils/event-stream.js'))
const piAiValidationEntry = normalizePath(join(piAiPackageRoot, 'dist/utils/validation.js'))
const piAiBrowserShimId = '\0mova-pi-ai-browser-shim'

interface PackageJson {
  version?: string
}

function readPackageVersion(packageJsonPath: string): string | undefined {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson
    return typeof packageJson.version === 'string' ? packageJson.version : undefined
  } catch (err) {
    console.warn(`[mova] Unable to read ${packageJsonPath}; re-check the pi-agent browser alias/shim.`, err)
    return undefined
  }
}

function warnIfUnverifiedPiAgentBrowserBundle() {
  const coreVersion = readPackageVersion(piAgentCorePackageJsonPath)
  const aiVersion = readPackageVersion(piAiPackageJsonPath)
  const mismatches: string[] = []

  if (coreVersion !== verifiedPiAgentBrowserBundleVersion) {
    mismatches.push(`@earendil-works/pi-agent-core@${coreVersion ?? 'unknown'}`)
  }
  if (aiVersion !== verifiedPiAgentBrowserBundleVersion) {
    mismatches.push(`@earendil-works/pi-ai@${aiVersion ?? 'unknown'}`)
  }

  if (mismatches.length > 0) {
    console.warn(
      `[mova] pi-agent browser alias/shim was verified with @earendil-works/pi-agent-core and ` +
        `@earendil-works/pi-ai ${verifiedPiAgentBrowserBundleVersion}, but found ${mismatches.join(', ')}. ` +
        'Build will continue; re-check vite.config.ts before trusting the browser bundle.',
    )
  }
}

warnIfUnverifiedPiAgentBrowserBundle()

function piAgentBrowserBundlePlugin() {
  return {
    name: 'mova-pi-agent-browser-bundle',
    // Avoid @earendil-works/pi-ai's provider registry/env-key entry in the renderer bundle; it pulls
    // lazy provider chunks and a harmless-but-confusing node:fs browser externalization warning.
    enforce: 'pre' as const,
    resolveId(source: string) {
      if (source === '@earendil-works/pi-ai') return piAiBrowserShimId
      return undefined
    },
    load(id: string) {
      if (id !== piAiBrowserShimId) return undefined

      return `
import { EventStream } from ${JSON.stringify(piAiEventStreamEntry)}
import { validateToolArguments } from ${JSON.stringify(piAiValidationEntry)}

export { EventStream, validateToolArguments }

export async function streamSimple() {
  throw new Error('Mova pi-agent-core runtime requires an explicit browser streamFn.')
}
`
    },
  }
}

export default defineConfig({
  plugins: [piAgentBrowserBundlePlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@earendil-works/pi-agent-core': piAgentCoreBrowserEntry,
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5174,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
