---
name: offline-first-sync-rules
description: Use when editing database queries, schema, or logic touching financial data.
---

# Offline-First & Sync Rules

- **Strict Append-Only**: Never use `UPDATE` or `DELETE` on financial records (`expenses`, `contributions`, `investors`, `budget_categories`).
- **Corrections**: Correct erroneous entries only by inserting a reversing row (e.g. expenses use `reverses_expense_id`).
- This design prevents offline-sync conflicts and ensures eventual consistency.
