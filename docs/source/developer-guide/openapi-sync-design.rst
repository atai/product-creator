Multi-project sync via interface specifications (design)
========================================================

Status: **design + first step** (ticket PRODUCTCREATOR-9).

Problem
-------

Features of a product are implemented across several services and often several repositories
(e.g. Emperor ``frontend`` calls ``integrations/youtrack``). A feature in one service must be
traceable to the interface it uses and to the feature that implements that interface in another
service/project. Contract changes must surface as broken traces.

Model
-----

.. mermaid::

   flowchart LR
     FA["Feature<br/>(service A)"] -- "calls" --> OP["Operation<br/>B#POST /issues"]
     OP -- "declared in" --> SPEC["openapi.json<br/>(service B)"]
     FB["Feature<br/>(service B)"] -- "implements" --> OP

* **Interface spec** — an OpenAPI 3.x / Swagger 2 document of a component (``openapi`` in its
  ``service.pc.yml``). Sources: **spec files committed in the repository** (import takes only files
  tracked by git) and/or the output of a **generate command** that Product Creator runs itself
  (``openapi.generate``, see :doc:`/user-guide/interfaces`).
* **Operation** — ``<METHOD> <path>`` (stable key) plus ``operationId``, summary, tags, deprecated.
* **Operation ref** — ``<componentId>#<METHOD> <path>``, e.g.
  ``61f70fc3-558a-43e8-aea8-1946caf1d9a7#POST /issues``. The component id is a UUID, unique across
  projects of the workspace and stable when the component is renamed.
* **Link** — on a feature:

  .. code-block:: yaml

     interfaces:
       implements: ["61f70fc3-558a-43e8-aea8-1946caf1d9a7#POST /issues"]
       calls: ["1432afef-c4cd-4f46-9e15-534df62f7710#GET /repos/{id}"]

Implemented (first step)
------------------------

* ``@pc/core/interfaces/openapi``: ``loadOpenApiSpec(file)`` → operations; types ``InterfaceOperation``,
  ``InterfaceSpec``, ``InterfaceLink``, ``operationRef()``.
* Component model carries ``openapi`` paths (``*.pc.yml``; import takes committed files).
* ``GET /api/interfaces?app=`` and the **Interfaces** page.
* Generation of specs by a configured command (``interfaces/generator.ts``), Workspace actions
  *Generate OpenAPI* / *Generate all*, auto-detection of ``package.json`` scripts on import.

Next steps
----------

1. Add ``interfaces`` to ``feature.schema.json`` and the feature form (pick operations).
2. Auto-link: ``apis`` of a card (method + path) ↔ operations of its own service → ``implements``;
   code analysis of HTTP clients (fetch/axios/generated clients) → ``calls`` candidates.
3. Trace report per workspace: operations without implementing feature, features without spec,
   ``calls`` to missing/deprecated operations, cross-project dependency graph.
4. Spec change detection (hash per operation, like Prisma sync) with update/skip/delete actions.
5. Include the trace in the generated ТЗ (Doc page / Sphinx export).

Open questions
--------------

* Generated specs — decided: a per-component generate command run by Product Creator (PRODUCTCREATOR-23).
  Open: generate automatically before a trace report / on file changes instead of on demand.
* Non-HTTP interfaces (events, AsyncAPI, MCP tools) — same link model with another spec loader?
* Versioning of operation refs across releases.
