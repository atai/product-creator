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
     - Features, business objects, workflows or streams of a project/component (filter, paging).
       Features carry their ``source_file`` link. ``kind: function`` is accepted as the old name of
       ``feature``
   * - ``get_catalog_entry``
     - read
     - Full card of one entry
   * - ``list_interfaces``
     - read
     - OpenAPI operations of the services
   * - ``get_openapi_status``
     - read
     - Which components can generate a spec, spec files, state of the last generation
   * - ``get_schema``
     - read
     - JSON Schema of a feature, business object or workflow card, with ``x-audience`` per field; read
       it before writing a card (a feature's spec fields are described there)
   * - ``get_object``
     - read
     - A business object with its fields and types, and the features that read or write it
   * - ``find_duplicates``
     - read
     - Entries with the same or a similar name or id (check before creating one)
   * - ``impact_of_change``
     - read
     - What a change of a business object or feature affects: features, workflows, objects with fields
       of its type
   * - ``validate_plan``
     - read
     - Check proposed changes (``upsert`` / ``delete`` of features, objects, workflows) against the
       catalog without writing; returns the errors the plan would introduce
   * - ``validate_catalog``
     - read
     - All validation problems of a project or component (see :ref:`validation`)
   * - ``sync_code_preview`` / ``sync_schema_preview``
     - read
     - Match code (or the Prisma schema) with the catalog and show what a sync would do; writes nothing
   * - ``get_project``
     - read
     - Product context of a project: vision, goals, actors, glossary, tracker, components
   * - ``apply_plan``
     - read-write
     - Write several changes at once (same input as ``validate_plan``). The plan is checked as a whole,
       so entries that reference each other are written together in any order; nothing is written if
       it adds errors, and a failed write is rolled back. Use it instead of many single writes
   * - ``update_project``
     - read-write
     - Change name, description, vision, goals, actors, glossary or tracker of a project
   * - ``create_catalog_entry``
     - read-write
     - Create a feature, business object, workflow or stream. Rejected with the list of problems if
       it would add a validation error
   * - ``update_catalog_entry``
     - read-write
     - Change fields of an entry (merge patch; the id cannot change; rejected like create)
   * - ``sync_code_apply`` / ``sync_schema_apply``
     - read-write
     - Run the sync with the default actions. Code sync: links proposed features; creates features
       only for the candidates listed in ``create``; unlinks stale ones only with ``allow_unlink``.
       Schema sync: deletions are skipped unless the agent passes ``allow_delete``
   * - ``generate_openapi``
     - read-write
     - Run the *generate command* saved in the component settings (one component or all)

Write tools are not even listed for a read-only token. The server instructions an agent receives
when it connects say so and name the setting to change (Settings → MCP → scope).

.. note::

   ``generate_openapi`` runs a shell command from the component settings (see :doc:`interfaces`), and
   code sync reads the code base of the component. Use a read-write token only with agents you trust.

Not available yet: the trace report and the ТЗ export (they do not exist in the app yet).

.. _mcp-remote-access:

Remote access (ChatGPT, servers)
--------------------------------

Agents that cannot reach ``127.0.0.1`` (ChatGPT developer-mode connectors, an agent on a server) connect
through the **Emperor MCP relay** on `ecooz.net <https://ecooz.net>`_. Product Creator opens one
outgoing connection to ``relay.emperor.ecooz.net``; the relay hands every request of a remote agent to
your app. Nothing is opened on your computer, and it works only while Product Creator **and** its MCP
server are running.

Devices, bot tokens, audit and revoke live in Emperor: open `ecooz.net <https://ecooz.net>`_, switch to
your **personal workspace**, then **Services → Product Creator**. Full Emperor-side steps (who sees the
screen, Connect device, tokens, rotate and revoke) are in
`Product Creator (remote access) <https://ecooz.net/support/docs/product-creator>`_.

#. On `ecooz.net <https://ecooz.net>`_ open your personal workspace → **Services → Product Creator**
   (see `Product Creator (remote access) <https://ecooz.net/support/docs/product-creator>`_).
#. **Connect device** — copy the device key ``rld_…`` (it is shown once).
#. In Product Creator → **Settings → Expose remotely**: paste the key and press **Save key**. The key
   is stored encrypted with the keychain of your operating system (macOS Keychain, Windows DPAPI,
   libsecret); if that is unavailable the key is not saved.
#. Tick **Expose remotely** and make sure **Run MCP server** is on. The status becomes *online* and the
   **Public URL** appears: ``https://relay.emperor.ecooz.net/d/<slug>/mcp``.
#. On the same Emperor screen create a **bot token** (``rly_…``) for that device with scope *READ* or
   *READ_WRITE* and give the remote agent the public URL plus ``Authorization: Bearer rly_…``.

The scope of a remote agent is the **stricter** of its bot token scope and the *scope* setting above:

.. list-table::
   :header-rows: 1

   * - Bot token
     - Local scope setting
     - Remote agent can
   * - READ
     - read-only or read-write
     - read only
   * - READ_WRITE
     - read-only
     - read only — write tools are neither listed nor callable (the agent is told so in the server
       instructions)
   * - READ_WRITE
     - read-write
     - read and write

If you want a remote agent to write, set the local scope to *read-write* as well. Changing the scope ends open
remote sessions too; the agent reconnects (a new ``initialize``) and gets the new tool list.

The app reports its local mode (*read_only* or *read_write*) to Emperor when it connects and again whenever you
change the scope, so Emperor can warn you when a READ_WRITE token belongs to a read-only device. This needs a
relay that understands the report; an older relay simply ignores it and the rule above still applies.

Remote agents see the same tools and the same projects, and every call appears in the action log with the bot
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
