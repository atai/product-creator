# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

