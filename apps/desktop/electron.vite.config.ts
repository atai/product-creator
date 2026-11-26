import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: {
      // @pc/core is TypeScript source in the workspace: bundle it, keep its npm deps external
      externalizeDeps: { exclude: ['@pc/core'] },
    },
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        // Pages were ported from the Next.js app (apps/pc); these shims map Next APIs to react-router
        'next/navigation': resolve(__dirname, 'src/renderer/src/shims/navigation.ts'),
        'next/link': resolve(__dirname, 'src/renderer/src/shims/link.tsx'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
