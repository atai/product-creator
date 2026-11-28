# CLAUDE.md

Product Creator: a feature catalog and traceable product documentation linked to code.
It ships as an Electron desktop app with a built-in MCP server for AI agents.
Full developer docs are in `docs/source/developer-guide/` (start with `development.rst` and `repository-layout.rst`).

## Stack

- pnpm monorepo (`pnpm@12`, Node >= 22, CI uses Node 24), TypeScript, ESM.
- `apps/desktop`: Electron + electron-vite, React renderer, electron-builder for distributables. CLI launcher at `bin/product-creator.mjs`.
- `packages/core` (`@pc/core`): domain core. Covers the YAML-as-DB project model, catalog storage, validation, OpenAPI, code and Prisma sync, and HTTP API routes.
- `packages/mcp` (`@pc/mcp`): MCP server (Streamable HTTP, tools, action log, relay).
- `design-system` (`@pc/design-system`): CSS tokens + Tailwind v4 bridge + chrome classes. Read `design-system/USAGE.md` before touching UI styles.
- `docs/`: Sphinx documentation (Python, `docs/requirements.txt`).
- Tests use vitest in every package, plus `node --test` for `scripts/version-manager.test.mjs`.

## Commands (repo root)

```bash
pnpm install
pnpm desktop -- --project <dir>   # dev app with HMR (no --project = current folder)
pnpm typecheck                    # all packages
pnpm lint                         # eslint: apps/desktop, packages/core, packages/mcp
pnpm test                         # version-manager tests + vitest in every package
pnpm desktop:build                # build apps/desktop/out
pnpm catalog:lint                 # product-creator lint on this repo's catalog (after desktop:build)
pnpm run docs                     # Sphinx, warnings are errors (`pnpm docs` is a pnpm builtin)
```

Single package: `pnpm --filter @pc/core test`, `pnpm --filter desktop test`, `pnpm --filter @pc/mcp test`.

CI (`.github/workflows/ci.yml`) runs typecheck → lint → test → desktop:build → catalog:lint → Sphinx `-W`. Run the same checks locally before committing.

Headless smoke test of the desktop app (`PC_SMOKE_TEST=1 ...`) is described in `docs/source/developer-guide/development.rst`.

## Conventions

- Every commit subject starts with the YouTrack ticket id: `PRODUCTCREATOR-<n> <summary>` (https://ecooz.youtrack.cloud, project PRODUCTCREATOR). The only exception is `chore(release): X.Y.Z`, which `pnpm version:*` produces. The version script finds the previous release by that subject.
- Branch `main`; never force-push.
- Never bump versions by hand. Use `pnpm version:patch|minor|major|prerelease`, which syncs all `package.json` files, updates CHANGELOG, commits and tags.
- No `any` / `@ts-ignore`; type the data.
- New API route: `packages/core/src/http/routes/<path>/route.ts` (Web `Request`/`Response`), registered in `packages/core/src/http/router.ts`.
- Never commit `node_modules`, `apps/desktop/out`, `apps/desktop/dist`; never commit with failing `pnpm typecheck`.
- When a user-facing or architectural change lands, update the matching page in `docs/source` (user-guide / developer-guide).
- Domain term: "Feature" (formerly "Function"). `features/` folders are canonical; `functions/` is still read for compatibility.

## Gotchas

- The app dogfoods itself. `product-creator.yml` + `docs/product/**/*.pc.yml` are this repo's own catalog. Edit them through the app or keep them schema-valid (`packages/core/schema`).
- Opening a folder in the app for the first time writes `product-creator.yml` and `*.pc.yml` into it. Experiment on a copy (`git clone --local <repo> /tmp/copy`).
- `pnpm desktop:build` and `pnpm dev` write the same `apps/desktop/out`. Building while a dev instance runs replaces its chunk files, and the running app later fails with `MODULE_NOT_FOUND` (e.g. on quit). Check `ps` for `electron-vite dev` and do not build while it runs; ask first.
- Dev runs use a separate userData folder (`Product Creator Dev`). `PC_USER_DATA_DIR=<dir>` overrides it. Build per-app paths from `userData`, never from home/appData directly.

## Secrets

- Tokens live in `~/.zshrc` exports and `~/.cursor/mcp.json`. Never copy them into the repo, `.mcp.json`, or `~/.claude.json`, and never print their values (check with `[ -n "$VAR" ] && echo set`).
