Synchronisation with code and DB schema
=======================================

Sync from code
--------------

For a service with ``codeBasePath`` Product Creator parses the TypeScript sources, collects exported
functions (route handlers, hooks, services ...) and **links them to existing features**. A feature is
a business capability, so several code functions may implement it and the sync does not create one
feature per export.

.. list-table::
   :header-rows: 1
   :widths: 18 30 52

   * - Status
     - Default action
     - Meaning
   * - ``linked``
     - skip
     - A feature already points to this file (``source_file``) or the link is in the mapping
   * - ``proposed``
     - link
     - Exactly one feature without ``source_file`` matches by name or by entity and action
   * - ``candidate``
     - skip
     - No feature fits. Choose **create** to make a draft feature from the code, or link it by hand
       (set ``source_file`` of the feature)
   * - ``stale``
     - skip
     - A feature points to a file that no longer exists. **unlink** removes ``source_file``; the
       feature itself is never deleted or marked ``removed``

**link** sets ``source_file`` and adds the code dependencies to ``calls``; **create** writes a
``draft`` feature with an id derived from the path and name. Decisions are kept in
``.sync-mapping.json`` of the catalog, so the next sync starts from them.

Sync from DB schema (Prisma)
----------------------------

For a service with ``dbSchemaPath`` the Prisma models are matched with business objects (by mapping,
name or id; structure hash decides between *update* and *skip*). Prisma 7 schemas (connection URL in
``prisma.config.ts``) are supported. The mapping is stored in ``.sync-mapping.json`` of the catalog.

Both syncs are started from the service card on the *Projects* page: in the desktop app open
**Workspace → Sync code / schema…** (in the web app: the gear icon). The page shows progress, the matched
items with proposed actions, and executes the sync after confirmation.
Details: :doc:`/developer-guide/sync-algorithm`.
