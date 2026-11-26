Legacy web application (deprecated)
===================================

.. warning::

   ``apps/pc`` is **deprecated**. It is kept in the repository as a static component and is no
   longer developed: no new features, no distributables, not part of the project model. Use the
   desktop app. The web app only keeps compiling against ``@pc/core`` (its API routes are thin
   re-exports of the core handlers).

The original Next.js app uses the same core and the same catalog format. It reads projects and apps
from ``apps/pc/config/projects/*.yml`` and ``apps/pc/config/apps/*.yml`` (absolute paths) instead of
project folders, and does not support the project / service / library editor or UUID ids.

.. code-block:: bash

   pnpm pc:dev        # http://localhost:3067
