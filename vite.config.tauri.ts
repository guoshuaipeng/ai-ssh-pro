import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  clearScreen: false,
  root: resolve(projectRoot, 'src/renderer'),
  plugins: [
    react(),
    {
      name: 'tauri-index',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            req.url = '/index.tauri.html'
          }
          next()
        })
      }
    }
  ],
  resolve: {
    alias: {
      '@renderer': resolve(projectRoot, 'src/renderer/src'),
      '@shared': resolve(projectRoot, 'src/shared')
    }
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    outDir: resolve(projectRoot, 'dist-tauri'),
    emptyOutDir: true,
    target: 'esnext',
    minify: !process.env.TAURI_DEBUG,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      input: resolve(projectRoot, 'src/renderer/index.tauri.html')
    }
  }
})
