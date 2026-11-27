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

.. code-block:: yaml

   id: crm.contacts.create
   name: Create contact
   bounded_context: crm
   entity: contacts
   action: create
   owner: sales-team
   lifecycle: active            # draft | active | deprecated | removed
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

``source_file`` and ``calls`` are the link to the implementation; :doc:`sync` fills them in.
``objects`` drives impact analysis: a change of a business object shows the features and workflows it
affects.

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
* **Workflows** — ordered ``steps`` (feature ids) with optional compensations.
* **Streams** — business processes with stages, entry/exit events, KPIs and workflows per stage.

Views
-----

* **Features / Objects / Workflows / Streams** — search, filter, create and edit. A feature page
  shows where it is implemented, the business objects it uses and what depends on it.
* **Problems** — validation errors and warnings of the catalog (see below), with links to the entries.
* **Presentation → Graph** — features connected by emitted/consumed events.
* **Presentation → Matrix** — entity × action coverage per bounded context.
* **Presentation → Doc** — placeholder for the generated specification (ТЗ) bundle.

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
