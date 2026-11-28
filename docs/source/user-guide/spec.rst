Specification (ТЗ)
==================

Product Creator generates the specification of a product from its catalog: one document for people and
a bundle for AI agents. The catalog is the source; the generated files are never edited by hand.

What is in it
-------------

**For people** — ``<language>/spec.md``, one per project language (see :ref:`spec-languages`):

#. *Product*: description, vision, goals, actors and glossary (``product-creator.yml``, see
   :doc:`projects-and-services`).
#. *Features* in ``approved``, ``implemented`` and ``deprecated``, grouped by bounded context, with
   requirements, acceptance criteria, constraints, decisions, open questions, business objects and
   tickets (linked to the tracker).
#. *Data*: business objects with their fields and the features that use them.
#. *Workflows* with their steps.
#. *Drafts*: features in ``draft``, apart from the agreed ones.
#. *Problems*: every validation problem of the catalog.

**For agents** — ``agent/``: ``manifest.json`` (product context, counts, ``ready``, the list of entries,
all problems) and one small JSON file per feature, business object and workflow. A feature file holds
the feature with its acceptance ``verify`` commands and code places, the business objects it uses with
their fields, the features that call it and its workflows. An agent reads the manifest and loads only
the entries a task needs.

Each view gets the fields marked for it in the schema (``x-audience``): people do not see ``verify``,
``source_file``, ``code_refs`` or ``calls``; agents do not see ``owner`` or ``tags``. Removed entries
are left out.

**Problems are part of the spec.** A model with errors produces a spec that says *Not ready* on top
(``ready: false`` for agents), and every problem is shown next to the entry it belongs to.

Generate
--------

* In the app: **Presentation → Doc** shows the spec; **Write files** writes it.
* In a terminal: ``product-creator spec [project-folder] [--strict] [--language <tag>]``. ``--strict``
  exits with code 1 when the model has errors (the spec is written anyway, marked *Not ready*);
  ``--language`` writes only that language.
* Agents: MCP ``get_spec`` (manifest, one entry, or the human view; ``language`` picks the language of
  the human view), generated on every call.

Settings
--------

In ``product-creator.yml`` (or **Workspace → Edit project**):

.. code-block:: yaml

   languages: [en, ru]   # content and spec languages; the first is primary (default [en])
   spec:
     output: docs/spec   # where the files are written, relative to the project (default docs/spec)

``output`` must be inside the project and must not overlap the catalog. Writing replaces every
``<language>/spec.md`` and ``agent/`` in that folder and keeps other files there. The folder is
independent of the Sphinx documentation. The older ``spec.language`` is read as a one-language list.

.. _spec-languages:

Languages
---------

A project lists its languages in ``languages`` (**Workspace → Edit project → Languages**, or MCP
``update_project``). The first is the *primary* language: the normal fields of every card are written in
it. Other languages are optional translations.

**Translating.** When a project has more than one language, the forms of features, business objects,
workflows and the project show language tabs. The primary tab is the normal form. Another tab lists only
the texts that can be translated — names, descriptions, requirement and acceptance texts, constraints,
decisions, questions, screen captions, field descriptions, the vision, goals, actors and glossary — each
with the primary text above its input. An empty input means *not translated*. Ids, links, types and the
structure are edited on the primary tab only. The feature page has the same tabs to read a translation.

Translations are stored in the same file, in ``i18n``; list items are addressed by their id:

.. code-block:: yaml

   name: Create order
   requirements: [{ id: R1, text: The buyer sees the total }]
   i18n:
     ru:
       name: Создать заказ
       requirements: { R1: { text: Покупатель видит сумму } }
       _source: { name: 3f2a91c0, requirements: { R1: { text: 9c1b77d2 } } }

``_source`` is written by Product Creator: a fingerprint of the primary text each translation was made
from. When the primary text changes, the translation is reported as stale (*Problems*,
``translation_stale``) until it is updated. A translation of an item that no longer exists
(``translation_orphan``) and a language that is not in ``languages`` (``translation_unknown_language``)
are reported too. A missing translation is not a problem.

