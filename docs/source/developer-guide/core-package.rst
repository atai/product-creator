Core package (@pc/core)
=======================

TypeScript sources bundled by electron-vite in the desktop main process. Modules are imported by path:
``@pc/core/storage``, ``@pc/core/project/model`` ...

Storage
-------

``getStorage()`` returns a singleton ``FunctionStorage`` (the class name is historical; TinyBase tables:
features, workflows, streams, business_objects, projects, apps, events, edges). Feature methods:
``getAllFeatures``, ``getFeatureById``, ``saveFeature``, ``getFeaturesOfApp``; the old
``getAll``/``getById``/``save`` remain as deprecated aliases. ``modelSnapshot()`` feeds validation;
``configureStorage({ watch: false })`` disables the watcher (CLI).

* **Manifest mode** (desktop): ``configureStorage({ manifest: toStorageEntities(projects) })`` — projects
  and components come from the project models; project/app CRUD over HTTP returns an error (the
  desktop editor uses ``project/model`` directly via IPC).
* **Config mode** (legacy ``configRoot``): ``configureStorage({ configRoot })`` — projects/apps are YAML
  files in ``<configRoot>/projects`` and ``<configRoot>/apps`` (default ``<cwd>/config``). Kept for
  callers that do not pass a manifest.
* ``resetStorage()`` closes watchers; the desktop calls it when the workspace changes.

Every app (service) has a ``directory`` with the catalog; ``features/`` (and the legacy ``functions/``),
``workflows/``, ``streams/``, ``business-objects/`` are loaded and watched. chokidar 4 has no globs, so
the watcher watches the app directories and filters catalog folders and ``*.yml`` files;
``whenWatching()`` resolves when it is ready.

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

``interfaces/generator.ts`` — OpenAPI generation (PRODUCTCREATOR-23):

* ``runOpenApiGenerate(project, component, { onLog, env, signal })`` — spawns ``openapi.generate.command``
  with ``shell: true`` in ``cwd`` (default: component path; must be inside the project root), as a detached
  process group so that timeout / cancel kill the whole tree (``taskkill /T`` on Windows). stdout/stderr
  are streamed to ``onLog`` and kept (last 200 kB). The result state is ``ok`` / ``failed`` / ``timeout`` /
  ``cancelled``; exit code 0 additionally requires that all listed spec files exist and parse
  (``operations`` = number of operations found).
* ``OpenApiGenerationManager`` — status per component id, no parallel runs of one component,
  ``generate`` / ``generateAll`` (sequential) / ``cancel``, ``info(project)`` (spec file status: exists,
  mtime, operations) and an event stream (``status`` / ``log``) for the UI.
* ``buildEnv`` adds ``node_modules/.bin`` of the cwd chain and common tool dirs to PATH and sets ``CI=1``;
  ``loginShellPath()`` resolves the PATH of the user's login shell (the desktop app does this on start).
* Config helpers in ``project/model.ts``: ``normalizeGenerate`` (single line command, timeout 1–3600,
  ``cwd`` inside the project), ``assertInsideRoot``. Detection in ``project/discovery.ts``:
  ``detectOpenApiGenerator``.

The desktop main process exposes the editor operations over IPC (``pc:editor:*`` in
``apps/desktop/src/shared/ipc.ts``); after every successful write the workspace is re-read and the
renderer reloads. Generation uses ``pc:openapi:info|generate|generate-all|cancel`` and pushes
``pc:openapi:event`` (log chunks and status changes) to the renderer.

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
       (aliases ``/api/features``, ``/api/feature``, ``/api/save-feature``)
     - features
   * - ``GET /api/business-objects?app=&hierarchical=`` / ``POST /api/save-business-object``
     - business objects
   * - ``GET /api/workflows`` / ``/api/workflow?id=`` / ``POST /api/save-workflow``
     - workflows
   * - ``GET /api/streams`` / ``/api/stream?id=`` / ``POST /api/save-stream``
     - streams
   * - ``GET /api/graph``
     - event graph
   * - ``POST /api/validate``
     - JSON Schema validation of a feature
   * - ``GET /api/validation?app=`` / ``POST /api/validate-plan``
     - model validation of the catalog / of proposed changes
   * - ``GET /api/impact?kind=&id=`` / ``GET /api/duplicates?kind=&name=&id=``
     - impact of a change / similar entries
   * - ``GET|POST /api/projects``, ``/api/projects/[id]``, ``GET|POST /api/apps``, ``/api/apps/[id]``
     - projects/apps (config mode only for writes)
   * - ``POST /api/apps/[id]/sync-code/{start,actions,execute}``, ``GET …/status/[syncId]``
     - code sync
   * - ``POST /api/apps/[id]/sync-schema/{start,actions,execute}``, ``GET …/status/[syncId]``
     - Prisma schema sync
   * - ``GET /api/interfaces?app=``
     - OpenAPI operations of services
