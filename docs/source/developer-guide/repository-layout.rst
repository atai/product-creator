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
     packages/
       core/                    # @pc/core — shared domain core
         schema/                # JSON Schemas of catalog entities
         src/storage.ts         # catalog storage (config or manifest mode)
         src/project/model.ts   # YAML-as-DB project model, editor operations, migration
         src/project/discovery.ts  # one-time import from the repository layout
         src/interfaces/openapi.ts  # OpenAPI loader / link model
         src/interfaces/generator.ts  # runs OpenAPI generate commands
         src/code/, src/prisma/, src/sync/  # code & Prisma sync
         src/http/routes/**     # API handlers, src/http/router.ts — route table
         test/                  # vitest unit tests
       mcp/                     # @pc/mcp — MCP server (Streamable HTTP, tools, action log)
         src/server.ts, tools.ts, audit.ts, host.ts
         test/                  # vitest: real server + core on a temp project
     docs/                      # this Sphinx documentation
       product/<component>/     # Product Creator's own component catalogs (*.pc.yml)
     scripts/
       version-manager.mjs      # pnpm version:* — sync versions, CHANGELOG, release commit + tag
     product-creator.yml        # Product Creator's own project file
     eslint.config.mjs          # ESLint for desktop, core and mcp
     .github/workflows/ci.yml   # checks + distributables for macOS/Windows/Linux
     pnpm-workspace.yaml        # apps/*, packages/*, design-system

Product Creator documents itself: ``product-creator.yml`` plus ``docs/product/desktop/service.pc.yml``
and ``docs/product/core/library.pc.yml``.
