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
  ``pcmcp_`` + 32 random bytes; the scope belongs to the token (setting); relay callers get the stricter of their bot-token scope and this setting.
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
entries are addressed by ``kind`` (``feature``, ``business_object``, ``workflow``, ``stream``;
``function`` is accepted and normalised by ``kindOf()``) and map to the core routes (``/api/features``, ``/api/business-objects``, ``/api/workflows``, ``/api/streams`` and
the ``/api/save*`` routes). Sync tools drive ``/api/apps/<id>/sync-code|sync-schema/{start,status,actions,execute}``:
*preview* stops at the ``matching`` stage; *apply* executes and waits for ``completed`` (3 minute
limit). Code sync apply links ``proposed`` items, creates only the candidates named in ``create`` and
unlinks ``stale`` items only with ``allow_unlink`` (``allow_delete`` is an alias); schema sync apply
sets ``skip`` for ``delete`` actions unless ``allow_delete``.

Plan-check tools (``validate_catalog``, ``validate_plan``, ``impact_of_change``, ``find_duplicates``,
``get_object``) call ``/api/validation``, ``/api/validate-plan``, ``/api/impact``, ``/api/duplicates``.
``projectView`` maps component ids to slugs and files to project-relative paths. A rejected write
returns the error text plus the ``issues`` of the 400 response. ``get_schema`` returns the schemas from
``@pc/core/validation/schemas`` directly (no HTTP call).

To add a tool: call ``define`` (mark ``write: true`` if it changes anything), keep the output compact,
add a case to ``packages/mcp/test/server.test.ts`` and a row to the User Docs table.

Relay client (remote access)
----------------------------

Ticket `PRODUCTCREATOR-20 <https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-20>`_. The protocol is owned
by Emperor (``emperor-web-ui``, ``docs/source/developer-guide/implementation/mcp-relay-protocol.rst``,
service ``integrations/mcp-relay``); the PC side is ``packages/mcp/src/relay/`` and the desktop wiring is
``apps/desktop/src/main/relay.ts`` (``RelayController``).

.. code-block:: text

   bot ──HTTPS──► relay.emperor.ecooz.net/d/<slug>/mcp   (Bearer rly_…, relay checks it)
                       │  stream on the tunnel
   PC ◄──WSS pc-relay.v1── wss://relay.emperor.ecooz.net/tunnel   (Bearer rld_… device key)
    RelayClient ──HTTP──► McpHttpServer 127.0.0.1:<port>/mcp   (Bearer <in-process relay key>)

* **Frames** (``frames.ts``): binary WebSocket messages ``u8 version, u8 type, u32 streamId, u8 flags,
  u32 headerLen, JSON header, body``. ``HELLO`` → ``WELCOME`` (public URL, limits), request streams
  ``REQ_HEADERS``/``REQ_BODY``, responses ``RES_HEADERS``/``RES_BODY``, ``WINDOW_UPDATE``, ``RST_STREAM``,
  ``PING``/``PONG``, ``GOAWAY``, ``EVENT``, ``ERROR``.
* **Connection** (``client.ts``): subprotocol ``pc-relay.v1`` and ``Authorization: Bearer rld_…``; ``HELLO``
  right after open (the relay waits 10 s). A rejected upgrade is ``401`` (stop: *key rejected*),
  ``503``/``400`` (retry). Reconnect with exponential backoff 1 s → 60 s with jitter; ``GOAWAY`` honours
  ``reconnectAfterMs``. Close ``4004``/``GOAWAY revoked`` and ``4003`` (replaced) stop the client until
  the user acts. PC sends ``PING`` every 30 s and expects ``PONG`` within 10 s; ``ws`` answers the
  relay's own WebSocket pings.
* **Requests**: at most 16 streams (relay maximum 32). Only ``/mcp`` with GET/POST/DELETE is served
  (``404``/``405`` otherwise). Body ≤ 4 MiB (``RST_STREAM TOO_LARGE``), credit is returned with
  ``WINDOW_UPDATE``; responses are chunked to ≤ 64 KiB and sent within the 256 KiB stream window
  (flow control; the local response is paused when the queue is full). Non-SSE responses are capped at
  16 MiB, SSE streams get ``: ping`` keep-alive comments every 30 s. A ``deadlineMs`` timer resets the
  stream.
