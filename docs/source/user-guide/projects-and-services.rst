Projects and services
=====================

A **project** is one repository. It consists of one or more **services** — for a monorepo these are the
workspace packages (``frontend``, ``packages/*``, ``integrations/*`` in Emperor; ``apps/*`` and
``packages/*`` in Product Creator itself). Every service has its own feature catalog and, optionally,
a code base, a Prisma schema and OpenAPI specifications.

Discovery
---------

If the project has no ``product-creator.yml``, services are discovered automatically:

1. package globs are read from ``pnpm-workspace.yaml`` (or ``workspaces`` in ``package.json``);
2. every matching folder with a ``package.json`` becomes a service (id derived from its path, name from
   ``package.json``);
3. ``prisma/schema.prisma`` is used as the DB schema of the service;
4. OpenAPI files are detected: ``openapi.{yaml,yml,json}``, ``dist/openapi.json``, ``docs/openapi.*``,
   ``api/openapi.*``, ``public/openapi.json``;
5. the catalog folder is ``docs/product/<service path>``.

A repository without workspaces is a single service (``.``).

On the **Workspace** page press **Write product-creator.yml** to save the discovered model and adjust it.

product-creator.yml
-------------------

All paths are relative to the project root.

.. code-block:: yaml

   id: emperor
   name: Emperor
   description: ERP/CRM
   docs: docs                    # Sphinx docs folder of the project
   services:
     - id: frontend
       name: Web UI
       path: frontend            # service folder
       catalog: docs/product/frontend   # functions/, business-objects/, workflows/, streams/
       codeBasePath: frontend    # analysed by "sync from code" (default: path)
       dbSchemaPath: frontend/prisma/schema.prisma
       openapi:
         - frontend/public/openapi.json
     - id: youtrack
       path: integrations/youtrack
       openapi: integrations/youtrack/dist/openapi.json

Omitted fields are filled in by discovery rules (``catalog``, ``codeBasePath``, ``dbSchemaPath``,
``openapi``). If ``services`` is omitted, all services are discovered.

.. note::
   In the desktop app projects and services are read-only in the UI: edit ``product-creator.yml``.
   The legacy *Projects* page (project/app CRUD) only works in the web app.
