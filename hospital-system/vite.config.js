import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The browser asks this app for /api/... and Vite passes those requests on to the back end.
    // To the browser, the screens and the server then look like one website.
    proxy: { '/api': 'http://localhost:4000' },
  },
})