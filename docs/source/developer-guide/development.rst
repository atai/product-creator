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
   * - ``pnpm desktop:build`` / ``pnpm desktop:start``
     - Build ``apps/desktop/out`` / run the built app
   * - ``pnpm typecheck``
     - TypeScript checks of all packages (core, desktop, pc)
   * - ``pnpm dev`` / ``pnpm build`` / ``pnpm lint``
     - Legacy web app (port 3067)
   * - ``pnpm docs``
     - Build this documentation (``make -C docs html``)

.. warning::
   Do not run ``pnpm build`` (web) while ``pnpm dev`` is running — both write to ``apps/pc/.next``.

Smoke test of the desktop app
-----------------------------

The main process has a headless verification mode: it opens the given projects, calls API routes through
the same dispatcher as the UI, renders the window, optionally saves a screenshot and exits.

.. code-block:: bash

   cd apps/desktop && pnpm build
   PC_SMOKE_TEST=1 PC_SMOKE_ROUTE=/functions PC_SMOKE_SCREENSHOT=/tmp/pc.png \
     PC_SMOKE_SYNC_APP=emperor-web-ui.frontend \
     npx electron . --project ~/git/product-creator --project ~/git/emperor-web-ui

``PC_SMOKE_SYNC_APP`` runs code and schema sync of a service up to the *matching* stage (nothing is
written). The JSON report is printed after ``PC_SMOKE_RESULT``.

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
* New API route: add ``packages/core/src/http/routes/<path>/route.ts`` (Web ``Request``/``Response``),
  register it in ``packages/core/src/http/router.ts`` and add a re-export stub in
  ``apps/pc/app/api/<path>/route.ts``.
