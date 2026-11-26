Interfaces (OpenAPI)
====================

Services publish their interfaces as OpenAPI documents, listed in ``openapi`` of the component
(Workspace editor or ``service.pc.yml``). By default the import takes only spec files **committed in the
repository**; generated files (e.g. ``dist/openapi.json``) can be added manually. The **Interfaces**
page lists the operations (method, path, operationId, summary) of the selected component or of all
opened components.

This is the first step of cross-service and cross-project synchronisation: next, function cards will be
linked to operations they *implement* (provider) or *call* (consumer), so that a feature can be traced
from one service to another and broken contracts are reported. See
:doc:`/developer-guide/openapi-sync-design`.
