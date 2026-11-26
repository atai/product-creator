Core package (@pc/core)
=======================

TypeScript sources consumed directly by both apps (``transpilePackages`` in Next.js, bundled by
electron-vite in the main process). Modules are imported by path: ``@pc/core/storage``,
``@pc/core/project/model`` ...

Storage
-------

``getStorage()`` returns a singleton ``FunctionStorage`` (TinyBase tables: functions, workflows, streams,
business_objects, projects, apps, events, edges).

* **Config mode** (web): ``configureStorage({ configRoot })`` — projects/apps are YAML files in
  ``<configRoot>/projects`` and ``<configRoot>/apps`` (default ``<cwd>/config``).
* **Manifest mode** (desktop): ``configureStorage({ manifest: toStorageEntities(projects) })`` — projects
  and components come from the project models; project/app CRUD over HTTP returns an error (the
  desktop editor uses ``project/model`` directly via IPC).
* ``resetStorage()`` closes watchers; the desktop calls it when the workspace changes.

Every app (service) has a ``directory`` with the catalog; ``functions/``, ``workflows/``, ``streams/``,
``business-objects/`` are loaded and watched.

Project model
-------------

YAML-as-database persistence of projects, services and libraries (see
:doc:`/user-guide/projects-and-services` for the file format).

``project/model.ts``

* ``openProject(root)`` — read the v2 files; on the first open import from the layout and write them;
  migrate a v1 ``product-creator.yml``. Returns ``{ project, origin: 'read' | 'imported' | 'migrated', notes }``.
  Refuses the home directory and the filesystem root.
* ``readProject(root)`` — read only (``null`` if there is no v2 file). Component files are searched
  below ``catalogRoot``; the folder of a component file is its catalog.
* Editor operations, each validating and writing YAML immediately: ``updateProject(root, patch)``,
  ``saveComponent(root, input)`` (create when ``id`` is missing; slug must be unique; kind change renames
  the file), ``deleteComponent(root, id)`` (removes the file and ``dependsOn`` references; catalog is
  kept), ``importNewComponents(root)`` (discovered folders whose ``path`` is not in the model).
* ``toStorageEntities(projects)`` — projects and apps for the storage; app id = component UUID,
  libraries get a ``(lib)`` suffix in the app name.
* Writes are atomic (temp file + rename).

``project/discovery.ts`` — ``discoverComponents(root)`` (pnpm / npm workspaces, kind heuristics,
Prisma schema, OpenAPI candidates filtered by ``git ls-files``, ``workspace:`` dependencies),
``slugify()``.

The desktop main process exposes the editor operations over IPC (``pc:editor:*`` in
``apps/desktop/src/shared/ipc.ts``); after every successful write the workspace is re-read and the
renderer reloads.

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
