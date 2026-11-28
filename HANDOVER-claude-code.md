# Handover → Claude Code

Передано из сессии Claude (облако) 2026-11-28. Причина: облачной сессии нужен прямой доступ
к сети и env этого Mac, а у неё изолированная Linux-машина с прокси и без macOS-окружения.
Claude Code запускается в вашем zsh: env из `~/.zshrc` и прямая сеть (VPN, SSH, внутренние хосты).

## Как запустить

```zsh
cd ~/git/product-creator
claude
```
Первое сообщение: «Прочитай HANDOVER-claude-code.md и выполни раздел "Первые шаги"».

## Проект

- `product-creator` — pnpm-монорепо: `apps/`, `packages/`, `design-system/`, `docs/` (Sphinx), `scripts/`.
- Манифест: `product-creator.yml` (каталог фич в `docs/product`).
- Ветка `main`, синхронизирована с `origin/main` на момент передачи.
- Задачи: YouTrack, проект **PRODUCTCREATOR** — https://ecooz.youtrack.cloud/issue/PRODUCTCREATOR-5
- CLAUDE.md в репо пока нет — стоит создать после первого знакомства с кодом.

## Секреты — одна точка правды, без копий

- MCP-сервисы и их токены описаны в `~/.cursor/mcp.json`.
- Остальные ключи — экспорты в `~/.zshrc` (SonarQube, Paddle, emperor и т.д.), уже в env шелла.
- **Не копировать** секреты в `~/.claude.json`, `.mcp.json` проекта или в репо.
  Через `claude mcp add` их не добавлять — это сделает копию.

### Подключить MCP из Cursor без копирования (не проверено)

Claude Code читает внешний конфиг через `--mcp-config`. Отличие: HTTP-серверам нужен
`"type": "http"`, а у Cursor он часто не указан. Добавляем его на лету, файл на диске не меняется:

```zsh
# в ~/.zshrc
alias cc='claude --mcp-config <(jq ".mcpServers |= with_entries(if .value.url and (.value.type|not) then .value.type=\"http\" else . end)" ~/.cursor/mcp.json)'
```
Если process substitution не сработает — сообщить, подберём другой способ (тоже без копий).

Сервисы в конфиге: **youtrack** (ecooz.youtrack.cloud/mcp, токен), **GitLab** (gl.y.ecooz.net),
**sonarqube** (sq.y.ecooz.net, docker, токен из env), **mailoo**, **ai-trader**, **emperor**,
**paddle-docs / paddle-sandbox / paddle-live**, **keycloak**, **clarity**, **google-workspace**.
Только локальные (подключатся, если запущены): fusion-mcp-server, blender, kicad, comfy-mcp.

## Первые шаги

1. Проверить, что видны MCP-серверы (`/mcp`) и доступен YouTrack: открыть PRODUCTCREATOR-5.
2. Проверить GitLab и SonarQube через их MCP.
3. Если какой-то сервер не поднялся — проверить нужную переменную: `[ -n "$VAR" ] && echo set`
   (значения не печатать).
4. Изучить репо и создать `CLAUDE.md` (стек, команды сборки/тестов, конвенции).

## Замечания

- Токен Clarity лежит открытым текстом в аргументах `~/.cursor/mcp.json` и попал в лог облачной
  сессии. Рекомендуется перевыпустить и брать из env.
- В `.zshrc.backup` / `.zshrc.bak-*` в домашней папке лежат старые копии ключей — возможно, стоит удалить.
- Этот файл не закоммичен; удалить после передачи или добавить в `.gitignore`.
