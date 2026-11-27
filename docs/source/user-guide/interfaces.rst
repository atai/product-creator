Interfaces (OpenAPI)
====================

Services publish their interfaces as OpenAPI documents, listed in ``openapi`` of the component
(Workspace editor or ``service.pc.yml``). There are two sources:

* **committed spec files** — the default: the import takes spec files that are tracked by git; they
  work without any command;
* **generated specs** — the component has a *generate command* that Product Creator runs itself.
  Typical for services that build the document from code (Emperor: ``pnpm run generate:openapi`` →
  ``dist/openapi.json``).

The **Interfaces** page lists the operations (method, path, operationId, summary) of the selected
component or of all opened components, from whichever file is listed.

Generating specs
----------------

On the **Workspace** page:

* the *Prisma / OpenAPI* column of a component shows every spec file with the number of operations and
  the time it was last written (or *not generated*);
* **Generate OpenAPI** runs the command of that component; **Generate all OpenAPI** (project header)
  runs the commands of all components one after another — a failure does not stop the others;
* while a command runs you can **Cancel** it; **Log** shows the live output (stdout and stderr) and keeps
  it after the run;
* the result is ``ok`` (exit code 0 and every listed spec exists and parses), ``failed`` (non-zero exit,
  spec not written or invalid — the message says which), ``timeout`` or ``cancelled``.

The command, working directory and timeout are edited in the component form (*OpenAPI generation*). The
command is executed exactly as written, like an npm script, in the given directory, with the PATH of your
login shell (so ``pnpm`` and ``node`` are found when the app is started from the Dock). Nothing is
appended to it.

.. warning::
   A generate command is code stored in the project files. Product Creator asks for confirmation the
   first time it runs commands of a project in a session; only run commands of projects you trust.

Specs written to build folders (``dist/``) are usually git-ignored: generate them before opening the
**Interfaces** page. A spec that was not generated yet is shown as such, not as an error.

This is the first step of cross-service and cross-project synchronisation: next, features will be
linked to operations they *implement* (provider) or *call* (consumer), so that a feature can be traced
from one service to another and broken contracts are reported. See
:doc:`/developer-guide/openapi-sync-design`.
