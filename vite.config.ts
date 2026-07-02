import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Отдельный тестовый стенд для подписи ЭПЛ. Порт нарочно не пересекается с основным фронтом.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5273,
    open: true
  }
})
