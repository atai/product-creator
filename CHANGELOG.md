# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-28

### Added
- Add product vision, goals, actors, glossary, and tracker to product-creator.yml ([91bf27e](https://github.com/atai/product-creator/commit/91bf27e4a0464e9474ee8f60e7add29687667adc))
- Add catalog lint command and update CI workflow for product catalog validation ([b35d175](https://github.com/atai/product-creator/commit/b35d1750f26a14d64ea75b362a97c0a35f5a3741))

### Changed
- Update spec documentation to clarify screenshot capture behavior ([755114f](https://github.com/atai/product-creator/commit/755114f6a3b9c8ca8cb17504aa7899e1c47a268b))
- Implement screenshot capture functionality and enhance spec generation ([0bb4c50](https://github.com/atai/product-creator/commit/0bb4c5078fa95d01b900cd13991e0803eda7432d))
- Enhance graph layout and edge label handling ([f0cf523](https://github.com/atai/product-creator/commit/f0cf5239e5511b09b30257d001b747b28d0cd544))
- Update dependencies and enhance graph visualization features ([774aa56](https://github.com/atai/product-creator/commit/774aa5674d0d9dfdbc0e2dc1e3a8119ff8101417))
- Implement spec generation and documentation features ([17817f3](https://github.com/atai/product-creator/commit/17817f32d1d52a518dee1c98bf73ddb94369b946))
- Enhance data model and MCP documentation with product context and API updates ([1250f66](https://github.com/atai/product-creator/commit/1250f66f7ae7b88203d3e9c6c773844d928e5d99))
- Enhance feature and workflow management with tickets and code references ([7162c0f](https://github.com/atai/product-creator/commit/7162c0fd177bc9baeb72e9057da79beba398b1e0))
- Enhance FeatureForm and validation with spec fields support ([24337f2](https://github.com/atai/product-creator/commit/24337f26eca246d25d3ce5b3a2540d97ab243cf2))

### Removed
- PRODUCTCREATOR-32 Feature spec fields, lifecycle draft/approved/implemented/deprecated/removed, keep unknown card fields on read. ([ddfec25](https://github.com/atai/product-creator/commit/ddfec25ea5cc323eabc15df9d9186bdca0fd9b38))
- Remove deprecated sync mapping and feature YAML files for args, settings, updater, userData, and hooks from the desktop product documentation. ([04671de](https://github.com/atai/product-creator/commit/04671def80aea67c7b097845aafeec44ca23f7fd))

## [0.1.5] - 2026-11-27

### Removed
- Refactor project structure and dependencies: removed deprecated 'apps/pc' directory and updated related configurations ([16057c0](https://github.com/atai/product-creator/commit/16057c0d2228ef2d34081a78214b77074cd20623))

## [0.1.4] - 2026-11-27

### Added
- Update package.json and pnpm-lock.yaml to enhance version management scripts and add semver dependency ([08caf86](https://github.com/atai/product-creator/commit/08caf864cc98ba68d67d663dc7297fe8663749f7))
- Update package.json and source files to enhance copyright information and add repository links ([d2d50aa](https://github.com/atai/product-creator/commit/d2d50aaa2552bc437f11c3620ff8af5aefeb6df4))

### Changed
- PRODUCTCREATOR-16 Fix Windows dist build: quote the copyright argument for cmd.exe (it contains spaces) ([39ba4cf](https://github.com/atai/product-creator/commit/39ba4cf891da633fa3e8a703f39b503d8f9c8bb7))
- PRODUCTCREATOR-28 PRODUCTCREATOR-29 PRODUCTCREATOR-30 User and dev docs: features, migrate, validation, lint, plan-check MCP tools, code sync statuses ([9be264d](https://github.com/atai/product-creator/commit/9be264d2d0731b485ba3a04fa311877f1c678b6e))
- PRODUCTCREATOR-19 Rewrite document templates design to the decisions: YAML source of truth, Function→Feature, no new feature entity, generator later ([c41e597](https://github.com/atai/product-creator/commit/c41e59753b79dd3b873fbef7ff8d2f30ca9b8fca))
- Implement live window management and enhance OpenApiGenerationManager with cancelAll method ([caded90](https://github.com/atai/product-creator/commit/caded9084892cb8e3613cda550b66f6af0829b6b))
- PRODUCTCREATOR-29 UI and CLI: Problems page, impact on feature and object pages, business objects and Check in the feature form, product-creator lint ([12184e4](https://github.com/atai/product-creator/commit/12184e402fd0148dccae7ebda1bb81a2b395bb1c))
- PRODUCTCREATOR-29 MCP plan checks: validate_catalog, validate_plan, impact_of_change, find_duplicates, get_object; write tools return the model issues they were rejected for ([0e32e45](https://github.com/atai/product-creator/commit/0e32e453c91b89bc0bbd488f8df43fadd827948d))
- PRODUCTCREATOR-29 Model validation in core: references, field types, duplicates, schemas; Feature.objects; plan checks, impact, save guard; fix catalog file watcher (chokidar 4 has no globs) ([a1b6f6d](https://github.com/atai/product-creator/commit/a1b6f6d1206c2392ae1b6ec08684c1776b73f5b6))
- PRODUCTCREATOR-28 Migrate this repo's catalog: docs/product/desktop/functions/ -> features/ (12 cards, product-creator migrate) ([f6cf5ba](https://github.com/atai/product-creator/commit/f6cf5ba017d30a69317d30241e1a3d3384f3129f))
- PRODUCTCREATOR-28 Rename Function to Feature: features/ folder (functions/ still read), feature schema, API/MCP aliases, UI routes, migrate command ([917270d](https://github.com/atai/product-creator/commit/917270deb4f9573550486805a72ab968d4e575f0))

### Removed
- PRODUCTCREATOR-30 Code sync links code functions to features: linked/proposed/candidate/stale, link sets source_file and calls, create only on request, unlink instead of lifecycle removed ([8d592be](https://github.com/atai/product-creator/commit/8d592be23927c8a83d242f4c1b391fc6b92ce863))

