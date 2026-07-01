---
name: tailwind-v4-theming
description: Use when adding or modifying colors, fonts, or design tokens
  in this project. Tailwind v4 uses the @theme directive in CSS, not
  tailwind.config.js — trigger this before touching theming so you don't
  create a config file that won't be read.
---

# Tailwind v4 theming

This project uses Tailwind v4. Theme tokens are declared in
src/index.css inside an `@theme { ... }` block, not in a
tailwind.config.js file (v3 pattern — do not create one, it will be
ignored).

Current tokens (do not duplicate or rename without updating every
usage): --color-teal-950, --color-teal-900, --color-teal-100,
--color-terracotta-600, --color-terracotta-100, --color-paper,
--color-ink, --color-ink-soft, --color-positive, --color-positive-bg,
--color-negative, --color-negative-bg, --font-display, --font-sans.

To add a new token: add a `--color-*` or `--font-*` variable inside the
existing `@theme` block in src/index.css. It becomes usable immediately
as a Tailwind utility class (e.g. `--color-foo-500` → `bg-foo-500`,
`text-foo-500`).

Wrong: creating/editing tailwind.config.js for colors.
Right: editing the `@theme` block in src/index.css.
