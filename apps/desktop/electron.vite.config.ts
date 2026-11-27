import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: {
      // @pc/core and @pc/mcp are TypeScript sources in the workspace: bundle them, keep their npm deps external
      externalizeDeps: { exclude: ['@pc/core', '@pc/mcp'] },
      // cli.js: `product-creator migrate|lint` without Electron (run by bin/product-creator.mjs with node)
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts'), cli: resolve(__dirname, 'src/main/cli.ts') } },
    },
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        // Shims map next/navigation and next/link import paths to react-router
        'next/navigation': resolve(__dirname, 'src/renderer/src/shims/navigation.ts'),
        'next/link': resolve(__dirname, 'src/renderer/src/shims/link.tsx'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
