Document templates and fill procedures (design)
===============================================

Status: **proposal, phase 1**, not implemented (ticket
`PRODUCTCREATOR-19 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-19>`_). Nothing on this page
exists in the code yet unless it says *exists*.

Goal
----

Generate the ТЗ and related documents from the project YAML using brandable templates with
per-project overrides (original scope of PRODUCTCREATOR-19). The documents are large and have two
audiences:

* **people** (customer, manager, reviewer) need only what they decide or check: summaries,
  decisions, status, open questions, and **links** to details;
* **agents** need everything to implement and verify: requirements with ids, acceptance criteria,
  contracts, anchors in code, verification commands, the trace.

So every document is defined by its audience, and one source renders into two layers.

What exists today (inputs)
--------------------------

* Project ``product-creator.yml`` (UUID, ``docs``, ``catalogRoot``), components ``service.pc.yml`` /
  ``library.pc.yml`` (UUID, paths, ``dependsOn``, Prisma schema, ``openapi`` specs and generate
  command).
* Catalog entries in ``<catalogRoot>/<component>/…``: function cards (``id``, ``lifecycle``,
  ``description``, trace fields ``source_file``, ``calls``, ``apis``, ``emits``/``consumes``),
  business objects, workflows, streams (:doc:`data-model`).
* Interfaces: OpenAPI operations per component, operation refs ``<componentId>#<METHOD> <path>``;
  planned ``interfaces.implements`` / ``interfaces.calls`` and a trace report
  (:doc:`openapi-sync-design`).
* Code sync and Prisma schema sync fill function cards and business objects from code.
* MCP tools (:doc:`mcp`): ``list_projects``, ``list_components``, ``list_catalog``,
  ``get_catalog_entry``, ``list_interfaces``, ``get_openapi_status``, ``sync_*_preview`` and write
  tools ``create/update_catalog_entry``, ``sync_*_apply``, ``generate_openapi``.
* The *Doc* page in the app is a placeholder.

**Gap.** Function cards describe *code*, not *what the product must do*. A ТЗ needs a
requirement-level entity: features with requirements, acceptance criteria and decisions. Today there
is nowhere to put "why", "must", "how we check".

Principles
----------

#. **One source, two views.** All content lives in YAML (plus a few hand-written Markdown pages).
   Templates render a *human view* and an *agent view*; nothing is maintained twice.
#. **Audience per field.** The schema of every entity marks each field ``x-audience: human | agent |
   both``. The human renderer drops agent-only fields; the agent renderer keeps everything except
   presentation (brand, layout).
#. **Stable ids and anchors.** Every addressable thing has an id that never changes and doubles as
   an anchor in both views (``F-…``, ``FR-…``, ``AC-…``, ``ADR-…``, function ids, operation refs).
#. **Generated beats written.** Whatever can be derived from code, OpenAPI, Prisma or status
   history is generated; people write intent, decisions and summaries; agents draft
   requirements/acceptance and fill links; people approve.
#. **Small chunks for agents.** The agent view is a set of chunks (one per feature, component,
   interface group) plus a manifest, so an agent loads only what it needs.
#. **Lint is the gate.** A document is "done" when the linter passes and a person approved it.

Document set
------------

H = people, A = agents, H+A = both views from one source.

