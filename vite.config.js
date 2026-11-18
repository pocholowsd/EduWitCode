import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {

      '/api': {
        target: 'http://127.0.0.1:8000',
        // Se conserva el Host del navegador: el backend compara el Origin con el Host para rechazar
        // peticiones de otros sitios (CSRF), y la cookie de sesión llega igual a través del proxy.
        changeOrigin: false,
        secure: false,
      }
    },
    allowedHosts: ['lecturer-venus-citrus.ngrok-free.dev']
  }
})
