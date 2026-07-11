import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Build the stdio bridge separately so it is one dependency-bundled CommonJS
// file. LogVue copies this artifact to its stable per-user data directory.
export default defineConfig({
  build: {
    ssr: resolve('src/mcp-bridge/index.ts'),
    outDir: 'out/main',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
      output: {
        format: 'cjs',
        entryFileNames: 'mcpBridge.js',
        inlineDynamicImports: true
      }
    }
  },
  ssr: { noExternal: true }
})
