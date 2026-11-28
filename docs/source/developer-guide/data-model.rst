Data model
==========

JSON Schemas: ``packages/core/schema``.

.. list-table::
   :header-rows: 1

   * - Entity
     - Schema
     - Id
   * - Feature (formerly *function card*)
     - ``feature.schema.json``
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

Spec fields of a feature (PRODUCTCREATOR-32, see :ref:`feature-spec`): ``actors``, ``requirements``
(``R<n>``, ``text``, ``priority``), ``acceptance`` (``A<n>``, ``covers``, ``given``/``when``/``then``
or ``text``, ``verify``), ``constraints`` (``C<n>``, ``kind``, ``text``), ``decisions`` (``D<n>``,
``decision``, ``reason``, ``date``, ``status``), ``open_questions`` (``Q<n>``, ``question``,
``owner``). Types: ``FeatureRequirement`` … ``FeatureQuestion`` and ``FEATURE_SPEC_LISTS`` in
``types.ts``. Schema fields carry ``x-audience: human | agent | both``; the shared Ajv instance
(``validation/schemas.ts``) registers it as an annotation keyword.

The feature repository (``repository/configs.ts``) keeps fields without a row column in an ``extra``
JSON column, so reading a card and saving it back never drops a field.

Trace fields of a feature: ``source_file`` (implementation), ``calls`` (features it uses),
``apis`` (exposed endpoints), ``emits``/``consumes`` (events), ``objects`` (``[{id, access: read|write}]``,
business objects it uses). Planned: ``interfaces.implements`` /
``interfaces.calls`` (operation references, see :doc:`openapi-sync-design`).

Types: ``Feature`` and ``FeatureObjectRef`` in ``packages/core/src/types.ts``; ``FunctionCard`` is a
deprecated alias. Files live in ``features/`` of a catalog; ``functions/`` is still read (see
``packages/core/src/catalog/migrate.ts``).

Model validation
----------------

``packages/core/src/validation`` checks the whole model, beyond the per-file JSON Schema:

* ``model.ts`` — ``validateModel(snapshot)`` returns issues
  ``{severity, code, kind, id, field, message, file, component}``: schema (Ajv, ``allErrors``),
  ``id_pattern``, ``id_mismatch``, ``duplicate_id`` (from ``BaseRepository.getDuplicateSources()``,
  repositories created with ``trackSources``), ``duplicate_name``, ``unknown_feature`` (steps,
  compensations, ``calls``), ``unknown_object`` (``objects``), ``unknown_type`` (BO field types: the
  ``SCALARS`` list of generic, SQL and Prisma types, with parameters, ``?``/``[]`` and ``enum<…>``, or
  a business object id/name), ``compensation_not_in_steps``, ``duplicate_item_id`` and ``unknown_requirement`` (spec lists of a
  feature). Schema messages summarise ``anyOf`` and quote the field description for patterns. Streams
  are skipped.
* ``plan.ts`` — ``applyPlan`` (upsert/delete on a copy of the snapshot), ``planIssues`` →
  ``{ok, introduced, existing}``, ``impactOf(kind, id)``, ``findDuplicates``.
* ``guard.ts`` — ``rejectInvalidSave`` used by the save routes: 400 with ``issues`` if the save
  introduces an error.

``storage.modelSnapshot()`` gives the input; the CLI ``lint`` and MCP ``validate_*`` use the same code.
