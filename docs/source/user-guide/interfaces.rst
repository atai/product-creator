Interfaces (OpenAPI)
====================

Services publish their interfaces as OpenAPI documents (configured in ``product-creator.yml`` or
discovered). The **Interfaces** page lists the operations (method, path, operationId, summary) of the
selected service or of all opened services.

This is the first step of cross-service and cross-project synchronisation: next, function cards will be
linked to operations they *implement* (provider) or *call* (consumer), so that a feature can be traced
from one service to another and broken contracts are reported. See
:doc:`/developer-guide/openapi-sync-design`.
