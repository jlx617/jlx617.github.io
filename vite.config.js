import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  cacheDir: '/tmp/vite-cache-xgf',
  plugins: [react(), viteSingleFile()],
  build: {
    minify: false,
  },
})
