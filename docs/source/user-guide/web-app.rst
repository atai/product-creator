Legacy web application
======================

The original Next.js app (``apps/pc``) uses the same core and the same catalog format. It reads
projects and apps from ``apps/pc/config/projects/*.yml`` and ``apps/pc/config/apps/*.yml`` (absolute
paths) instead of project folders.

.. code-block:: bash

   pnpm dev        # http://localhost:3067

It will be removed once the desktop app has feature parity (Projects page with sync UI).
