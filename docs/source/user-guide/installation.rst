Installation
============

Requirements
------------

* Node.js 22+ and pnpm 11+ (the repository uses pnpm workspaces)
* macOS, Linux or Windows (Electron)
* Python 3.11+ only if you want to build this documentation

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
