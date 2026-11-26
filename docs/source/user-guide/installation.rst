Installation
============

Requirements
------------

* Node.js 22+ and pnpm 11+ (the repository uses pnpm workspaces)
* macOS, Linux or Windows (Electron)
* Python 3.13+ only if you want to build this documentation (Sphinx 9.2)

Install a build
---------------

Unsigned installers for macOS (``.dmg`` / ``.zip``), Windows (``.exe`` installer / ``.zip``) and Linux
(``.AppImage`` / ``.tar.gz``) are produced by CI: open the latest successful **CI** run of
https://github.com/atai/product-creator/actions and download the ``product-creator-<OS>`` artifact.
See :doc:`distribution` to build them yourself.

Because the builds are not signed yet:

* **macOS** — the first start is blocked by Gatekeeper: right-click the app → **Open**, or run
  ``xattr -dr com.apple.quarantine "/Applications/Product Creator.app"``;
* **Windows** — SmartScreen shows *Windows protected your PC*: **More info** → **Run anyway**;
* **Linux** — ``chmod +x product-creator-*.AppImage`` and run it.

The installed app starts with the remembered workspace (empty on the first start): use
**File → Open Project Folder…**, or pass folders on the command line, e.g.
``open -a "Product Creator" --args ~/git/repo`` on macOS.

Install from source
-------------------

.. code-block:: bash

   git clone git@github.com:atai/product-creator.git
   cd product-creator
   pnpm install
   pnpm desktop:build          # builds apps/desktop into apps/desktop/out

Command line launcher
---------------------

The desktop package provides the ``product-creator`` command (``apps/desktop/bin/product-creator.mjs``).
Link it globally once:

.. code-block:: bash

   cd apps/desktop
   pnpm link --global          # makes `product-creator` available in your shell

After that ``product-creator`` can be started from any project folder (see :doc:`launching`).
