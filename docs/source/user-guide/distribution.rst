Building distributables
=======================

Distributables are built with `electron-builder <https://www.electron.build>`_ from ``apps/desktop``
(configuration: ``apps/desktop/electron-builder.yml``).

Local build (current OS)
------------------------

.. code-block:: bash

   pnpm install
   pnpm desktop:dist

The output goes to ``apps/desktop/dist`` (git-ignored):

.. list-table::
   :header-rows: 1

   * - OS
     - Files
   * - macOS
     - ``product-creator-<version>-mac-<arch>.dmg``, ``.zip``, unpacked ``mac-<arch>/Product Creator.app``
   * - Windows
     - ``product-creator-<version>-win-<arch>.exe`` (NSIS installer), ``.zip``
   * - Linux
     - ``product-creator-<version>-linux-<arch>.AppImage``, ``.tar.gz``

``pnpm --filter desktop dist:dir`` only produces the unpacked app (faster, for testing).
electron-builder builds for the OS it runs on; cross-OS builds are done in CI.

CI (all operating systems)
--------------------------

The **CI** workflow (``.github/workflows/ci.yml``) runs on every push to ``main``, on pull requests and
manually (*Run workflow*):

1. **check** (Linux): ``pnpm typecheck``, ``pnpm lint``, ``pnpm test``, ``pnpm desktop:build`` and the
   Sphinx docs with warnings as errors;
2. **dist** (matrix macOS / Windows / Linux): ``pnpm desktop:dist``; the installers are uploaded as
   artifacts ``product-creator-macOS``, ``-Windows``, ``-Linux`` (kept 14 days).

Signing
-------

Builds are **unsigned** for now (``mac.identity: null``). Planned follow-up: macOS Developer ID signing
and notarization, Windows code signing, publishing releases and auto-update.
