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
     - TypeScript checks of all packages (core, desktop, mcp)
   * - ``pnpm lint``
     - ESLint (``eslint.config.mjs``) for ``apps/desktop``, ``packages/core`` and ``packages/mcp``
   * - ``pnpm test``
     - Unit tests (vitest, ``packages/core/test``)
   * - ``pnpm docs``
     - Build this documentation with warnings as errors (``make -C docs html SPHINXOPTS=-W``)
   * - ``pnpm version:patch`` / ``version:minor`` / ``version:major`` / ``version:prerelease``
     - Release bump: sync every workspace ``package.json``, update ``CHANGELOG.md``, commit and tag
       (see :doc:`release`). Do not raise the release version by hand.
   * - ``pnpm version:status`` / ``version:current`` / ``version:set``
     - Show drift / root version / set an explicit version (same release flow)

Settings and data folders (dev vs. production)
----------------------------------------------

The app keeps ``workspace.json`` (the list of opened projects), ``settings.json`` (MCP server on/off,
scope, port and token — see :doc:`mcp`), ``mcp-actions.log``, logs (``logs/``) and the update cache in
Electron's ``userData`` folder. A development run must never share it with an installed build, so the
folder depends on how the app was started (``apps/desktop/src/main/userData.ts``, applied first thing in
``src/main/index.ts``, before the single-instance lock — a dev and an installed instance can run at
the same time):

.. list-table::
   :header-rows: 1

   * - OS
     - Production (installed app)
     - Development (``pnpm desktop``, ``electron .``, not packaged)
   * - macOS
     - ``~/Library/Application Support/Product Creator``
     - ``~/Library/Application Support/Product Creator Dev``
   * - Windows
     - ``%APPDATA%\Product Creator``
     - ``%APPDATA%\Product Creator Dev``
   * - Linux
     - ``~/.config/Product Creator`` (``$XDG_CONFIG_HOME``)
     - ``~/.config/Product Creator Dev``

Rules:

* ``PC_USER_DATA_DIR=<dir>`` overrides the folder in any build (tests, throw-away runs).
* An explicit ``--user-data-dir=<dir>`` switch is respected in development runs.
* Everything that is stored per app follows ``userData`` (workspace, logs, caches) — do not build paths
  from ``appData`` or the home directory directly.
* The folder is created on start. Existing data of the installed build is never touched by a dev run;
  if an older dev build wrote into the production folder, delete that ``workspace.json`` manually.

The decision is a pure function (``resolveUserDataDir``) covered by ``apps/desktop/src/main/userData.test.ts``
(``pnpm test``).

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
``PC_SMOKE_TEXT_FILTER`` prints matching lines of the page. Smoke runs use the development folder; set
``PC_USER_DATA_DIR=<tmp>`` to keep a run's workspace separate.

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
  message starts with the ticket id, e.g. ``PRODUCTCREATOR-6 Electron scaffold``. The release commit
  produced by ``pnpm version:*`` is the exception: ``chore(release): X.Y.Z`` (the version script uses
  that subject to find the previous release).
* Branch ``main``; no force pushes.
* No ``any`` / ``ts-ignore`` — type the data (see ``DmmfModel``, ``SyncApiResponse``).
* New API route: add ``packages/core/src/http/routes/<path>/route.ts`` (Web ``Request``/``Response``)
  and register it in ``packages/core/src/http/router.ts``.
* Never commit ``node_modules``, ``apps/desktop/out`` or ``apps/desktop/dist``; never commit with a
  failing ``pnpm typecheck``.