**The spec per language.** ``product-creator spec`` writes ``<output>/<language>/spec.md`` for every
language. Headings and labels exist in English, Russian and German; other languages get English labels.
Text that has no translation is shown in the primary language and marked with it (``… [EN]``); the
header of the spec counts these texts. The agent bundle is written once, in the primary language, and
carries the ``i18n`` blocks as they are. The **Doc** page has a language select.

.. _spec-screenshots:

Screenshots
-----------

A product with a UI gets screenshots in its spec. Product Creator does not drive a browser itself: the
project brings its own capture command (Playwright, Cypress, a script — anything), and Product Creator
runs it with the services it needs.

**What to capture** — ``screens`` of a feature (form section *Screens*, or YAML):

.. code-block:: yaml

   screens:
     - id: S1                          # S1, S2, … per feature
       title: The order form           # caption in the spec
       path: /orders/new               # route, relative to screenshots.baseUrl
       wait: form                      # hints for the capturer (optional):
       actions:                        #   selectors to wait for, click or fill before capturing
         - click: "#add-line"
         - fill: ["#line-0 input", "Coffee"]
       element: main                   #   capture one element instead of the page
       viewport: [1280, 800]

**How to run** — ``screenshots`` in ``product-creator.yml``:

.. code-block:: yaml

   screenshots:
     baseUrl: http://localhost:3000    # passed to the capturer as PC_BASE_URL
     env: { NODE_ENV: test }           # added to every command
     setup:                            # run to completion, in order (migrate, seed, build)
       - command: pnpm db:reset && pnpm db:seed
         timeoutSec: 300
     start:                            # long-running, in the background; the run waits for readyUrl
       - command: docker compose up web api
         readyUrl: http://localhost:3000/health
         readyTimeoutSec: 180
     capture:                          # the project's capturer
       command: pnpm e2e:screens
       cwd: e2e
     teardown:                         # always, also after a failure or a cancel
       - command: docker compose down

Commands run in the project folder (or ``cwd`` inside it) with the PATH of your login shell; each has a
timeout (default 300 s). Background services are stopped after the capture.

**The contract.** Product Creator writes ``screens.request.json`` into the screenshots folder and passes
its path in ``PC_SCREENS_REQUEST`` (also ``PC_SCREENS_OUTPUT`` and ``PC_BASE_URL``):

.. code-block:: json

   { "format": "product-creator.screens/1", "baseUrl": "http://localhost:3000",
     "output": "/repo/docs/spec/screens",
     "screens": [ { "feature": "shop.order.create", "id": "S1", "title": "The order form",
                    "path": "/orders/new", "wait": "form", "file": "shop.order.create/S1.png" } ] }

The capturer writes each image to ``<output>/<file>`` and a result ``<output>/screens.json``:
``{ "screens": [ { "feature": "…", "id": "S1", "file": "…", "ok": true } ] }`` (``ok: false`` with
``error`` for a screen it could not capture). Images of screens that are no longer declared are removed.

**When.** ``product-creator spec`` captures first when ``screenshots`` is configured; ``--no-screens``
uses the images that are there. In the app: **Doc → Capture screenshots** (with the log and *Cancel*).
Agents: MCP ``capture_screens``. Quitting the app during a capture cancels it but waits until the
background services are stopped and the teardown commands have run (up to their timeouts); a
notification says so. The images are written to ``<spec.output>/screens`` and committed with
the spec.

**Per language.** With ``screenshots.perLanguage: true`` the capture runs once per project language:
``screens.request.json`` gets ``"language"`` and the commands get ``PC_SCREENS_LANGUAGE``; images of the
other languages go to ``screens/<language>/``. A spec uses the images of its language and falls back to
those of the primary language. Product Creator's own capturer starts the app with that interface
language (``PC_UI_LANGUAGE``).

**In the spec** each screenshot appears under its feature with its caption. A declared screen without an
image (never captured, or the capture failed) is shown as *no screenshot yet* and listed as a warning in
*Problems*.
