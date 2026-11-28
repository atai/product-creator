Specification (ТЗ)
==================

Product Creator generates the specification of a product from its catalog: one document for people and
a bundle for AI agents. The catalog is the source; the generated files are never edited by hand.

What is in it
-------------

**For people** — ``spec.md``:

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
* In a terminal: ``product-creator spec [project-folder] [--strict]``. ``--strict`` exits with code 1
  when the model has errors (the spec is written anyway, marked *Not ready*).
* Agents: MCP ``get_spec`` (manifest, one entry, or the human view), generated on every call.

Settings
--------

In ``product-creator.yml`` (or **Workspace → Edit project**):

.. code-block:: yaml

   spec:
     language: en        # the language the catalog is written in (default en)
     output: docs/spec   # where the files are written, relative to the project (default docs/spec)

``language`` selects the headings and labels of the spec; the content is the catalog itself, in the
language it is written in. Languages without label translations use English labels (the manifest says
so). ``output`` must be inside the project and must not overlap the catalog. Writing replaces
``spec.md`` and ``agent/`` in that folder and keeps other files there. The folder is independent of
the Sphinx documentation.
