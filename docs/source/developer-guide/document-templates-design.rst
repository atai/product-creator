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
   are validated like workflows (PRODUCTCREATOR-43). Saves that would add an error are rejected. (*exists*, PRODUCTCREATOR-29)
#. **Features declare the objects they use**: ``objects: [{id, access: read|write}]``, validated
   against the business objects. This is what impact analysis is built on. (*exists*)
#. **The document generator is a later step.** Rendering YAML into human pages and an agent bundle
   (manifest + chunks) comes after the model is reliable.

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

Generator (PRODUCTCREATOR-35)
-----------------------------

``packages/core/src/spec`` (*exists*):

* ``build.ts`` — ``buildSpec(project, model, { language, mark })``: the spec as data in one language (product context, features, objects,
  workflows of the project; ``removed`` left out; issues per entry; callers, workflows, users).
* ``human.ts`` — ``renderHuman(spec, messages)``: one Markdown document.
* ``agent.ts`` — ``renderAgent``: ``manifest.json`` (format ``product-creator.spec/1``) and chunks per
  entry; chunks over ``CHUNK_BUDGET_BYTES`` are flagged.
* ``audience.ts`` — ``forAudience(value, schema, 'human' | 'agent')``: fields by ``x-audience``, in
  schema order, empty values dropped.
* ``messages.ts`` — label catalogs per language (``Messages``); ``messagesFor(tag)`` with fallback to
  English. No label is written in the renderers; a new language is a new catalog.
* ``index.ts`` — ``generateSpec``, ``specOutputDir`` (inside the project, not overlapping the catalog),
  ``writeSpec`` (replaces every ``<lang>/spec.md``, the old root ``spec.md`` and ``agent/``).
  ``generateSpec`` renders the human view once per project language (``projectLanguages``) and the agent
  bundle once, in the primary language.

Screenshots (PRODUCTCREATOR-36, *exists*): ``packages/core/src/screens`` — ``screensRequest`` (screens of the
features), ``captureScreens`` (setup → start + ``readyUrl`` → capture → teardown, always stopping services,
cancellable), ``readScreensResult``; contract files ``screens.request.json`` / ``screens.json`` in
``<spec.output>/screens``. Commands run through ``packages/core/src/process/command.ts`` (``runCommand``,
``startBackground``, ``setCommandEnv`` for the login-shell PATH), shared with OpenAPI generation. The spec
model (``SpecFeature.screens``) embeds images and reports ``screen_missing`` / ``screen_failed`` warnings.
Routes: ``/api/screens`` (POST start, GET status/log, DELETE cancel), ``/api/spec?asset=`` (PNG as data URL
for the Doc page). Product Creator's own capturer: ``scripts/capture-screens.mjs`` → smoke mode
``PC_SMOKE_SCREENS`` → ``apps/desktop/src/main/screens.ts``. With ``screenshots.perLanguage`` the capture
runs per language (``PC_SCREENS_LANGUAGE``, images in ``screens/<lang>/``); the capturer passes it on as
``PC_UI_LANGUAGE``.

Languages (PRODUCTCREATOR-37, *exists*)
---------------------------------------

Two independent parts.

**Content and specs.** ``languages`` in ``product-creator.yml`` (``projectLanguages`` / ``primaryLanguage``
in ``project/model.ts``; the older ``spec.language`` is a one-language fallback). The schemas mark
translatable fields with ``x-translatable: true`` (registered in the shared Ajv vocabulary next to
``x-audience``); list items are keyed by ``id``, or by the property named in ``x-i18n-key`` (business
object fields: ``name``; glossary: ``term``). ``packages/core/src/i18n``:

* ``text.ts`` (no Node imports, also used by the renderer) — ``translatablePaths(schema)``,
  ``primaryTexts``, ``localize(entry, schema, lang, primary, mark?)``.