.. list-table::
   :header-rows: 1
   :widths: 22 8 40 30

   * - Document
     - Audience
     - Content
     - Source
   * - Product overview / vision
     - H (+A short)
     - Problem, goals, users, scope / out of scope, success metrics. Agent view: a ≤ 1-page context
       chunk.
     - Hand-written ``overview.md`` + project yml
   * - Glossary
     - H+A
     - Terms with definitions; agents get it as a chunk to keep naming consistent.
     - ``glossary.yml`` (hand/agent)
   * - ТЗ of the project (system spec)
     - H+A
     - H: summary, components map, feature list with status/priority, decisions, open questions,
       links. A: the **manifest** (index of every chunk) + project constraints.
     - Generated from all entities
   * - Component spec
     - H+A
     - H: purpose, responsibilities, dependencies, its features, interface summary. A: paths,
       code base, dependencies, functions list, schema/spec files, build/test commands.
     - ``*.pc.yml`` + catalog (mostly generated)
   * - **Feature spec** (main unit)
     - H+A
     - H: one page — summary, value, status, priority, decisions, open questions, acceptance in
       plain words, links. A: requirements ``FR-…``, acceptance ``AC-…`` with verification, contracts
       (operations, business objects), anchors (functions, files), constraints, dependencies.
     - ``features/*.feature.yml`` (human stub → agent draft → human approval)
   * - Interface / API spec
     - A (+H summary)
     - A: operations per component chunked by tag, request/response schemas, who implements/calls
       them. H: table of operations and a link to the rendered OpenAPI.
     - Generated from OpenAPI + links
   * - Data model
     - H+A
     - H: business objects with meaning and relations (diagram). A: fields, types, constraints,
       Prisma mapping.
     - Business objects + Prisma (generated, descriptions by hand/agent)
   * - Acceptance & verification spec
     - A (+H report)
     - A: every ``AC-…`` with ``verify`` (test id, command, MCP check, manual step). H: verification
       report — passed/failed/not covered per feature.
     - Feature yml + verification results
   * - Trace matrix
     - H+A
     - Feature → requirement → acceptance → function/operation → file → test. H: coverage summary and
       gaps only. A: full JSON.
     - Generated
   * - Decision log (ADR)
     - H (+A short)
     - Context, decision, consequences, status. Agents get decision + constraint only.
     - ``decisions/NNNN-*.yml`` (hand/agent draft, human approval)
   * - Release notes / changelog
     - H
     - Features and requirements that changed status between versions, with tickets.
     - Generated from status history + tickets

The split principle
-------------------

Source → two renderers:

.. mermaid::

   flowchart LR
     Y["YAML source<br/>features, components,<br/>functions, interfaces,<br/>decisions"] --> L["lint + resolve links"]
     L --> H["Human renderer<br/>Nunjucks + brand"]
     L --> A["Agent renderer<br/>chunks + manifest"]
     H --> HO["Sphinx (RST/MD) → HTML<br/>PDF (Electron printToPDF)<br/>DOCX (pandoc, later)"]
     A --> AO["docs/agent/*.md<br/>YAML front-matter<br/>manifest.json"]
     A --> MCP["MCP: get_doc_manifest,<br/>get_feature_spec(view)"]

**Human layer** — concise and branded:

* summary, status, priority, owner, decisions, open questions, acceptance in plain language;
* no code: no file paths, function ids or schemas in the text; instead a link "Details for
  implementation" to the agent chunk and links to the ticket, code browser and OpenAPI viewer;
* size rules checked by lint: feature summary ≤ 3 sentences, feature page ≈ one screen
  (≤ 300 words without tables);
* formats: Sphinx (generated pages included into the project docs tree), HTML → PDF in the app,
  DOCX via pandoc later.

**Agent layer** — complete and machine-checkable:

* Markdown with YAML front-matter (readable by any agent without Product Creator), the same data as
  JSON through MCP;
* one chunk per feature / component / interface group / business-object group / decision set;
* front-matter carries ids, status, hashes, links and sizes so an agent can decide what to load:

.. code-block:: markdown

   ---
   id: F-relay-scope
   kind: feature
   title: Relay scope is the stricter of token and local setting
   status: verified
   component: [ec457b8f-…, 5b6d1c0e-…]
   depends: [F-relay-tunnel]
   requirements: [FR-relay-scope-01, FR-relay-scope-02]
   human_url: product/features/relay-scope.html#F-relay-scope
   source: docs/product/features/relay-scope.feature.yml
   hash: sha256:3f…
   tokens: 1840
   ---
   ## FR-relay-scope-01 (MUST)
   With local scope read-only, write tools are neither listed nor callable over the relay…
   ### AC-relay-scope-01a
   Given local scope read … When tools/list … Then no write tools.
   verify: test `packages/mcp/test/relay.test.ts` › "local read-only caps a READ_WRITE token"
   anchors: `packages/mcp/src/server.ts` › McpHttpServer.authenticate

**Links between layers.** Ids are anchors in both. Every human page links to its agent chunk
(path and MCP call ``get_feature_spec("F-…")``); every chunk has ``human_url``. A human page that
mentions a requirement shows its id as a small badge, so a reviewer and an agent talk about the same
``FR-…``.

Handling volume
---------------

* **Chunk = feature** (with its requirements and acceptance). Interfaces: one chunk per component
  per OpenAPI tag. Data model: one chunk per business-object group. Functions are not chunks; they
  are listed inside the component chunk and fetched with ``get_catalog_entry``.
* **Size budget** per chunk (estimated as characters / 4, stored in the manifest): target ≤ 4k
  tokens, lint warning above 8k, error above 16k → split the feature into sub-features or move
  details into referenced chunks (``see: [F-…]``).
* **Manifest** ``docs/agent/manifest.json``: one line per chunk (id, kind, title, status, path,
  depends, tokens, hash). About 30 tokens per entry, so 200 features ≈ 6k tokens. An agent reads the
  manifest, then the chunks it needs plus their ``depends`` closure.
* **Change detection:** the content hash per chunk lets agents and CI see what changed; the
  changelog is built from status changes.
* **Generated vs written:**

.. list-table::
   :header-rows: 1

   * - Generated (never edited by hand)
     - Written by people
     - Drafted by agents, approved by people
   * - component facts, functions, interfaces, data-model fields, trace matrix, manifest,
       verification report, release notes, chunk files
     - overview, goals, feature stubs (title, summary, value, priority), decisions, approvals
     - requirements, acceptance criteria, verify refs, anchors, descriptions of functions /
       business objects / operations, glossary entries

Source model additions
----------------------

New entity **feature** (``<catalogRoot>/features/<slug>.feature.yml``), audience in brackets:

.. code-block:: yaml

   id: 7c1e…                     # UUID (stable)
   key: F-relay-scope            # human-readable stable key, anchor   # both
   title: Relay scope is the stricter of token and local setting       # both
   summary: Remote agents never get more rights than the app allows.   # human
   value: Owner keeps control of writes from the desktop.               # human
   status: draft | review | approved | implemented | verified | dropped [both]
   priority: must | should | could                                     # both
   owner: atai                                                         # both
   tickets: [PRODUCTCREATOR-25]                                        # both
   components: [ec457b8f-…]                                            # both
   depends: [F-relay-tunnel]                                           # agent
   decisions: [ADR-0003]                                               # both
   open_questions: [ "…" ]                                             # human
   requirements:                                                       # agent; titles in human
     - id: FR-relay-scope-01
       type: functional | nonfunctional | constraint
       level: MUST | SHOULD | MAY
       text: With local scope read-only, write tools are neither listed nor callable over the relay.
       acceptance:
         - id: AC-relay-scope-01a
           plain: A remote agent cannot change a project while the app is read-only.   # human
           given: local scope read; READ_WRITE bot token
           when: initialize + tools/list over the relay
           then: 8 read tools, no write tools; calling a write tool fails
           verify:
             kind: test | command | mcp | manual
             ref: packages/mcp/test/relay.test.ts#local read-only caps a READ_WRITE token
             command: pnpm --filter @pc/mcp test
   implements:                                                         # agent
     functions: [mcp.server.authenticate]
     operations: []
     business_objects: []
   notes: …                                                            [agent] implementation hints, constraints

New entity **decision** (``decisions/NNNN-<slug>.yml``): ``key: ADR-0003``, title, status
(proposed/accepted/superseded), context, decision, consequences, ``constraints`` (agent), links.
Hand-written pages: ``overview.md`` and ``glossary.yml`` next to the catalog. Function cards get the
planned ``interfaces.*`` links (PRODUCTCREATOR-9) and an optional ``features: [F-…]`` back-link
(otherwise derived).

Fill procedures
---------------

Order (each step can start only when the previous one passes lint):

.. list-table::
   :header-rows: 1
   :widths: 5 25 20 50

   * - #
     - Document / step
     - Who
     - Required fields and gate
   * - 1
     - Project setup: overview, glossary, brand, language
     - person (agent may draft glossary)
     - overview: problem, goals, scope, out of scope. Gate: person.
   * - 2
     - Components, interfaces, data model, functions
     - auto (import, code / Prisma / OpenAPI sync — exists); agent writes descriptions
     - every component has purpose; every business object has description. Lint only.
   * - 3
     - Feature stub
     - person (or agent from a ticket, as ``draft``)
     - key, title, summary, value, priority, components, ticket.
   * - 4
     - Feature spec draft
     - agent (MCP ``fill_feature_spec`` returns the template with what is missing)
     - every MUST requirement has ≥ 1 acceptance; every acceptance has ``plain`` and ``verify``;
       status → ``review``.
   * - 5
     - Review gate
     - **person only** (UI)
     - status → ``approved``. Agents cannot set ``approved`` or ``verified``.
   * - 6
     - Implementation links
     - agent after coding
     - ``implements`` resolved (functions exist, operations exist, files exist); status →
       ``implemented``.
   * - 7
     - Verification
     - agent / CI runs the ``verify`` refs; result stored in ``verification/<date>.json``
     - all MUST acceptance passed → person confirms ``verified`` (or automatic, see open questions).
   * - 8
     - Decisions
     - person or agent draft
     - context, decision, consequences; accepted by a person.
   * - 9
     - Trace matrix, verification report, manifest, chunks, release notes, ТЗ export
     - auto (``product-creator docs build``)
     - lint clean; generated files up to date (CI check, like a lockfile).

**Lint** (``product-creator docs lint``, also an MCP tool and a CI step): JSON Schema of every
entity; ids unique and never reused (deleted ids are kept as tombstones); every reference resolves
(features, requirements, functions, operation refs, files, tests); MUST requirements have
acceptance; acceptance has verify; human fields contain no code paths; size limits (summary,
human page, chunk budget); generated files are up to date.

**MCP tools** (read scope unless marked):

* ``get_doc_manifest(project)`` — the manifest;
* ``list_features(project, status?)``, ``get_feature_spec(key, view: agent | human)``;
* ``get_trace(key | component)`` — trace rows for one feature or component;
* ``fill_feature_spec(key)`` — the template for the agent with filled and missing fields and lint
  hints (read);
* ``lint_docs(project, key?)`` — lint results;
* *write:* ``create_feature``, ``update_feature`` (patch; may set status up to ``review`` /
  ``implemented``), ``record_verification`` (results of verify runs), ``create_decision``;
* ``render_document(template, format)`` — later; rendering runs in the app.

Templates, branding and overrides
---------------------------------

Kept from the ticket, adjusted for two views:

* **Engine: Nunjucks** (template inheritance ``{% extends %}`` / ``{% block %}``, macros, filters;
  runs in Node; sandboxed: no file access from templates except partials of the same template
  set).
* **A template set** per document type has both views:
  ``template.yml`` (name, version, ``requires: [features, trace]``, params JSON Schema, outputs),
  ``human/*.njk``, ``agent/*.njk``, ``partials/`` (title page, change log, trace matrix, status
  badge).
* **Brand** applies to the human view only (``brand.yml``: logo, colours, fonts, company details,
  header/footer; several brands per project, one per client). The agent view has a fixed structure
  so agents can rely on it; projects may add fields but not remove required ones.
* **Three-level resolution**: built-in → project ``.product-creator/templates/<name>/`` →
  per-document override (``documents:`` in ``product-creator.yml`` picks template, brand, params
  per output). A file found higher replaces the built-in one; blocks can be overridden one by one
  via ``{% extends "builtin:tz/human/feature.njk" %}``.
* **Eject**: ``product-creator templates eject <name>`` (and a button) copies the set and writes
  ``extends: builtin/tz@1.2.0``; on update of the built-in set the app shows a 3-way diff
  (old built-in, new built-in, project copy).
* Built-in sets in v1: ``tz`` (project / component / feature, both views), ``feature-card``,
  ``trace-matrix``, ``verification-report``, ``release-notes``. A GOST 34.602 layout is a possible
  human variant of ``tz`` (open question).

Storage layout
--------------

.. code-block:: text

   packages/templates/                     built-in (shipped in the app)
     tz/template.yml  human/  agent/  partials/
     trace-matrix/ … release-notes/ …
     schema/feature.schema.json  decision.schema.json  template.schema.json  brand.schema.json

   <project>/
     product-creator.yml                   + documents:, language:, brands:
     .product-creator/
       templates/<name>/                   ejected / custom sets (override built-in files)
       brands/<brand>/brand.yml  logo.svg
     docs/product/                         catalogRoot (exists)
       overview.md  glossary.yml           hand-written
       features/<slug>.feature.yml         new
       decisions/NNNN-<slug>.yml           new
       <component>/…                       exists (functions, business objects…)
       verification/<date>.json            generated by record_verification
     docs/agent/                           generated agent view, committed
       manifest.json  features/F-*.md  components/*.md  interfaces/*.md
     docs/source/product/                  generated human view for Sphinx (or build output only)

Implementation plan (subtickets, rough order)
---------------------------------------------

#. **Schemas and storage**: feature, requirement, acceptance, decision; stable keys and tombstones;
   ``x-audience``; load/save in ``@pc/core``; tests.
#. **Lint** (core + CLI ``docs lint`` + MCP ``lint_docs``), CI step.
#. **Feature editor in the app** + review gate (status rules; only UI approves), MCP
   ``list_features`` / ``get_feature_spec`` / ``create/update_feature`` / ``fill_feature_spec``.
#. **Template engine** (Nunjucks, ``packages/templates``, ``template.yml`` contract, three-level
   resolution).
#. **Agent renderer**: chunks, manifest, size budget, hashes, "up to date" check, MCP
   ``get_doc_manifest``.
#. **Human renderer**: built-in ``tz`` set, Doc page preview, HTML + PDF (printToPDF), Sphinx output.
#. **Brand and eject** with version tracking and 3-way diff.
#. **Trace matrix and verification** (depends on ``interfaces.implements/calls`` from
   PRODUCTCREATOR-9 next steps): ``get_trace``, ``record_verification``, report.
#. **Release notes** from status history and tickets; DOCX via pandoc.
#. **Dogfooding and docs**: fill features of Product Creator itself (MCP, relay), User and Dev Docs.

Open questions
--------------

#. Language: human view in Russian (ТЗ for clients), agent view in English? Or one ``language``
   per project for both?
#. Is a new **feature** entity acceptable, rather than extending function cards?
#. Commit the generated agent view (``docs/agent/``) to the repository, so agents without the app
   can read it, or serve it only through MCP?
#. Formats for v1: HTML + PDF (acceptance criteria) enough, DOCX later?
#. Is a GOST 34.602 structure needed for formal ТЗ for some clients?
#. Review gate: only a person approves in the UI, agents go up to ``review`` / ``implemented``. OK?
#. Verification: should Product Creator run verify commands itself, or only list them for agents/CI
   and store results?
#. YouTrack: only ticket links, or also sync status of features with tickets?
#. Chunk budget numbers (4k target / 8k warning / 16k error) — OK?
