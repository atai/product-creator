Multi-project sync via interface specifications (design)
========================================================

Status: **design + first step** (ticket PRODUCTCREATOR-9).

Problem
-------

Features of a product are implemented across several services and often several repositories
(e.g. Emperor ``frontend`` calls ``integrations/youtrack``). A function card in one service must be
traceable to the interface it uses and to the function that implements that interface in another
service/project. Contract changes must surface as broken traces.

Model
-----

.. mermaid::

   flowchart LR
     FA["Function card<br/>(service A)"] -- "calls" --> OP["Operation<br/>B#POST /issues"]
     OP -- "declared in" --> SPEC["openapi.json<br/>(service B)"]
     FB["Function card<br/>(service B)"] -- "implements" --> OP

* **Interface spec** — an OpenAPI 3.x / Swagger 2 document of a service (``openapi`` in
  ``product-creator.yml``, or discovered).
* **Operation** — ``<METHOD> <path>`` (stable key) plus ``operationId``, summary, tags, deprecated.
* **Operation ref** — ``<appId>#<METHOD> <path>``, e.g. ``emperor-web-ui.integrations-youtrack#POST /issues``.
  ``appId`` is ``<projectId>.<serviceId>``, so refs work across projects of the workspace.
* **Link** — on a function card:

  .. code-block:: yaml

     interfaces:
       implements: ["emperor-web-ui.integrations-youtrack#POST /issues"]
       calls: ["emperor-web-ui.integrations-scm#GET /repos/{id}"]

Implemented (first step)
------------------------

* ``@pc/core/interfaces/openapi``: ``loadOpenApiSpec(file)`` → operations; types ``InterfaceOperation``,
  ``InterfaceSpec``, ``InterfaceLink``, ``operationRef()``.
* Service model carries ``openapi`` paths (manifest + discovery).
* ``GET /api/interfaces?app=`` and the **Interfaces** page.

Next steps
----------

1. Add ``interfaces`` to ``function.schema.json`` and the function form (pick operations).
2. Auto-link: ``apis`` of a card (method + path) ↔ operations of its own service → ``implements``;
   code analysis of HTTP clients (fetch/axios/generated clients) → ``calls`` candidates.
3. Trace report per workspace: operations without implementing function, functions without spec,
   ``calls`` to missing/deprecated operations, cross-project dependency graph.
4. Spec change detection (hash per operation, like Prisma sync) with update/skip/delete actions.
5. Include the trace in the generated ТЗ (Doc page / Sphinx export).

Open questions
--------------

* Source of truth for specs: generated ``dist/openapi.json`` (needs build) vs. committed spec files.
* Non-HTTP interfaces (events, AsyncAPI, MCP tools) — same link model with another spec loader?
* Versioning of operation refs across releases.