* ``index.ts`` — ``fingerprint`` (sha256, 8 hex), ``stampTranslations(previous, next, schema)`` run by every
  save (``storage.save*``, ``updateProject``): a new or changed translation gets the fingerprint of its
  primary text in ``i18n.<lang>._source``; ``translationProblems`` → the design checks
  ``translation_stale``, ``translation_orphan``, ``translation_unknown_language``.

The renderer's ``components/TranslationEditor.tsx`` (``useProjectLanguages``, ``LanguageTabs``,
``TranslationEditor``) edits ``i18n`` next to the normal form of features, business objects, workflows and
the project.

**Interface.** The app language is a user setting (``settings.json`` → ``uiLanguage``:
``system | en | ru | de``), resolved by ``resolveUiLanguage`` in ``apps/desktop/src/main/i18n.ts``
(``PC_UI_LANGUAGE``, the setting, the OS languages, English). The main process has its own small catalog
(``tm``: menu, dialogs, notifications). The renderer loads the language over IPC (``pc:ui:language``)
before the first render; ``t(key, params)`` reads ``renderer/src/i18n/{en,ru,de}.ts``. A change reloads the
windows. ``i18n/i18n.test.ts`` fails when a catalog misses a key or a page has a hard-coded text (JSX text
or a ``placeholder``/``title``/``label``/… attribute).

**Adding a language.** Interface: a catalog ``renderer/src/i18n/<tag>.ts`` with every key of ``en.ts``,
an entry in ``UI_LANGUAGES`` and the main catalog in ``main/i18n.ts``. Spec labels: a ``Messages`` catalog
in ``packages/core/src/spec/messages.ts``. Content languages need no code: any BCP 47 tag works in
``languages``; without spec labels the headings are English.

Entry points: ``/api/spec`` (GET: human view or ``entry`` of the bundle; POST: write), CLI
``product-creator spec``, MCP ``get_spec``, the Doc page (``react-markdown``, raw HTML not rendered).
Settings: ``languages`` and ``spec.output`` in ``product-creator.yml``.

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

Epic `PRODUCTCREATOR-31 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-31>`_: specs for people
and agents from a validated model, dogfooded on this repo.

#. Spec fields on Feature: actors, requirements, acceptance with ``verify``, constraints, decisions,
   open questions, ``x-audience`` (`PRODUCTCREATOR-32 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-32>`_).
   Comes first, so the project is modelled in the right schema.
#. Modelling Product Creator itself in its catalog; catalog lint in CI
   (`PRODUCTCREATOR-33 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-33>`_).
#. Design checks: architecture (``calls`` vs ``dependsOn``, cycles), events, object usage, lifecycle
   consistency, completeness, code links, enums, streams; warnings in ``draft``, errors from
   ``approved`` on (`PRODUCTCREATOR-34 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-34>`_).
#. Generator: agent bundle and human view on the Doc page, unresolved problems rendered next to the
   affected feature (`PRODUCTCREATOR-35 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-35>`_,
   *exists*; label translations other than English, scoped specs and PDF later).
#. Trace through interfaces: ``interfaces.implements`` / ``interfaces.calls`` on features
   (:doc:`openapi-sync-design`, PRODUCTCREATOR-9); templates and brands (PRODUCTCREATOR-19).

Open questions
--------------

#. Business object types: model Prisma ``enum`` as its own kind, or as a business object with
   values? Today an enum used as a field type is ``unknown_type``.
#. Existing catalogs whose feature ids do not follow ``<context>.<entity>.<action>`` (e.g. ids of
   generated cards): migrate the ids (with reference rewrite) or relax the pattern?
#. *(answered, PRODUCTCREATOR-34)* ``apply_plan`` / ``validate_plan`` treat an upsert into another
   component as a move. Before: moving a feature to another component through *save* was rejected as a duplicate id: add an
   explicit *move* operation?
#. Should code sync refresh ``calls`` of already linked features on every run, or only on *link*?
#. Language of generated documents (one per project, or human view in Russian and agent view in
   English)?
