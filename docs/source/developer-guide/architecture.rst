Architecture
============

Goal: an up-to-date specification (ТЗ) with a provable, end-to-end trace
**feature → code / schema / interface**, where a *feature* (formerly *function card*) is a
business capability in the YAML catalog.

.. mermaid::

   flowchart LR
     subgraph Desktop["apps/desktop (Electron)"]
       R["Renderer<br/>React pages"] -- "fetch('/api/*')<br/>→ window.pc.api (IPC)" --> P[Preload bridge]
       P --> M["Main process<br/>Workspace, editor IPC,<br/>menu, CLI args"]
     end
     M -- "dispatch(Request)" --> C
     subgraph C["packages/core (@pc/core)"]
       H["http/routes + router<br/>(Web Request/Response)"] --> S["storage<br/>TinyBase + chokidar"]
       H --> Y["sync: code parser,<br/>Prisma DMMF, OpenAPI"]
       PM["project/model<br/>product-creator.yml + *.pc.yml<br/>(one-time discovery)"]
     end
     S <--> F[("Project folders<br/>docs/product/&lt;component&gt;/*.yml")]
     PM <--> F
     Y --> SRC[("Code, prisma/schema.prisma,<br/>openapi.json")]

Key decisions
-------------

* **One core, one shell.** All domain logic and the API handlers live in ``@pc/core``. Handlers use
  only the Web ``Request``/``Response`` API and are dispatched in the Electron main process via
  ``http/router.ts``.
* **Renderer over IPC.** ``fetch('/api/*')`` is redirected to IPC (``src/renderer/src/api-bridge.ts``);
  navigation uses ``react-router`` (``HashRouter``) with small shims where pages still import
  ``next/navigation`` / ``next/link`` paths.
* **Files are the database.** Catalog entities are YAML files inside the documented project, versioned
  with its code. TinyBase is an in-memory index, chokidar keeps it in sync with the disk.
* **Files are the database for the project model too.** ``product-creator.yml`` (project) and
  ``service.pc.yml`` / ``library.pc.yml`` (components, one per catalog folder) are read on start and
  written by the editor. Discovery from the repository layout runs only on the first open (import) and on
  explicit *Import new from folder*.
* **Stable ids.** Projects and components are identified by UUIDs; slugs and names are editable.
* **Project = folder.** The desktop workspace is just a list of folders (``userData/workspace.json``).
  Storage runs in *manifest mode* (projects/apps come from the project models).
* **Security.** ``contextIsolation`` is on; the renderer has no Node access, only the typed ``window.pc``
  bridge (``src/shared/ipc.ts``).
