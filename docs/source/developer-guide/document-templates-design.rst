Document templates and fill procedures (design)
===============================================

Status: **decisions taken; first steps implemented** (ticket
`PRODUCTCREATOR-19 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-19>`_, steps
`PRODUCTCREATOR-28 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-28>`_ …
`PRODUCTCREATOR-30 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-30>`_). Items marked *exists*
are in the code; everything else is planned. This page replaces the first proposal, which introduced
a separate *feature* entity and Markdown sources.

Goal
----

Product Creator keeps the logic of an application in a form that both people and agents can check:

* **people** see the features and business objects of the product, how they relate and what a change
  affects (visualisation);
* **agents** check a plan cheaply before writing code: which fields an object has, whether an entry
  already exists, which features and workflows a change touches, whether the referenced types exist;
* **nobody can plan what cannot be built** — every write (UI, MCP, CLI) goes through the same
  validation, including object types.

Documents (ТЗ, specifications for clients and agents) are generated from this model later; they are
an output, not the source.

Decisions
---------

#. **YAML is the source of truth.** The catalog files (``features/``, ``business-objects/``,
   ``workflows/``, ``streams/``) are the raw data of the application: versioned with the code,
   readable in a diff, editable by hand, by the app and by agents. There is no Markdown or database
   layer in front of them. (*exists*)
#. **Function → Feature.** The former *function card* is a business capability, so it is renamed
   **Feature** to avoid confusion with functions in code. Field names stay; the folder is
   ``features/``; ``functions/`` is still read and ``product-creator migrate`` moves it. MCP accepts
   ``kind: function`` as an alias. (*exists*, PRODUCTCREATOR-28)
#. **No new "feature" entity.** Requirement-level content (requirements, acceptance criteria,
   decisions) will be added to the same Feature when the generator needs it, not as a parallel
   entity. One capability = one file.
#. **Code is linked, not mirrored.** Code sync links code functions to existing features
   (``source_file`` and ``calls`` stay the link to the implementation); a code function without a
   feature is a *candidate*, and a feature is created only on request. (*exists*, PRODUCTCREATOR-30)
#. **One validation in the core.** ``@pc/core/validation`` is used by the editor, MCP and the CLI:
   references of steps, compensations and ``calls`` to existing features; business object field
   types are scalars or existing objects; duplicate ids and names; id patterns; JSON Schemas. Streams
   are not validated yet. Saves that would add an error are rejected. (*exists*, PRODUCTCREATOR-29)
#. **Features declare the objects they use**: ``objects: [{id, access: read|write}]``, validated
   against the business objects. This is what impact analysis is built on. (*exists*)
#. **The document generator is a later step.** Rendering YAML into human pages and an agent bundle
   (manifest + chunks) comes after the model is reliable. Product Creator itself is not modelled in
   its own catalog yet.

What exists
-----------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Need
     - Where
   * - Visualise features and objects
     - Features, Objects, Workflows pages; feature page with *Implemented in*, business objects and
       *Impact*; Problems page; Graph and Matrix
   * - Check a plan (agent)
     - MCP ``validate_plan`` (proposed upserts/deletes → introduced errors), ``get_object`` (fields,
       types, features using it), ``find_duplicates``, ``impact_of_change``, ``validate_catalog``
   * - Reject invalid writes
     - Save routes (``rejectInvalidSave``), MCP ``create/update_catalog_entry``
   * - CI / terminal
     - ``product-creator lint`` (exit 1 on errors), ``product-creator migrate``
   * - Link to code
     - Code sync statuses ``linked`` / ``proposed`` / ``candidate`` / ``stale``; Prisma sync for
       business objects

Impact of a change
------------------

``impactOf(kind, id)`` (``packages/core/src/validation/plan.ts``):

* **business object** → features that read or write it (``objects``) and the features calling them,
  workflows with any of these features as a step or compensation, business objects with a field of
  its type;
* **feature** → features that call it (two levels), workflows that use it or its callers as a step or
  compensation, the features it calls and the objects it uses.

``validate_plan`` applies the proposed changes to a copy of the model and reports only the errors
the plan introduces, so an agent can check a whole plan (rename an object, add a field, add a
feature and its workflow) in one call before touching code.

Later: documents
----------------

Kept from the first proposal, now on top of the YAML model:

* **Two views from one source.** A *human view* (summaries, status, decisions, open questions, links)
  and an *agent view* (a manifest and small chunks per feature, component and interface group, with
  ids, contracts, code anchors and verification commands). Nothing is maintained twice.
* **Audience per field.** Schemas mark fields ``x-audience: human | agent | both``; the human renderer
  drops agent-only fields.
* **Stable ids as anchors** in both views: feature ids, object ids, operation refs
  ``<componentId>#<METHOD> <path>`` (:doc:`openapi-sync-design`).
* **Generated beats written.** What can be derived from code, OpenAPI, Prisma or history is generated;
  people write intent and decisions; agents draft, people approve.
* **Lint is the gate.** A document is ready when ``lint`` passes and a person approved it.
* **Templates and brands.** Built-in sets (``tz``, trace matrix, release notes) with per-project
  overrides and brands; output HTML/PDF first, DOCX later.

Planned order
-------------

#. Enums and other missing type kinds for business object fields; stream validation.
#. Trace through interfaces: ``interfaces.implements`` / ``interfaces.calls`` on features
   (:doc:`openapi-sync-design`) and their validation.
#. Requirement fields on Feature (requirements, acceptance with ``verify``), decision records.
#. Generator: agent bundle (manifest, chunks, size budget, MCP ``get_doc_manifest``), then the human
   renderer on the Doc page.
#. Modelling Product Creator itself in its catalog (dogfooding).

Open questions
--------------

#. Business object types: model Prisma ``enum`` as its own kind, or as a business object with
   values? Today an enum used as a field type is ``unknown_type``.
#. Existing catalogs whose feature ids do not follow ``<context>.<entity>.<action>`` (e.g. ids of
   generated cards): migrate the ids (with reference rewrite) or relax the pattern?
#. Moving a feature to another component through *save* is rejected as a duplicate id: add an
   explicit *move* operation?
#. Should code sync refresh ``calls`` of already linked features on every run, or only on *link*?
#. Language of generated documents (one per project, or human view in Russian and agent view in
   English)?
