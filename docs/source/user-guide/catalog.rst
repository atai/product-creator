Feature catalog
===============

The catalog of a service lives in its ``catalog`` folder as YAML files, one entity per file, and is
versioned together with the code:

.. code-block:: text

   docs/product/<service>/
     functions/          # function cards  (<context>.<entity>.<action>.yml)
     business-objects/   # business objects (data model)
     workflows/          # sequences of functions
     streams/            # multi-stage business processes
     .sync-mapping.json  # Prisma model ↔ business object mapping (written by schema sync)

Files are validated with JSON Schemas (``packages/core/schema/*.schema.json``) and reloaded
automatically when they change on disk.

Functions
---------

A function card describes one business capability and its link to the code:

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
   calls: [database.database.getuserfromsession]
   source_file: app/api/crm/contacts/route.ts   # trace to the implementation

Business objects, workflows, streams
------------------------------------

* **Business objects** — fields, owner, lifecycle and physical tables; usually produced by
  :doc:`sync` from the Prisma schema and then enriched manually.
* **Workflows** — ordered ``steps`` (function ids) with optional compensations.
* **Streams** — business processes with stages, entry/exit events, KPIs and workflows per stage.

Views
-----

* **Functions / Objects / Workflows / Streams** — search, filter, create and edit.
* **Presentation → Graph** — functions connected by emitted/consumed events.
* **Presentation → Matrix** — entity × action coverage per bounded context.
* **Presentation → Doc** — placeholder for the generated specification (ТЗ) bundle.
