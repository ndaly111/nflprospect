import { defineConfig } from 'vite'

export default defineConfig({
  base: '/nflprospect/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
  },
})
