import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works from any sub-path (GitHub Pages, Netlify, a folder).
export default defineConfig({
  base: './',
  plugins: [react()],
})
