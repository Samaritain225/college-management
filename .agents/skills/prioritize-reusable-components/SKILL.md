---
name: prioritize-reusable-components
description: Rules and guidelines for prioritizing reusable components over inline implementations to ensure consistent styling, easy theme changes, and clean codebase organization.
---

# Reusable Component Conventions

To ensure visual consistency, maintainable themes, and easy visual tweaks, we follow strict component reuse rules:

## 1. Prioritize Reusable Components
*   **Do not duplicate UI patterns**: If you see a card, progress bar, chart, or data representation style being repeated, create a reusable component in `src/components` or extract it locally if specific to a feature.
*   **Encapsulate layout patterns**: Things like dashboard grids, statistics wrappers, and status indicators should be encapsulated.

## 2. Theme & Design Consistency
*   **No custom inline sizes/colors where possible**: Avoid ad-hoc inline font size declarations (`style={{ fontSize: "12px" }}`) or custom color strings. Instead, leverage design system utilities or clean Tailwind configuration.
*   **Use semantic styling**: Rely on core tokens (`text-xs`, `text-sm`, `text-muted-foreground`, `font-bold`, `bg-card`, `border-border/40`).
*   **Keep layouts standard**: Ensure components share height classes, padding configurations, and alignments.

## 3. Implementation Process
1.  **Audit**: Before writing inline UI code, check if there is an existing component in `src/components/ui` or `src/components`.
2.  **Extract**: If a pattern is reused in multiple places or has detailed style configurations, extract it into a small component.
3.  **Parameterize**: Allow customizations (like title, description, values, trends, icons) via TypeScript interfaces.
