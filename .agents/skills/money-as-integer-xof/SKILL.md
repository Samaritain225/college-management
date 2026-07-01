---
name: money-as-integer-xof
description: Use when writing code or queries representing or calculating currency values.
---

# Currency (XOF) Calculations

- XOF (West African CFA franc) has no minor subdivision (no cents).
- All currency values must be represented and stored as plain integers, never floats.
- Never divide or assume decimal values in monetary calculations to avoid rounding bugs.
