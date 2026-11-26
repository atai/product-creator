Data model
==========

JSON Schemas: ``packages/core/schema``.

.. list-table::
   :header-rows: 1

   * - Entity
     - Schema
     - Id
   * - Function card
     - ``function.schema.json``
     - ``<context>.<entity>.<action>``
   * - Business object
     - ``business-object.schema.json``
     - ``[a-z0-9_.-]+``
   * - Workflow
     - ``workflow.schema.json``
     - ``workflow: <context>.<name>``
   * - Stream
     - ``stream.schema.json``
     - ``stream: <name>``
   * - Project (desktop)
     - ``product-creator.yml`` (``version: 2``)
     - UUID
   * - Service / library (desktop)
     - ``service.pc.yml`` / ``library.pc.yml``
     - UUID
   * - Project (web config, deprecated)
     - ``project.schema.json``
     - 5 chars
   * - App (web config, deprecated)
     - ``app.schema.json``
     - ``<projectId>-<suffix>``

Trace fields of a function card: ``source_file`` (implementation), ``calls`` (called functions),
``apis`` (exposed endpoints), ``emits``/``consumes`` (events). Planned: ``interfaces.implements`` /
``interfaces.calls`` (operation references, see :doc:`openapi-sync-design`).
