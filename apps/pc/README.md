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
- `lib/` — Core библиотеки (storage, types, logger)
- `product/` — Каталог функций и схема
  - `functions/` — YAML файлы функций
  - `schema/` — JSON Schema для валидации

## Основные возможности

- **Просмотр и поиск** функций с Fuse.js
- **Создание/редактирование** карточек функций
- **Валидация** через JSON Schema (ajv)
- **Граф зависимостей** (Cytoscape.js)
- **TinyBase** — in-memory хранилище с синхронизацией FS
- **Chokidar** — file watcher для hot reload
- **Winston** — структурированное логирование

## API Endpoints

- `GET /api/index` — список всех функций
- `GET /api/card?id=<id>` — одна функция
- `POST /api/validate` — валидация данных
- `POST /api/save` — сохранение функции
- `GET /api/graph?bounded_context=&lifecycle=` — граф зависимостей

## Переменные окружения

Создайте `.env` файл:

```
FUNC_ROOT=./product/functions
```

## Технологии

- Next.js 15 (App Router, TypeScript, Tailwind)
- TinyBase (реляционное хранилище)
- React Hook Form
- Fuse.js (fuzzy search)
- Cytoscape.js (граф)
- js-yaml, chokidar, ajv, winston
