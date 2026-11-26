Architecture
============

Goal: an up-to-date specification (ТЗ) with a provable, end-to-end trace
**feature → function card → code / schema / interface**.

.. mermaid::

   flowchart LR
     subgraph Desktop["apps/desktop (Electron)"]
       R["Renderer<br/>React pages<br/>(ported from apps/pc)"] -- "fetch('/api/*')<br/>→ window.pc.api (IPC)" --> P[Preload bridge]
       P --> M["Main process<br/>Workspace, menu, CLI args"]
     end
     M -- "dispatch(Request)" --> C
     W["apps/pc (Next.js, legacy)"] -- "route.ts re-exports" --> C
     subgraph C["packages/core (@pc/core)"]
       H["http/routes + router<br/>(Web Request/Response)"] --> S["storage<br/>TinyBase + chokidar"]
       H --> Y["sync: code parser,<br/>Prisma DMMF, OpenAPI"]
       PM["project/manifest<br/>product-creator.yml + discovery"]
     end
     S <--> F[("Project folders<br/>docs/product/&lt;service&gt;/*.yml")]
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
* **Project = folder.** Projects/services come from ``product-creator.yml`` or discovery; the desktop
  workspace is just a list of folders (``userData/workspace.json``). Storage runs in *manifest mode*.
* **Security.** ``contextIsolation`` is on; the renderer has no Node access, only the typed ``window.pc``
  bridge (``src/shared/ipc.ts``).
