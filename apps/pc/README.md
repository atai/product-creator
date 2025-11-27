# Product Creator

Web-приложение для управления каталогом функций с визуализацией зависимостей через события.

## Запуск

### Development

```bash
# Из корня монорепо
pnpm dev

# Или используя скрипт
./scripts/dev.sh
```

Приложение будет доступно на `http://localhost:3067`

### Production

```bash
# Build
pnpm build
# или ./scripts/build.sh

# Start
pnpm start
# или ./scripts/start.sh
```

## Структура

- `app/` — Next.js App Router pages и API routes
- `lib/` — Core библиотеки (storage, types, logger, sync)
- `config/` — Конфигурация проектов и приложений
  - `projects/` — YAML файлы проектов
  - `apps/` — YAML файлы приложений (содержат пути к данным)
- `product/` — Каталог функций и схема (опционально, для примера)
  - `functions/` — YAML файлы функций
  - `workflows/` — YAML файлы workflow
  - `streams/` — YAML файлы streams
  - `business-objects/` — YAML файлы бизнес-объектов
  - `schema/` — JSON Schema для валидации

**Важно:** Пути к данным приложений (functions, workflows, streams, business-objects) хранятся в конфигурационных файлах приложений (`config/apps/*.yml`) в поле `directory`. Система автоматически загружает данные из всех директорий, указанных в конфигурации приложений.

## Основные возможности

- **Управление проектами и приложениями** — создание и настройка проектов и приложений
- **Просмотр и поиск** функций, workflows, streams, бизнес-объектов с Fuse.js
- **Создание/редактирование** карточек функций, workflows, streams, бизнес-объектов
- **Синхронизация из Prisma схемы** — автоматическая синхронизация бизнес-объектов из Prisma schema
- **Валидация** через JSON Schema (ajv)
- **Граф зависимостей** (Cytoscape.js)
- **TinyBase** — in-memory хранилище с синхронизацией FS
- **Chokidar** — file watcher для hot reload
- **Winston** — структурированное логирование

## API Endpoints

### Функции
- `GET /api/index` — список всех функций
- `GET /api/card?id=<id>` — одна функция
- `POST /api/validate` — валидация данных
- `POST /api/save` — сохранение функции
- `GET /api/graph?bounded_context=&lifecycle=` — граф зависимостей

### Проекты и приложения
- `GET /api/projects` — список всех проектов
- `POST /api/projects` — создание проекта
- `GET /api/apps` — список всех приложений
- `POST /api/apps` — создание приложения
- `GET /api/apps/[id]` — получение приложения
- `PUT /api/apps/[id]` — обновление приложения
- `DELETE /api/apps/[id]` — удаление приложения

### Синхронизация из схемы
- `POST /api/apps/[id]/sync-schema/start` — запуск синхронизации из Prisma схемы
- `GET /api/apps/[id]/sync-schema/status/[syncId]` — статус синхронизации
- `POST /api/apps/[id]/sync-schema/actions` — сохранение действий синхронизации
- `PUT /api/apps/[id]/sync-schema/actions` — обновление действия для объекта
- `POST /api/apps/[id]/sync-schema/execute` — выполнение синхронизации

### Бизнес-объекты
- `GET /api/business-objects?app=<appId>` — список бизнес-объектов (опционально фильтр по приложению)
- `POST /api/save-business-object` — сохранение бизнес-объекта

## Конфигурация

Система использует конфигурационные файлы вместо переменных окружения:

1. **Проекты** — создаются в `config/projects/*.yml`
2. **Приложения** — создаются в `config/apps/*.yml`

Каждое приложение содержит:
- `id` — уникальный идентификатор
- `name` — название приложения
- `projectId` — ID проекта
- `directory` — путь к директории с данными приложения (functions, workflows, streams, business-objects)
- `codeBasePath` — путь к кодовой базе (опционально, для синхронизации из кода)
- `dbSchemaPath` — путь к Prisma schema (опционально, для синхронизации из схемы)

Пример конфигурации приложения (`config/apps/example.yml`):
```yaml
id: projx-example
name: Example Application
projectId: projx
directory: /path/to/application/data
codeBasePath: ./src
dbSchemaPath: ./prisma/schema.prisma
```

Система автоматически загружает данные из всех директорий, указанных в конфигурации приложений.

## Технологии

- Next.js 15 (App Router, TypeScript, Tailwind)
- TinyBase (реляционное хранилище)
- React Hook Form
- Fuse.js (fuzzy search)
- Cytoscape.js (граф)
- js-yaml, chokidar, ajv, winston
