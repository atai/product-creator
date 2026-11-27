# Product Creator

Documentation (Sphinx, sources in [`docs/source`](docs/source)):

- **User Docs** — [docs/source/user-guide](docs/source/user-guide/index.rst)
  - [Installation](docs/source/user-guide/installation.rst) · [Launching from a project folder](docs/source/user-guide/launching.rst) · [Projects and services](docs/source/user-guide/projects-and-services.rst) · [Feature catalog](docs/source/user-guide/catalog.rst) · [Sync with code and DB schema](docs/source/user-guide/sync.rst) · [Interfaces (OpenAPI)](docs/source/user-guide/interfaces.rst) · [MCP server for AI agents](docs/source/user-guide/mcp.rst)
- **Dev Docs** — [docs/source/developer-guide](docs/source/developer-guide/index.rst)
  - [Architecture](docs/source/developer-guide/architecture.rst) · [Repository layout](docs/source/developer-guide/repository-layout.rst) · [Development](docs/source/developer-guide/development.rst) · [Core package](docs/source/developer-guide/core-package.rst) · [Roadmap](docs/source/developer-guide/roadmap.rst)

Agents that cannot reach this computer connect through [ecooz.net](https://ecooz.net). Create a device and a bot token there, then turn on **Expose remotely** in Settings. Emperor’s steps: [Product Creator (remote access)](https://ecooz.net/support/docs/product-creator). Product Creator’s steps: [Remote access](docs/source/user-guide/mcp.rst).

Build HTML docs: `cd docs && make venv && make html` → `docs/build/html/index.html`

Tasks: [YouTrack PRODUCTCREATOR](https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-5)
