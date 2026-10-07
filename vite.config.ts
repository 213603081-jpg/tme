import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    watch: { ignored: ['**/.browser-check/**', '**/.cabinet-*/**'] },
    host: true,
    port: 5173,
  },
})
