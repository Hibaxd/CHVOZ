import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite zajišťuje rychlý vývojový server i optimalizovaný produkční build.
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {
      // API i uploady se ve vĂ˝voji tvĂˇĹ™Ă­ jako stejnĂ˝ origin. HttpOnly cookies
      // proto fungujĂ­ stejnÄ› lokĂˇlnÄ› i po produkÄŤnĂ­m sestavenĂ­.
      '/api': 'http://127.0.0.1:8787',
      '/uploads': 'http://127.0.0.1:8787',
    },
  },
})
