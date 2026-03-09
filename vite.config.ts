import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@email-components': path.resolve(__dirname, 'src/email-components'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@layouts': path.resolve(__dirname, 'src/layouts'),
    },
  },
  server: {
    port: 5173,
    host: true, // 允许 0.0.0.0，公网可访问
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (
            id.includes('/@tiptap/') ||
            id.includes('/prosemirror-')
          ) {
            return 'vendor-editor'
          }
          if (
            id.includes('/recharts/') ||
            id.includes('/d3-') ||
            id.includes('/victory-vendor/')
          ) {
            return 'vendor-chart'
          }
          if (id.includes('/@dnd-kit/')) {
            return 'vendor-dnd'
          }
          if (
            id.includes('/react-markdown/') ||
            id.includes('/remark-gfm/') ||
            id.includes('/remark-breaks/') ||
            id.includes('/rehype-raw/')
          ) {
            return 'vendor-markdown'
          }
          if (id.includes('/react-icons/')) {
            return 'vendor-icons'
          }
          return undefined
        },
      },
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
      // 可讀 class 命名：檔案名__類名，例如 App__app、Canvas__dropZone
      generateScopedName: (name: string, filename: string) => {
        const base = path.basename(filename, path.extname(filename))
        const moduleName = base.replace(/\.module$/, '')
        return `${moduleName}__${name}`
      },
    },
  },
})
