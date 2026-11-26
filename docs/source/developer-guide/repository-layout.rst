Repository layout
=================

.. code-block:: text

   product-creator/
     apps/
       desktop/                 # Electron app (electron-vite)
         bin/product-creator.mjs  # CLI launcher (opens cwd / given folders)
         electron.vite.config.ts
         src/main/              # main process: index.ts, workspace.ts, args.ts
         src/preload/           # contextBridge → window.pc
         src/shared/ipc.ts      # IPC contract
         src/renderer/          # index.html, src/main.tsx (routes), pages/, components/, shims/
       pc/                      # legacy Next.js web app (UI + thin API route re-exports)
         config/                # projects/apps YAML of the web mode
         product/               # example catalog
     packages/
       core/                    # @pc/core — shared domain core
         schema/                # JSON Schemas of catalog entities
         src/storage.ts         # catalog storage (config or manifest mode)
         src/project/manifest.ts  # product-creator.yml + service discovery
         src/interfaces/openapi.ts  # OpenAPI loader / link model
         src/code/, src/prisma/, src/sync/  # code & Prisma sync
         src/http/routes/**     # API handlers, src/http/router.ts — route table
     docs/                      # this Sphinx documentation
     product-creator.yml        # Product Creator's own project manifest
     pnpm-workspace.yaml        # apps/*, packages/*

Product Creator documents itself: its services are declared in ``product-creator.yml`` (desktop,
core, web app) with catalogs in ``docs/product/<service>``.
