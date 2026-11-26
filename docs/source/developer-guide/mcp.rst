MCP server
==========

Ticket `PRODUCTCREATOR-18 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-18>`_. Users: see the
User Docs page *MCP server for AI agents*.

Architecture
------------

.. code-block:: text

   agent ──HTTP──► McpHttpServer (127.0.0.1:<port>/mcp)      packages/mcp/src/server.ts
                      │  bearer token → Principal {id, scope}
                      │  session per initialize, bound to the Principal
                      ▼
                   McpServer (per session) + registerTools()  packages/mcp/src/tools.ts
                      │
                      ▼  McpHost (interface)                  packages/mcp/src/host.ts
                   apps/desktop/src/main/index.ts: workspace projects, core API dispatcher,
                   OpenApiGenerationManager

* ``packages/mcp`` (``@pc/mcp``) is TypeScript source bundled into the Electron main process, like
  ``@pc/core`` (``externalizeDeps.exclude`` in ``electron.vite.config.ts``). Its npm dependencies
  (``@modelcontextprotocol/sdk``, ``zod``, ``ws``) are also listed in ``apps/desktop/package.json``
  because electron-vite keeps them external.
* The package does not know Electron. It talks to the app through ``McpHost``: ``projects()`` (only
  the projects open in the workspace), ``api()`` (the same dispatcher the UI uses, so validation and
  storage code are shared), ``generation`` and ``changed()`` (the UI re-reads after writes).
* ``apps/desktop/src/main/mcp.ts`` (``McpController``) owns the lifecycle: ``apply()`` starts, stops or
  reconfigures the server from the settings; nothing is bound while the setting is off.
* ``apps/desktop/src/main/settings.ts`` (``SettingsStore``) persists ``settings.json`` in the user data
  folder (mode 0600; dev and installed builds use different folders, see :doc:`development`).

Security model
--------------

* Binds to ``127.0.0.1`` only; the ``Host`` header must be ``127.0.0.1``, ``localhost`` or ``[::1]``
  with the bound port (DNS rebinding).
* Every request needs ``Authorization: Bearer <token>`` (constant-time comparison). The token is
  ``pcmcp_`` + 32 random bytes; the scope belongs to the token (setting).
* A write tool is registered only for a ``write`` principal and checks the scope again when called.
* Sessions (``Mcp-Session-Id``) are bound to the caller; another caller gets ``404``. Changing the
  token, scope or port closes the sessions of local clients.
* Tools resolve the ``project`` argument against the open workspace only; component ids must belong to
  that project. Sync applies default actions with deletions turned into ``skip`` unless asked.
* Every tool call and rejected request is recorded by ``ActionLog`` (``mcp-actions.log``, rotated at
  5 MB, recent entries in memory for the Settings screen). Arguments are shortened.
* Responses use JSON (``enableJsonResponse``): one HTTP response per request, no long SSE streams.

Tools
-----

Defined in ``packages/mcp/src/tools.ts`` with ``define(name, {write?, input}, handler)``. Catalog
entries are addressed by ``kind`` (``function``, ``business_object``, ``workflow``, ``stream``) and map
to the core routes (``/api/index``, ``/api/business-objects``, ``/api/workflows``, ``/api/streams`` and
the ``/api/save*`` routes). Sync tools drive ``/api/apps/<id>/sync-code|sync-schema/{start,status,actions,execute}``:
*preview* stops at the ``matching`` stage; *apply* sets ``skip`` for ``delete`` actions (unless
``allow_delete``), executes and waits for ``completed`` (3 minute limit).

To add a tool: call ``define`` (mark ``write: true`` if it changes anything), keep the output compact,
add a case to ``packages/mcp/test/server.test.ts`` and a row to the User Docs table.

Tests
-----

``packages/mcp/test/server.test.ts`` runs the real server on a free port with the real core on a
temporary project and talks to it with the SDK client: authentication, Host check, sessions, scope,
create/list/get/update with ``source_file``, code sync preview/apply, action log.
``apps/desktop/src/main/settings.test.ts`` covers the settings store.

Manual check of the packaged behaviour (default off, nothing listening)::

   PC_USER_DATA_DIR=/tmp/pc-ud PC_PROJECT=/path/to/project pnpm --filter desktop dev
   lsof -nP -iTCP:47632 -sTCP:LISTEN        # nothing: the server is off by default
   # write {"mcp":{"enabled":true,"scope":"write","port":47632,"token":"pcmcp_test_0123456789abcdef"}}
   # to /tmp/pc-ud/settings.json before starting, then call the URL with curl

Not built yet
-------------

* Trace report and ТЗ export tools (the features do not exist in the app yet).
* Tools for editing projects and components (the Workspace editor does that).
