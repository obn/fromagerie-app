import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Le build est copie vers backend/src/public pour etre servi par Express.
    outDir: '../backend/src/public',
    emptyOutDir: true,
  },
});
