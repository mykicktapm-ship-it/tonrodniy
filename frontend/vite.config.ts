import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      zustand: path.resolve(__dirname, 'src/lib/zustand'),
    },
  },
});
