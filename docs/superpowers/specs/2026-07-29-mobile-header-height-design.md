# Mobile Header Height Design

## Goal

Give the mobile application header slightly more vertical breathing room without
changing the established tablet or desktop layout.

## Behavior

- Below the `md` breakpoint (`768px`), increase the header height by exactly
  10%, from `48px` to `52.8px` (`3.3rem`).
- At `768px` and wider, retain the existing `48px` (`3rem`) header height.
- Keep the mobile menu trigger at `44px`; the extra height becomes balanced
  vertical space around the control.
- Preserve the existing breadcrumb truncation, user menu placement, colors,
  spacing, and interaction behavior.

## Implementation

Change only the responsive height classes on the `Header` element in
`src/components/AppShell.tsx`. No reusable component or design token is needed
for this one-off shell dimension.

## Verification

- At `375px`, the header is `52.8px` tall, the menu target remains at least
  `44px`, and the page has no horizontal overflow.
- At `768px` and `1280px`, the header remains `48px` tall.
- Long breadcrumbs stay on one line and remain contained.
- TypeScript, lint, and the production build pass.
