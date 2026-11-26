Launching from a project folder
===============================

Product Creator is started *from the folder of the project* you want to document:

.. code-block:: bash

   cd ~/git/emperor-web-ui
   product-creator                      # opens the current folder

   product-creator ~/git/repo-a ~/git/repo-b   # opens several projects at once

Without the global launcher (from the Product Creator repository):

.. code-block:: bash

   # development mode (hot reload of the UI)
   pnpm desktop -- --project ~/git/emperor-web-ui

   # built app
   pnpm desktop:build
   pnpm --filter desktop start -- --project ~/git/emperor-web-ui

``--project <folder>`` can be repeated. In development, when no folder is given and the workspace is
empty, the folder where the command was run is used (``INIT_CWD`` for pnpm scripts; the ``PC_PROJECT``
environment variable is also supported). The installed app accepts folders as plain arguments and
otherwise starts with the remembered workspace.

The first open of a folder imports its services and libraries once and writes
``product-creator.yml`` and ``*.pc.yml`` files into it (see :doc:`projects-and-services`).

Several projects at once (workspace)
------------------------------------

Opened folders form the **workspace**. It is remembered between runs (stored in the application data
folder, e.g. ``~/Library/Application Support/Product Creator/workspace.json`` on macOS).

* **File → Open Project Folder…** (``Cmd/Ctrl+O``) adds folders.
* The **Workspace** page (gear icon in the header) lists projects with their services and libraries, is
  the editor of the project model and lets you close a project.
* Running ``product-creator <folder>`` while the app is open adds the folder to the running window.

The **Apps** selector in the header lists all components of all opened projects as
``<project>: <name>`` (libraries are marked ``(lib)``); catalog pages are filtered by the selected
component.
