import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Builds the app as one self-contained script and stylesheet (see scripts/single-file.mjs).
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { 'import.meta.env.VITE_NO_NETWORK': '"1"' },
  build: {
    outDir: 'dist-single',
    cssCodeSplit: false,
    rolldownOptions: { output: { inlineDynamicImports: true } },
  },
})
