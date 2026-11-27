# Product Creator Design System

Agent-facing package guide for `@pc/design-system`.

## Read order

1. This file — package contract.
2. `tokens.css` — source of truth for palette, radius, elevation.
3. Import `./tailwind` in the app entry CSS (includes tokens + Tailwind `@theme`).
4. Import `./chrome` for window shell and header chrome classes.

## Import in the desktop app

```css
@import '@pc/design-system/tailwind';
@import '@pc/design-system/chrome';
```

## Do

- Keep token names in `tokens.css` as the only place hex/oklch values change.
- Use semantic Tailwind utilities from the bridge (`bg-bg`, `bg-surface`, `text-fg`, `text-muted`, `border-border`, `bg-accent`, `text-danger`).
- Use chrome classes (`.app-shell`, `.app-header`, `.app-main`, `.app-nav-link`) for the window frame and header.

## Avoid

- Redefining `@theme` colors inside `apps/desktop`.
- Putting raw gray/blue/red palette utilities in new UI.
- Moving React components into this package — behaviour stays in the app.
