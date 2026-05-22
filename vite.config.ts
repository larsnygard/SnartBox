import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

// Vite config for SnartBox
// - topLevelAwait plugin: needed because opencascade.js uses top-level await internally
// - worker format set to 'es' so the geometry Web Worker can use ESM imports
// - path alias @/ → src/ for clean imports throughout the project
// - headers: SharedArrayBuffer requires COOP/COEP headers (needed for some WASM threading)
// - base: './' for relative paths so the app can be deployed to a subfolder

export default defineConfig({
  base: './',
  plugins: [
    react(),
    topLevelAwait(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
    plugins: () => [topLevelAwait()],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // Exclude opencascade.js from dep pre-bundling — it self-manages its WASM
    exclude: ['opencascade.js'],
  },
})
