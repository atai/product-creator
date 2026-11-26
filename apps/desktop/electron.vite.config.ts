import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: {
      // @pc/core and @pc/mcp are TypeScript sources in the workspace: bundle them, keep their npm deps external
      externalizeDeps: { exclude: ['@pc/core', '@pc/mcp'] },
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
