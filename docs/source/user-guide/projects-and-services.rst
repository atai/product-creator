Projects, services and libraries
================================

A **project** is one repository. It consists of **components** of two kinds:

* **services** — deployable parts (``frontend``, ``integrations/*`` in Emperor, ``apps/desktop`` in
  Product Creator);
* **libraries** — shared packages used by services (``packages/*``).

Every component has its own feature catalog (features, business objects, workflows, streams) and,
optionally, a code base, a Prisma schema and OpenAPI specifications. Components can depend on each
other (``dependsOn``), usually a service on libraries.

YAML files are the database
---------------------------

Product Creator has no hidden database: everything is stored as YAML files in the project folder and
can be committed together with the code.

.. code-block:: text

   <project>/
     product-creator.yml                        # the project
     docs/product/                              # catalogRoot
       frontend/
         service.pc.yml                         # the "frontend" service
         features/  business-objects/  workflows/  streams/
       packages/shared/
         library.pc.yml                         # the "shared" library
         features/ ...
       integrations/youtrack/
         service.pc.yml

The folder that contains ``service.pc.yml`` / ``library.pc.yml`` *is* the catalog of the component.
Component folders can be nested anywhere below ``catalogRoot``.

First open: one-time import
---------------------------

When a folder without ``product-creator.yml`` is opened for the first time, the model is imported
**once** from the repository layout and written to the files above:

1. package globs are read from ``pnpm-workspace.yaml`` (or ``workspaces`` in ``package.json``);
2. every matching folder with a ``package.json`` becomes a component; folders under ``packages/``,
   ``libs/``, ``shared/`` or ``common/`` become **libraries**, the others **services**;
3. ``workspace:`` dependencies in ``package.json`` become ``dependsOn`` links;
4. ``prisma/schema.prisma`` is used as the DB schema;
5. OpenAPI: spec files (``openapi.{yaml,yml,json}``, ``docs/openapi.*``, ``api/openapi.*``,
   ``public/openapi.json``) are taken **only if committed to git**; if ``package.json`` has a script that
   generates the spec (``openapi:generate``, ``generate:openapi``, ``openapi``, ``swagger``,
   ``docs:generate`` or another script with *openapi*/*swagger* in its name, or a ``build`` script
   that mentions openapi) the **generate command** is prefilled (``pnpm run <script>``; ``npm``/``yarn``
   by lock file) and its output (``dist/openapi.json`` unless the script says ``-o <file>``) is added to the
   specs — see :doc:`interfaces`;
6. the catalog folder is ``docs/product/<component path>`` (existing catalogs there are reused).

A repository without workspaces becomes a single service. After the import, the folder layout is no
longer scanned on start: the YAML files are the source of truth and are edited in the app. New
packages are added with **Import new from folder** (only folders that are not in the model yet).

The home directory and the filesystem root are never imported.

Editing in the app
------------------

Open the **Workspace** page (gear icon in the header). For every project:

* **Edit project** — name, slug, description, Sphinx docs folder, catalog root;
* **Add service** / **Add library** — creates ``service.pc.yml`` / ``library.pc.yml`` in
  ``<catalogRoot>/<path>`` (or the folder you enter);
* **Edit** a component — name, slug, kind, source path, code base, Prisma schema, OpenAPI specs,
  dependencies; changing the kind renames ``service.pc.yml`` ↔ ``library.pc.yml``;
* **Remove** — deletes only the component file (the catalog content stays) and removes references
  to it from other components;
* **Import new from folder** — adds components found in the layout that are not in the model.

Every save writes the YAML files first; the app then re-reads the workspace.

Stable ids (UUID)
-----------------

Projects and components are identified by a **UUID** generated once (on import or creation). It never
changes; ``name`` and ``slug`` can be renamed freely. All references use the UUID: ``dependsOn``, the
**Apps** selector and URLs (``?app=<uuid>``), and interface references
(``<componentId>#<METHOD> <path>``, see :doc:`interfaces`).

File format
-----------

``product-creator.yml`` (paths relative to the project root):

.. code-block:: yaml

   version: 2
   id: 6dcfe14b-038a-4485-b60f-bf3531d714df
   slug: emperor
   name: Emperor
   description: ERP/CRM
   docs: docs                   # Sphinx docs folder of the project
   catalogRoot: docs/product    # folder with component catalogs
   # product context of the spec (all optional; edited in Workspace → Edit project or via MCP update_project)
   vision: One place where the product is planned and checked
   goals:
     - id: G1                   # G1, G2, …
       text: Planning errors are visible before code is written
   actors:                      # features refer to actors by id
     - id: product_owner        # a-z, 0-9, _
       name: Product owner
       description: Plans features and approves specs
   glossary:
     - term: Feature
       definition: A business capability of the product
   tracker:
     issueUrl: https://example.youtrack.cloud/issue/{id}   # tickets of entries link here

``checks`` (advisory or strict design checks, per-check overrides, see :ref:`design-checks`), ``spec``
(language, output folder) and ``screenshots`` (how screenshots of the UI are captured) configure
the generated specification, see :doc:`spec`.

The product context is the first part of a generated spec: why the product exists, what it aims at,
who uses it and the words it uses. Goal ids, actor ids and glossary terms must be unique; the tracker
URL must contain ``{id}``.

``docs/product/frontend/service.pc.yml``:

.. code-block:: yaml

   id: 409c4b2b-cf45-4516-b363-ab66ef4e5b47
   slug: frontend
   name: Web UI
   description: Next.js front end
   path: frontend                         # source folder
   codeBasePath: frontend/src             # analysed by "sync from code" (default: path)
   dbSchemaPath: frontend/prisma/schema.prisma
   openapi:                               # committed spec files (list) ...
     - frontend/openapi.yaml
   dependsOn:
     - 8974bf01-4559-4951-98f3-94ee7dcd0013   # UUID of a library

A service whose spec is produced by a command uses the object form of ``openapi``:

.. code-block:: yaml

   openapi:
     spec: integrations/youtrack/dist/openapi.json     # output of the command (string or list)
     generate:
       command: pnpm run generate:openapi              # executed as written
       cwd: integrations/youtrack                       # optional, default: the component's path
       timeoutSec: 120                                  # optional, default 120

All paths (including ``cwd``) are relative to the project root and must stay inside it.
``library.pc.yml`` has the same fields.

Migration from the first format
-------------------------------

A ``product-creator.yml`` without ``version: 2`` (inline ``services:`` list with slug ids) is migrated
automatically on open: UUIDs are generated, the old id becomes the ``slug``, ``dependsOn`` is resolved
to UUIDs, a component file is written into each catalog folder and the root file is rewritten.
Catalogs outside ``catalogRoot`` are placed in ``<catalogRoot>/<slug>`` (shown as a note on the
Workspace page). Review the result and commit it.
