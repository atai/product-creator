Roadmap
=======

Epic `PRODUCTCREATOR-5 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-5>`_ — Electron desktop
version of Product Creator.

.. list-table::
   :header-rows: 1

   * - Ticket
     - Scope
   * - `PRODUCTCREATOR-6 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-6>`_
     - Electron app scaffold, launch from project folder, CLI
   * - `PRODUCTCREATOR-7 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-7>`_
     - Port features via ``@pc/core`` + IPC
   * - `PRODUCTCREATOR-8 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-8>`_
     - Multi-service project model
   * - `PRODUCTCREATOR-9 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-9>`_
     - Multi-project workspace + OpenAPI cross-service sync
   * - `PRODUCTCREATOR-10 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-10>`_
     - This documentation
   * - `PRODUCTCREATOR-11 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-11>`_
     - Root README with links only
   * - `PRODUCTCREATOR-12 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-12>`_
     - YAML-as-database persistence + UI editor for projects, services, libraries
   * - `PRODUCTCREATOR-13 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-13>`_
     - Stable UUID ids
   * - `PRODUCTCREATOR-14 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-14>`_
     - Library component kind and dependencies
   * - `PRODUCTCREATOR-15 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-15>`_
     - Legacy Next.js ``apps/pc`` removed (was deprecated)
   * - `PRODUCTCREATOR-16 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-16>`_
     - Distributables: local + CI for macOS, Windows, Linux
   * - `PRODUCTCREATOR-17 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-17>`_
     - ESLint and unit tests
   * - `PRODUCTCREATOR-21 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-21>`_
     - Signing, notarization, GitHub Releases, auto-update, app icon, smaller package (:doc:`release`)
   * - `PRODUCTCREATOR-23 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-23>`_
     - OpenAPI generation command per component
   * - `PRODUCTCREATOR-18 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-18>`_
     - MCP server for local agents (:doc:`mcp`)
   * - `PRODUCTCREATOR-20 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-20>`_
     - Remote access: client of the Emperor MCP relay (:doc:`mcp`)
   * - `PRODUCTCREATOR-19 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-19>`_
     - Document templates (human / agent views) and fill procedures — design (:doc:`document-templates-design`)
   * - `PRODUCTCREATOR-28 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-28>`_
     - Rename *function* → *feature* (types, ``features/`` folder, UI, MCP alias, ``migrate`` command)
   * - `PRODUCTCREATOR-29 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-29>`_
     - Model validation, ``Feature.objects``, plan checks and impact (core, MCP, Problems page, ``lint``)
   * - `PRODUCTCREATOR-30 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-30>`_
     - Code sync links code functions to existing features (linked / proposed / candidate / stale)

Known gaps
----------

* Signed releases need the GitHub secrets from :doc:`release`; Windows builds stay unsigned by
  decision (no code-signing certificate). The app icon is a placeholder.
* Catalog entities (features, business objects) still use readable ids, not UUIDs.
* Doc page (generated ТЗ) is still a placeholder.
* Unit tests cover the core (project model, OpenAPI loader, validation, code matching), MCP and CLI;
  no UI tests yet.
* Business object field types do not model enums yet: a Prisma ``enum`` used as a field type is
  reported as ``unknown_type``.
