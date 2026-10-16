import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // O bloco da mesa (three.js + drei + postprocessing) é grande por natureza e só
  // carrega sob demanda; o aviso fica para blocos maiores que isso.
  build: { chunkSizeWarningLimit: 1400 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
