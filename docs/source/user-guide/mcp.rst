MCP server for AI agents
========================

Product Creator can run an `MCP <https://modelcontextprotocol.io>`_ server so that AI agents (Cursor,
Claude, Grok Bot, ChatGPT, …) can read and edit your projects: list services and libraries, read and
change catalog entries, run code sync and generate OpenAPI.

The server is **off by default**. It runs inside the desktop app: it starts with the app (only if you
switched it on) and stops when you quit. It listens on ``127.0.0.1`` only, so other computers cannot
reach it (remote access through a relay is a separate step).

Turn it on
----------

#. Open **Settings** (button in the header).
#. Tick **Run MCP server**. The status line shows ``running on http://127.0.0.1:47631/mcp``.
#. Choose the **scope**:

   * *read-only* (default) — agents can only read;
   * *read-write* — agents can also create and update catalog entries, run code/schema sync and run the
     OpenAPI generate command of a component.

#. Press **Show** next to **Token** and copy it (or use **Copy config**).

The default port is ``47631`` in the installed app and ``47632`` in a development run (so both can run
together). Change it in the settings if it is taken.

The token is stored in the app's data folder (``settings.json``) and differs between the installed
app and a development run. **Regenerate** creates a new token and ends all agent sessions that use
the old one. Changing the scope or the token also ends open sessions.

Connect an agent
----------------

Every client needs the same two things: the URL ``http://127.0.0.1:47631/mcp`` (use the one shown in
Settings) and the header ``Authorization: Bearer <token>``. The transport is *Streamable HTTP*.

Cursor — in ``~/.cursor/mcp.json`` (all projects) or ``.cursor/mcp.json`` (one project):

.. code-block:: json

   {
     "mcpServers": {
       "product-creator": {
         "url": "http://127.0.0.1:47631/mcp",
         "headers": { "Authorization": "Bearer <token>" }
       }
     }
   }

Claude Code:

.. code-block:: bash

   claude mcp add --transport http product-creator http://127.0.0.1:47631/mcp \
     --header "Authorization: Bearer <token>"

Grok Bot, ChatGPT and other clients: add a custom MCP server / connector with the same URL and
bearer token. A client that runs on the same computer uses the ``127.0.0.1`` URL; a client on another
machine cannot connect yet.

Quick check without a client — the settings screen offers **Copy curl check**; a successful answer is a
JSON ``initialize`` result with ``"serverInfo":{"name":"product-creator"}``.

What agents can do
------------------

Agents only see projects that are **open in the workspace**; every tool takes the project (id, slug or
name from ``list_projects``) as an argument.

.. list-table::
   :header-rows: 1
   :widths: 28 12 60

   * - Tool
     - Scope
     - What it does
   * - ``list_projects``
     - read
     - Open projects with component counts
   * - ``list_components``
     - read
     - Services and libraries of a project: paths, code base, DB schema, OpenAPI settings
   * - ``list_catalog``
     - read
     - Functions, business objects, workflows or streams of a project/component (filter, paging).
       Functions carry their ``source_file`` link
   * - ``get_catalog_entry``
     - read
     - Full card of one entry
   * - ``list_interfaces``
     - read
     - OpenAPI operations of the services
   * - ``get_openapi_status``
     - read
     - Which components can generate a spec, spec files, state of the last generation
   * - ``sync_code_preview`` / ``sync_schema_preview``
     - read
     - Match code (or the Prisma schema) with the catalog and show what a sync would do; writes nothing
   * - ``create_catalog_entry``
     - read-write
     - Create a function, business object, workflow or stream (validated like in the editor)
   * - ``update_catalog_entry``
     - read-write
     - Change fields of an entry (merge patch; the id cannot change; validated)
   * - ``sync_code_apply`` / ``sync_schema_apply``
     - read-write
     - Run the sync with the default actions. Deletions are skipped unless the agent passes
       ``allow_delete``
   * - ``generate_openapi``
     - read-write
     - Run the *generate command* saved in the component settings (one component or all)

Write tools are not even listed for a read-only token.

.. note::

   ``generate_openapi`` runs a shell command from the component settings (see :doc:`interfaces`), and
   code sync reads the code base of the component. Use a read-write token only with agents you trust.

Not available yet: the trace report and the ТЗ export (they do not exist in the app yet).

Action log
----------

Settings shows the latest agent calls of the session: time, caller, tool, result and the (shortened)
arguments. Every call is also appended to ``mcp-actions.log`` (one JSON object per line) in the app data
folder; the token and full cards are never written there.

Troubleshooting
---------------

* *Port is already in use* — pick another port in Settings.
* ``401`` — wrong or outdated token (it changes on **Regenerate**).
* *Project is not open in Product Creator* — open the folder in the app first (File → Open Project
  Folder…); the error lists the open projects.
* After you quit the app, agents get *connection refused* — the server lives only while the app runs.
