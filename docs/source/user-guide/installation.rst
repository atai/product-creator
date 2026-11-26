Installation
============

Requirements
------------

* Node.js 22+ and pnpm 11+ (the repository uses pnpm workspaces)
* macOS, Linux or Windows (Electron)
* Python 3.13+ only if you want to build this documentation (Sphinx 9.2)

Install a release
-----------------

Download the installer for your OS from https://github.com/atai/product-creator/releases/latest:

.. list-table::
   :header-rows: 1

   * - OS
     - File
     - Install
   * - macOS (Apple silicon)
     - ``product-creator-<version>-mac-arm64.dmg``
     - open the DMG and drag **Product Creator** to *Applications*
   * - Windows
     - ``product-creator-<version>-win-x64.exe``
     - run the installer (per-user, the folder can be changed)
   * - Linux
     - ``product-creator-<version>-linux-x86_64.AppImage``
     - ``chmod +x product-creator-*.AppImage`` and run it

Release builds for macOS are signed with a Developer ID and notarized by Apple, so they open without
warnings. If a build is not signed (CI check builds, or a release made before the signing secrets were
configured):

* **macOS** — right-click the app → **Open**, or run
  ``xattr -dr com.apple.quarantine "/Applications/Product Creator.app"``;
* **Windows** — SmartScreen shows *Windows protected your PC*: **More info** → **Run anyway**
  (Windows builds are not code-signed yet).

Updates
~~~~~~~

An installed release checks for a new version at startup, downloads it in the background and installs
it when you quit the app. **File → Check for Updates…** checks on demand. The Linux ``.tar.gz`` does not
update itself; use the AppImage for that.

Development builds of every commit are available as artifacts ``product-creator-<OS>`` of the latest
successful **CI** run (https://github.com/atai/product-creator/actions); they are unsigned. See
:doc:`distribution` to build them yourself.

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
