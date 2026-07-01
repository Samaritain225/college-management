---
name: tailwind-v4-theming
description: Use when making color, font, or theme changes. Prevents creating tailwind.config.js in Tailwind v4.
---

# Tailwind v4 Theming Conventions

- Do NOT create `tailwind.config.js` or `tailwind.config.ts`.
- All customization is defined in `src/index.css` using the `@theme` and `@theme inline` blocks.
- Map semantic tokens (e.g. `--background`, `--foreground`, `--border`, `--primary`) in `:root` and map them to tailwind utilities inside `@theme inline`.
