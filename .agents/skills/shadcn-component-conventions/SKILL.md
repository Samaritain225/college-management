---
name: shadcn-component-conventions
description: Use when creating or modifying files in src/components/ui.
---

# shadcn/ui Component Conventions

- Follow the React `forwardRef` + `cva` + `cn()` pattern for UI primitives.
- Put only one component per file.
- Do not add custom colors/overrides inside component files; use semantic classes (`bg-primary`, `border-border`, `text-muted-foreground`) to let the theme handle it.
