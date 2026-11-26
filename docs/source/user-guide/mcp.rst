MCP server for AI agents
========================

Product Creator can run an `MCP <https://modelcontextprotocol.io>`_ server so that AI agents (Cursor,
Claude, Grok Bot, ChatGPT, …) can read and edit your projects: list services and libraries, read and
change catalog entries, run code sync and generate OpenAPI.

The server is **off by default**. It runs inside the desktop app: it starts with the app (only if you
switched it on) and stops when you quit. It listens on ``127.0.0.1`` only, so other computers cannot
reach it unless you also turn on :ref:`remote access <mcp-remote-access>`.

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
machine needs :ref:`remote access <mcp-remote-access>`.

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

.. _mcp-remote-access:

Remote access (ChatGPT, servers)
--------------------------------

Agents that cannot reach ``127.0.0.1`` (ChatGPT developer-mode connectors, an agent on a server) connect
through the **Emperor MCP relay**. Product Creator opens one outgoing connection to
``relay.emperor.ecooz.net``; the relay hands every request of a remote agent to your app. Nothing is
opened on your computer, and it works only while Product Creator **and** its MCP server are running.

#. Sign in to Emperor and open **Profile → Remote access**.
#. **Create device** — copy the device key ``rld_…`` (it is shown once).
#. In Product Creator → **Settings → Expose remotely**: paste the key and press **Save key**. The key
   is stored encrypted with the keychain of your operating system (macOS Keychain, Windows DPAPI,
   libsecret); if that is unavailable the key is not saved.
#. Tick **Expose remotely** and make sure **Run MCP server** is on. The status becomes *online* and the
   **Public URL** appears: ``https://relay.emperor.ecooz.net/d/<slug>/mcp``.
#. In Emperor create a **bot token** (``rly_…``) for that device with scope *READ* or *READ_WRITE* and
   give the remote agent the public URL plus ``Authorization: Bearer rly_…``.

Remote agents use the scope of their bot token (the *scope* setting above belongs to the local token).
They see the same tools and the same projects, and every call appears in the action log with the bot
token id and the agent's User-Agent. Revoke a bot token or the whole device in Emperor to cut access;
**Rotate key** in Emperor needs the new key pasted here.

Status values: *connecting*, *online*, *reconnecting* (the app retries with a growing delay up to one
minute), *key rejected* (wrong key), *key revoked* (revoked or rotated in Emperor — paste a new key),
*replaced by another instance* (the same key is used by a second Product Creator).

Limits of the relay: 5 devices per user, 25 active bot tokens per device, 120 requests per minute per
token; bodies up to 4 MiB. If the app is closed, agents get ``503 device_offline``.

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
* After you quit the app, agents get *connection refused* (remote agents: ``503 device_offline``) — the server lives only while the app runs.
* *Turn on "Run MCP server" first* — the relay forwards to the local server, which must be running.
