# Expense Receipt Preview Design

Date: 2026-07-29  
Status: Approved in conversation

## Goal

Show an uploaded expense receipt directly inside the expense detail dialog so
the user can compare the supporting document with the ledger entry without
leaving the application.

The preview supports every format accepted by the existing upload flow:
JPEG/JPG, PNG, WebP, and PDF.

## Scope

This change affects only receipt presentation in the expense detail dialog. It
does not change uploads, R2 object keys, database columns, expense creation, or
the append-only financial-data rules.

The separate mobile navigation-trigger visibility issue is deliberately outside
this specification and will be designed as a focused follow-up.

## Selected Layout

Use the approved “full-width, contained preview” layout:

- Place the preview in the existing “Pièce justificative” section.
- Give the frame the available dialog width and a bounded responsive height.
- Preserve the whole image with `object-fit: contain`; never crop a receipt.
- Render PDFs in the same frame with the browser's embedded PDF viewer.
- Keep the filename and “Ouvrir l’original” below the frame.
- Clicking an image opens a larger in-app lightbox.
- Do not make opening a new tab the primary interaction.

On mobile, the expense dialog remains the scroll container. The preview receives
a viewport-aware maximum height so it cannot push the dialog controls beyond
reach. A PDF may scroll inside its own frame.

## Component Boundary

Create a small attachment-preview component outside `ExpensesPage.tsx`.
`ExpensesPage.tsx` is already large and should only decide whether it has an
uploaded receipt, a legacy text reference, or no receipt.

The preview component receives:

- the resolved public URL;
- a display filename derived from the object key;
- the stored object key, used for format detection;
- accessible text identifying the expense receipt.

It owns:

- image/PDF format detection;
- loading and failure presentation;
- image lightbox state;
- the original-file fallback action.

Format detection is case-insensitive and based on the server-derived extension:
`.jpg`, `.jpeg`, `.png`, `.webp`, or `.pdf`. An unknown extension uses the
fallback state instead of attempting an unsafe or misleading embed.

## Existing Data Compatibility

Uploaded object keys contain a path and already resolve through `publicUrl()`.
Those keys receive the new preview.

Legacy `receipt_key` values such as `RECU-TEST-001` are handwritten references,
not R2 objects. They continue to render as text and must not be passed to the
preview component.

An expense with no receipt continues to show the existing empty state.

## States and Error Handling

The preview frame has explicit states:

1. **Loading:** neutral skeleton or progress indicator inside the reserved frame.
2. **Image ready:** contained image, clickable for the larger view.
3. **PDF ready:** embedded PDF viewer inside the frame.
4. **Preview unavailable:** concise message inside the frame with the original
   file action still available.
5. **Unknown format:** file card and original-file action, without embedding.

A failed preview must not fail or close the expense dialog. The original file
link always uses `target="_blank"` with `rel="noreferrer"`.

Because native embedded PDF support varies by browser, the PDF frame retains a
clearly visible fallback link. This design does not add a PDF rendering library
or its bundle cost.

## Accessibility

- The image preview is a real button with a descriptive accessible name.
- The preview image has meaningful alternative text.
- The enlarged image view is keyboard accessible, traps focus, closes with
  Escape, and returns focus to the preview trigger.
- Loading and error text remain readable without relying on color alone.
- The original-file action has a visible focus state and names its new-tab
  behavior.

## Verification

Verify the following against a production-style R2 URL:

- JPEG/JPG, PNG, and WebP render without cropping.
- Each image opens and closes the in-app enlarged view by pointer and keyboard.
- PDF renders in the bounded frame where the browser supports inline PDFs.
- PDF fallback remains usable where native embedding is unavailable.
- A missing object produces the unavailable state without breaking the dialog.
- A legacy text receipt remains text.
- An expense without a receipt retains its empty state.
- The dialog remains scrollable and all controls remain reachable at narrow and
  short mobile viewports.
- Desktop layout remains contained within the current dialog width.

Run the repository's real type-check/build command and lint after implementation,
then complete the responsive UI checklist.
