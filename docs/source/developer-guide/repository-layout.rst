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
       desktop/electron-builder.yml  # distributables (dmg/zip, nsis/zip, AppImage/tar.gz)
       pc/                      # DEPRECATED Next.js web app (static; thin API route re-exports)
         config/                # projects/apps YAML of the web mode
         product/               # example catalog
     packages/
       core/                    # @pc/core — shared domain core
         schema/                # JSON Schemas of catalog entities
         src/storage.ts         # catalog storage (config or manifest mode)
         src/project/model.ts   # YAML-as-DB project model, editor operations, migration
         src/project/discovery.ts  # one-time import from the repository layout
         src/interfaces/openapi.ts  # OpenAPI loader / link model
         src/code/, src/prisma/, src/sync/  # code & Prisma sync
         src/http/routes/**     # API handlers, src/http/router.ts — route table
         test/                  # vitest unit tests
     docs/                      # this Sphinx documentation
       product/<component>/     # Product Creator's own component catalogs (*.pc.yml)
     product-creator.yml        # Product Creator's own project file
     eslint.config.mjs          # ESLint for desktop and core
     .github/workflows/ci.yml   # checks + distributables for macOS/Windows/Linux
     pnpm-workspace.yaml        # apps/*, packages/*

Product Creator documents itself: ``product-creator.yml`` plus ``docs/product/desktop/service.pc.yml``
and ``docs/product/core/library.pc.yml``. The deprecated web app is not part of the model.
