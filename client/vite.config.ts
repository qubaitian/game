import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Phaser 本身就有 1MB 多，不用为它报警
    chunkSizeWarningLimit: 2000,
  },
});
