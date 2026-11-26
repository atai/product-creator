Core package (@pc/core)
=======================

TypeScript sources consumed directly by both apps (``transpilePackages`` in Next.js, bundled by
electron-vite in the main process). Modules are imported by path: ``@pc/core/storage``,
``@pc/core/project/manifest`` ...

Storage
-------

``getStorage()`` returns a singleton ``FunctionStorage`` (TinyBase tables: functions, workflows, streams,
business_objects, projects, apps, events, edges).

* **Config mode** (web): ``configureStorage({ configRoot })`` — projects/apps are YAML files in
  ``<configRoot>/projects`` and ``<configRoot>/apps`` (default ``<cwd>/config``).
* **Manifest mode** (desktop): ``configureStorage({ manifest: toStorageEntities(projects) })`` — projects
  and services come from project manifests; project/app CRUD returns an error (edit
  ``product-creator.yml``).
* ``resetStorage()`` closes watchers; the desktop calls it when the workspace changes.

Every app (service) has a ``directory`` with the catalog; ``functions/``, ``workflows/``, ``streams/``,
``business-objects/`` are loaded and watched.

Project model
-------------

``project/manifest.ts``: ``loadProject(root)``, ``discoverServices(root)``, ``toManifestYaml()``,
``toStorageEntities()``. App id of a service in desktop mode: ``<projectId>.<serviceId>``.

HTTP handlers
-------------

``http/routes/**/route.ts`` export ``GET``/``POST``/``PUT``/``DELETE`` handlers
``(request: Request, { params }) => Response``. ``http/router.ts`` contains the route table and
``dispatch(request)``. Main endpoints:

.. list-table::
   :header-rows: 1

   * - Endpoint
     - Description
   * - ``GET /api/workspace``
     - mode (web/desktop), projects, apps
   * - ``GET /api/index?app=`` / ``GET /api/card?id=`` / ``POST /api/save``
     - functions
   * - ``GET /api/business-objects?app=&hierarchical=`` / ``POST /api/save-business-object``
     - business objects
   * - ``GET /api/workflows`` / ``/api/workflow?id=`` / ``POST /api/save-workflow``
     - workflows
   * - ``GET /api/streams`` / ``/api/stream?id=`` / ``POST /api/save-stream``
     - streams
   * - ``GET /api/graph``
     - event graph
   * - ``POST /api/validate``
     - JSON Schema validation of a function card
   * - ``GET|POST /api/projects``, ``/api/projects/[id]``, ``GET|POST /api/apps``, ``/api/apps/[id]``
     - projects/apps (config mode only for writes)
   * - ``POST /api/apps/[id]/sync-code/{start,actions,execute}``, ``GET …/status/[syncId]``
     - code sync
   * - ``POST /api/apps/[id]/sync-schema/{start,actions,execute}``, ``GET …/status/[syncId]``
     - Prisma schema sync
   * - ``GET /api/interfaces?app=``
     - OpenAPI operations of services