* **Trust rules** (the relay protocol puts these on PC):

  * the bot's ``Authorization`` never arrives; PC calls **only** the own local MCP URL
    (``McpController.localUrl``) — the relay cannot choose a target or a path;
  * only ``content-type``, ``accept``, ``mcp-session-id``, ``mcp-protocol-version`` and ``last-event-id``
    are forwarded; everything else in the relayed headers is dropped (CR/LF removed);
  * the local request carries the **in-process relay key** (random per app start, never shown or stored)
    plus ``x-pc-relay-token`` / ``x-pc-relay-scope`` / ``x-pc-relay-ua``. ``McpHttpServer`` honours these
    headers **only** with that key, so a local client with the normal token cannot claim ``READ_WRITE``
    (covered by tests), and a relay session cannot be used with the local token (sessions are bound to
    the caller);
  * scope is enforced by PC and is the **stricter** of ``token.scope`` and the local ``scope`` setting
    (``McpHttpServer.authenticate``: ``write`` only if both allow it): ``READ`` tokens, and every token while
    the app is read-only, get no write tools and cannot call them (the ``instructions`` of such a session say
    why; ``Principal.tokenScope`` / ``cappedByLocal`` record it). ``configure({scope})`` with a changed scope
    closes **all** sessions, relay ones included, because the tool list depends on the scope; the action log records ``relay:<botTokenId>`` and the bot's User-Agent;
  * the device key is stored with Electron ``safeStorage`` (OS keychain) in ``settings.json`` and is
    refused when secure storage is unavailable; it is never logged and never sent to the renderer
    (``keyHint`` shows ``rld_<deviceId>.••••`` only);
  * responses other than ``application/json`` / ``text/event-stream`` reset the stream (the relay would
    answer ``502`` anyway); ``Set-Cookie`` is never forwarded.

* **Local mode report** (extension of ``pc-relay.v1``, backward compatible): the app tells the relay whether
  writes are possible at all, so Emperor can show a collision with the bot-token scopes.

  * ``HELLO`` header gets ``capabilities: {"mcpScope": "read_only" | "read_write"}`` (``read_write`` = the
    local scope setting is *write*). Relays ignore unknown ``HELLO`` fields.
  * While online, when the setting changes, ``RelayClient.refreshCapabilities()`` (called by
    ``RelayController.apply`` on every settings change) sends a ``CAPABILITIES`` frame (type ``0x42``,
    stream 0, flag ``IGNORABLE``, header ``{"mcpScope": …}``), once per actual change. A relay that does not
    know the type skips it because of ``IGNORABLE``; a reconnect reports the mode in ``HELLO`` again.
  * The report is informational: enforcement stays in PC (stricter-of rule above).

* ``ws://`` endpoints are accepted only for loopback (a relay started locally for tests); the endpoint is
  editable under *Advanced* in Settings.
* The MCP sessions live in PC; ``Last-Event-ID`` resume is not used by the relay in v1, so a broken tunnel
  fails the requests in flight (bots reinitialise).

Tests
-----

``packages/mcp/test/server.test.ts`` runs the real server on a free port with the real core on a
temporary project and talks to it with the SDK client: authentication, Host check, sessions, scope,
create/list/get/update with ``source_file``, code sync preview/apply, action log.
``packages/mcp/test/relay.test.ts`` runs the real ``RelayClient`` against a fake relay (``ws`` server that
speaks ``pc-relay.v1``) in front of the real MCP server: handshake and headers, 401/503 on upgrade,
reconnect, 4003/4004, ``GOAWAY``, ``PING``/``PONG``, full MCP sessions with ``READ`` and ``READ_WRITE``
tokens, forged-header and path/method checks, ``503`` while the local server is off, stream resets.
``apps/desktop/src/main/settings.test.ts`` covers the settings store (including the encrypted key and
URL validation).

Manual check of the packaged behaviour (default off, nothing listening)::

   PC_USER_DATA_DIR=/tmp/pc-ud PC_PROJECT=/path/to/project pnpm --filter desktop dev
   lsof -nP -iTCP:47632 -sTCP:LISTEN        # nothing: the server is off by default
   # write {"mcp":{"enabled":true,"scope":"write","port":47632,"token":"pcmcp_test_0123456789abcdef"}}
   # to /tmp/pc-ud/settings.json before starting, then call the URL with curl

Not built yet
-------------

* Relay phase 2 of Emperor (OAuth for ChatGPT without bot-token headers, several replicas) — not needed by
  the PC side.
* Trace report and ТЗ export tools (the features do not exist in the app yet).
* Tools for editing projects and components (the Workspace editor does that).
