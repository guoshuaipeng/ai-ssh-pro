import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** 配置文件所在目录（仓库根） */
const projectRoot = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(projectRoot, 'src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          // package.json 含 "type":"module" 时 .js 会被当作 ESM，Electron 用 require() 加载 preload 会报 ERR_REQUIRE_ESM
          entryFileNames: 'index.cjs',
          chunkFileNames: '[name]-[hash].cjs'
        }
      }
    }
  },
  renderer: {
    // 渲染 root 默认为 src/renderer，引用 src/shared 需放行上级目录，否则 dev 下模块加载失败 → 黑屏
    server: {
      fs: {
        allow: [projectRoot, srcDir]
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(projectRoot, 'src/renderer/src'),
        '@shared': resolve(projectRoot, 'src/shared')
      }
    },
    plugins: [react()]
  }
})
