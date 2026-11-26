Synchronisation with code and DB schema
=======================================

Sync from code
--------------

For a service with ``codeBasePath`` Product Creator parses the TypeScript sources, collects exported
functions (route handlers, hooks, services ...) and matches them with existing function cards.
For every match you choose an action — **create**, **update**, **skip** or **delete** — and execute the
sync. Created cards get ``source_file`` and ``calls`` from the code.

Sync from DB schema (Prisma)
----------------------------

For a service with ``dbSchemaPath`` the Prisma models are matched with business objects (by mapping,
name or id; structure hash decides between *update* and *skip*). Prisma 7 schemas (connection URL in
``prisma.config.ts``) are supported. The mapping is stored in ``.sync-mapping.json`` of the catalog.

Both syncs are started from the service card on the *Projects* page: in the desktop app open
**Workspace → Sync code / schema…** (in the web app: the gear icon). The page shows progress, the matched
items with proposed actions, and executes the sync after confirmation.
Details: :doc:`/developer-guide/sync-algorithm`.
