Product Creator Documentation
=============================

**Product Creator (PC)** keeps the product specification (ТЗ) of your projects up to date by managing
*features* as a catalog and proving their link to the code: every function card points to its source,
business objects are synchronised with the database schema, and services are connected through their
interface specifications (OpenAPI).

PC is a **desktop application** (Electron) that is launched from a project folder. It can keep several
projects open at once, and every project may consist of several services (monorepo ``apps/*``,
``packages/*``, ``integrations/*`` ...).

.. note::
   The previous Next.js web application (``apps/pc``) still works and shares the same core, but it is
   deprecated in favour of the desktop app (``apps/desktop``).

Documentation is organized into two sections:

* **User Docs** — how to install and use Product Creator.
* **Dev Docs** — architecture, code layout and workflow for developers of Product Creator.

.. toctree::
   :maxdepth: 2
   :caption: User Docs

   user-guide/index

.. toctree::
   :maxdepth: 2
   :caption: Dev Docs

   developer-guide/index
