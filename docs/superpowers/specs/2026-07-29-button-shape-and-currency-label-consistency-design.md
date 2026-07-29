# Button Shape and Currency Label Consistency

## Goal

Make interactive controls feel intentional and locally familiar by applying one
button-shape rule throughout the interface and displaying the CFA franc using
the wording users recognize.

## Button Shape Rule

- Every button containing visible text uses the shared `rounded-md` radius.
- Page-level `rounded-full` overrides are removed from text buttons, including
  primary create actions and dialog actions.
- The shared `Button` component remains the source of truth for text-button
  radius; pages should not restate the radius without a functional reason.
- Circular treatment remains valid for icon-only controls where the circle
  communicates a compact action, such as profile-photo controls or notification
  buttons.
- Avatars, status dots, and badges are not buttons and keep their established
  circular or pill shapes.
- Pagination and other compact icon controls may remain square with the shared
  moderate radius.

## Currency Wording

- Replace every user-visible `XOF` label with `F CFA`.
- This includes form labels, validation messages, placeholders, report labels,
  dialogs, and any other rendered copy.
- Existing formatted monetary values that already display `F CFA` remain
  unchanged.
- Internal storage, calculations, TypeScript names, database semantics, and
  technical comments may continue to use `XOF`; this change does not alter the
  currency or its integer representation.

## Scope

Audit the application source for:

- `Button` instances that override the shared radius;
- hand-written text buttons that visually compete with the shared component;
- user-visible strings containing `XOF`.

Do not refactor unrelated layout, color, typography, data flow, or financial
logic.

## Verification

- Search the rendered source to ensure no user-visible `XOF` remains.
- Confirm representative primary, secondary, destructive, dialog, and compact
  buttons follow the shape rule.
- Verify affected screens at 375px, 768px, and 1280px.
- Confirm mobile touch targets and keyboard focus states remain intact.
- Run the production build, type-check, lint, and diff checks.
