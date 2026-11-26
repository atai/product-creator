Development
===========

Setup
-----

.. code-block:: bash

   pnpm install

Commands (from the repository root)
-----------------------------------

.. list-table::
   :header-rows: 1

   * - Command
     - Purpose
   * - ``pnpm desktop -- --project <dir>``
     - Electron app in dev mode (renderer HMR); without ``--project`` opens the current folder
   * - ``pnpm dev`` / ``pnpm build`` / ``pnpm start``
     - Same as ``desktop`` / ``desktop:build`` / ``desktop:start``
   * - ``pnpm desktop:build`` / ``pnpm desktop:start``
     - Build ``apps/desktop/out`` / run the built app
   * - ``pnpm desktop:dist``
     - Installers for the current OS in ``apps/desktop/dist`` (see :doc:`/user-guide/distribution`)
   * - ``pnpm typecheck``
     - TypeScript checks of all packages (core, desktop, pc)
   * - ``pnpm lint``
     - ESLint (``eslint.config.mjs``) for ``apps/desktop`` and ``packages/core``
   * - ``pnpm test``
     - Unit tests (vitest, ``packages/core/test``)
   * - ``pnpm docs``
     - Build this documentation with warnings as errors (``make -C docs html SPHINXOPTS=-W``)
   * - ``pnpm pc:dev`` / ``pnpm pc:build``
     - Deprecated web app (port 3067)

.. warning::
   Do not run ``pnpm pc:build`` while ``pnpm pc:dev`` is running — both write to ``apps/pc/.next``.

Smoke test of the desktop app
-----------------------------

The main process has a headless verification mode: it opens the given projects, calls API routes through
the same dispatcher as the UI, renders the window, optionally saves a screenshot and exits.

.. code-block:: bash

   cd apps/desktop && pnpm build
   PC_SMOKE_TEST=1 PC_SMOKE_ROUTE=/functions PC_SMOKE_SCREENSHOT=/tmp/pc.png \
     PC_SMOKE_SYNC_APP=emperor-web-ui.frontend \
     npx electron . --project ~/git/product-creator --project ~/git/emperor-web-ui

``PC_SMOKE_GENERATE=<component slug>`` runs the OpenAPI generate command of a component of the first
project and prints the result and the operations seen by the Interfaces API; ``PC_SMOKE_EVAL=<js>`` runs
a script in the renderer (e.g. clicks a button; override ``window.confirm`` first) and
``PC_SMOKE_TEXT_FILTER`` prints matching lines of the page. Use ``--user-data-dir=<tmp>`` to keep the
smoke run's workspace separate from your own.

``PC_SMOKE_SYNC_APP=<component uuid>`` runs code and schema sync up to the *matching* stage (nothing is
written). ``PC_SMOKE_EDIT=<name>`` renames the first component of the first project through the editor
IPC (writes YAML — use a scratch copy of the project). The JSON report is printed after
``PC_SMOKE_RESULT``. The same works with the packaged app binary, e.g.
``"apps/desktop/dist/mac-arm64/Product Creator.app/Contents/MacOS/Product Creator" <folder>``.

.. note::
   Opening a folder for the first time writes ``product-creator.yml`` and ``*.pc.yml`` into it. For
   experiments with other repositories use a copy (``git clone --local <repo> /tmp/copy``).

Documentation
-------------

.. code-block:: bash

   cd docs
   make venv     # once: docs/.venv with requirements.txt
   make html     # → docs/build/html/index.html

Conventions
-----------

* Work is tracked in YouTrack project ``PRODUCTCREATOR`` (https://ecooz.youtrack.cloud). Every commit
  message starts with the ticket id, e.g. ``PRODUCTCREATOR-6 Electron scaffold``.
* Branch ``main``; no force pushes.
* No ``any`` / ``ts-ignore`` — type the data (see ``DmmfModel``, ``SyncApiResponse``).
* New API route: add ``packages/core/src/http/routes/<path>/route.ts`` (Web ``Request``/``Response``)
  and register it in ``packages/core/src/http/router.ts``. No new stubs in the deprecated ``apps/pc``.
* Never commit ``node_modules``, ``apps/desktop/out`` or ``apps/desktop/dist``; never commit with a
  failing ``pnpm typecheck``.
