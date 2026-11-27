Architecture
============

Goal: an up-to-date specification (ТЗ) with a provable, end-to-end trace
**feature → code / schema / interface**, where a *feature* (formerly *function card*) is a
business capability in the YAML catalog.

.. mermaid::

   flowchart LR
     subgraph Desktop["apps/desktop (Electron)"]
       R["Renderer<br/>React pages<br/>(ported from apps/pc)"] -- "fetch('/api/*')<br/>→ window.pc.api (IPC)" --> P[Preload bridge]
       P --> M["Main process<br/>Workspace, editor IPC,<br/>menu, CLI args"]
     end
     M -- "dispatch(Request)" --> C
     W["apps/pc (Next.js, deprecated)"] -- "route.ts re-exports" --> C
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

* **One core, two shells.** All domain logic and the API handlers live in ``@pc/core``. Handlers use
  only the Web ``Request``/``Response`` API, so the same code runs as Next.js route handlers (web) and is
  dispatched in the Electron main process (desktop) via ``http/router.ts``.
* **Pages reused as-is.** The renderer contains the pages of the web app; ``next/navigation`` and
  ``next/link`` are aliased to small shims over ``react-router`` (``HashRouter``) and ``fetch('/api/*')``
  is redirected to IPC (``src/renderer/src/api-bridge.ts``).
* **Files are the database.** Catalog entities are YAML files inside the documented project, versioned
  with its code. TinyBase is an in-memory index, chokidar keeps it in sync with the disk.
* **Files are the database for the project model too.** ``product-creator.yml`` (project) and
  ``service.pc.yml`` / ``library.pc.yml`` (components, one per catalog folder) are read on start and
  written by the editor. Discovery from the repository layout runs only on the first open (import) and on
  explicit *Import new from folder*.
* **Stable ids.** Projects and components are identified by UUIDs; slugs and names are editable.
* **Project = folder.** The desktop workspace is just a list of folders (``userData/workspace.json``).
  Storage runs in *manifest mode* (projects/apps come from the project models).
* **apps/pc is deprecated.** It keeps compiling against ``@pc/core`` but gets no new features.
* **Security.** ``contextIsolation`` is on; the renderer has no Node access, only the typed ``window.pc``
  bridge (``src/shared/ipc.ts``).
