Feature catalog
===============

The catalog of a service lives in its ``catalog`` folder as YAML files, one entity per file, and is
versioned together with the code:

.. code-block:: text

   docs/product/<service>/
     features/           # features        (<context>.<entity>.<action>.yml)
     business-objects/   # business objects (data model)
     workflows/          # sequences of features
     streams/            # multi-stage business processes
     .sync-mapping.json  # code function ↔ feature mapping (written by code sync)

The YAML files are the source of truth: the app, the MCP server and the CLI read and write them, and
you can edit them by hand or review them in git.

Files are validated with JSON Schemas (``packages/core/schema/*.schema.json``) and reloaded
automatically when they change on disk.

.. _features:

Features
--------

A **feature** is one business capability of the product (what a user or another service can do) and
its link to the code. It used to be called a *function*; it was renamed so it is not confused with
functions in code.

.. code-block:: yaml

   id: crm.contacts.create
   name: Create contact
   bounded_context: crm
   entity: contacts
   action: create
   owner: sales-team
   lifecycle: implemented       # draft | approved | implemented | deprecated | removed
   description: Creates a CRM contact
   tags: [crm]
   emits: [contact.created]     # events → dependency graph
   consumes: []
   apis:
     - method: POST
       path: /api/crm/contacts
   calls: [database.database.getuserfromsession]   # features it uses
   source_file: app/api/crm/contacts/route.ts   # trace to the implementation
   objects:                     # business objects it reads or writes
     - id: contact
       access: write            # read | write
   code_refs:                   # other places of the implementation (UI, API, CLI), any component
     - component: web           # component slug
       file: pages/contacts/new.tsx
       role: UI
   tickets: [CRM-42]            # tracker issues; linked with tracker.issueUrl of product-creator.yml

``source_file`` and ``calls`` are the link to the implementation; :doc:`sync` fills them in.
``source_file`` is the main file in the feature's own component; a feature that also lives elsewhere
(a UI page in another component, a CLI command) lists those places in ``code_refs``.
``objects`` drives impact analysis: a change of a business object shows the features and workflows it
affects.

.. _lifecycle:

Lifecycle
~~~~~~~~~

Features and business objects have the same statuses. Each status has its own rules; the checks that
enforce them come with the design checks (`PRODUCTCREATOR-34
<https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-34>`_).

.. list-table::
   :header-rows: 1
   :widths: 14 30 56

   * - Status
     - Meaning
     - Rules
   * - ``draft``
     - Being worked out
     - Design problems are warnings, so planning is never blocked. In a spec: a *drafts* section, not
       a task for an agent.
   * - ``approved``
     - Spec agreed, ready to build
     - Description, at least one requirement, every requirement covered by acceptance, no open
       questions, no calls to draft features. The contract an agent builds against.
   * - ``implemented``
     - In the code
     - ``source_file`` exists; references only to implemented or deprecated entries; criteria
       without ``verify`` are a warning. Code that disappeared (stale in code sync) is an error.
   * - ``deprecated``
     - Still in the code, not for new work
     - New references to it are a warning; impact shows who still depends on it.
   * - ``removed``
     - Gone from the code, kept for history
     - Nothing may reference it. Left out of specs, the graph and the matrix.

.. _feature-spec:

Spec of a feature
~~~~~~~~~~~~~~~~~

The same file holds what the feature must do: the content of the specification (ТЗ) for people and
agents. All spec fields are optional; fill them as the feature matures.

.. code-block:: yaml

   actors: [sales manager, CRM import job]   # who uses the feature
   requirements:                # one testable statement per item
     - id: R1
       text: A manager creates a contact with name and e-mail
       priority: must           # must | should | could (default must)
     - id: R2
       text: A duplicate e-mail is rejected with a message naming the existing contact
   acceptance:                  # how to check that it is done
     - id: A1
       covers: [R1]             # requirement ids this criterion checks
       given: a manager on the contacts page
       when: they submit name and e-mail
       then: the contact is listed and contact.created is emitted
       verify: pnpm test -- contacts.create   # command or test that checks it (for agents)
     - id: A2
       covers: [R2]
       text: Creating a contact with an existing e-mail returns 409 and the existing id
   constraints:                 # non-functional, measurable where possible
     - id: C1
       kind: performance        # performance | security | reliability | compatibility | usability | compliance | other
       text: Responds in under 300 ms for 100k contacts
   decisions:                   # what was decided and why
     - id: D1
       decision: E-mail is unique per workspace, not globally
       reason: Agencies manage several clients with the same contacts
       date: 2026-11-28
       status: accepted         # accepted | superseded
   open_questions:              # not answered yet; an answered question becomes a decision
     - id: Q1
       question: Merge duplicates automatically on import?
       owner: product

Item ids are local to the feature and use a fixed prefix per list: ``R``, ``A``, ``C``, ``D``,
``Q`` followed by a number. Elsewhere they are referenced as ``<feature id>#R1``. Do not reuse the id
of a removed item. An acceptance criterion has ``then`` (with ``given`` / ``when``) or a one-sentence
``text``.

The feature form has a **Spec** section for these lists, and the feature page shows them. In the JSON
Schema every field is marked ``x-audience: human | agent | both``: the generated document for people
leaves out agent-only fields such as ``verify`` and ``source_file``.

Old ``functions/`` folders
~~~~~~~~~~~~~~~~~~~~~~~~~~

Catalogs with a ``functions/`` folder keep working: cards there are read as features, and a saved
card stays in the folder it came from. To move the files to ``features/``:

* in the app, **Workspace** shows a banner *Move to features/* for projects that still have the old
  folder;
* or in a terminal: ``product-creator migrate [project-folder] [--dry-run]``. The command moves the
  files of every component of the project and prints how many were moved; nothing changes inside
  the files. If ``features/`` already has a file with the same name and content, the old copy is
  removed; a file with different content is a conflict: it stays in ``functions/`` and is reported.

Business objects, workflows, streams
------------------------------------

* **Business objects** — fields, owner, lifecycle and physical tables; usually produced by
  :doc:`sync` from the Prisma schema and then enriched manually.
* **Workflows** — ordered ``steps`` (feature ids) with optional compensations, a ``lifecycle`` (the
  same statuses as features: a planned workflow is ``draft``), a ``description`` and ``tickets``.
  Business objects can carry ``tickets`` too.
* **Streams** — business processes with stages, entry/exit events, KPIs and workflows per stage.

Views
-----

* **Features / Objects / Workflows / Streams** — search, filter, create and edit. A feature page
  shows where it is implemented, the business objects it uses and what depends on it.
* **Problems** — validation errors and warnings of the catalog (see below), with links to the entries.
* **Presentation → Graph** — features and the links between them: ``calls`` (solid arrow), consecutive
  workflow steps (dashed, labelled with the workflow) and events (dotted, emits → consumes). Nodes are
  sized to their names and laid out in layers along the arrows; features without links are listed below.
* **Presentation → Matrix** — entity × action coverage per bounded context.
* **Presentation → Doc** — the specification (ТЗ) generated from the catalog, see :doc:`spec`.

.. _validation:

Validation
----------

The same checks run in the editor, in the MCP tools and in the CLI, so neither a person nor an agent
can plan something that cannot be built:

.. list-table::
   :header-rows: 1
   :widths: 28 12 60

   * - Code
     - Severity
     - Meaning
   * - ``schema``
     - error
     - The file does not match the JSON Schema of its kind
   * - ``id_pattern`` / ``id_mismatch``
     - error
     - An id does not match the pattern of its schema (features: ``<context>.<entity>.<action>``), or a
       feature id differs from its ``bounded_context`` / ``entity`` / ``action``
   * - ``duplicate_id``
     - error
     - Two files define the same id (in a project, per kind)
   * - ``duplicate_name``
     - warning
     - Two entries of the same kind have the same name
   * - ``unknown_feature``
     - error
     - A workflow step or compensation, or a feature's ``calls``, refers to a feature that does not exist
   * - ``unknown_object``
     - error
     - ``objects`` of a feature refers to a business object that does not exist
   * - ``unknown_type``
     - error
     - A business object field has a type that is neither a scalar (``string``, ``int``, ``DateTime``,
       ``uuid``, ``varchar(255)``, ``Json`` …, also with ``?`` or ``[]``) nor an existing business object
   * - ``compensation_not_in_steps``
     - warning
     - A workflow compensates a step it does not have
   * - ``duplicate_item_id``
     - error
     - Two items of one spec list of a feature (requirements, acceptance …) have the same id
   * - ``unknown_requirement``
     - error
     - An acceptance criterion ``covers`` a requirement id that the feature does not have

Streams are not validated yet.

**Saving is guarded.** When you save an entry (in the editor, or an agent through MCP) the catalog is
checked before and after the change. The save is rejected only if it *adds* an error, so a catalog
that already has problems stays editable. The form shows the errors; the *Check* button of the feature
form runs the check without saving.

**From a terminal:**

.. code-block:: bash

   product-creator lint                    # the project in the current folder
   product-creator lint ~/git/my-project --warnings
   product-creator lint --catalog docs/product/frontend --json

``lint`` exits with code 1 if there are errors (usable in CI). ``--catalog`` checks one catalog folder
without a project file.
