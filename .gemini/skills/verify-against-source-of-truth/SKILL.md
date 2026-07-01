---
name: verify-against-source-of-truth
description: Before extending or trusting hand-written code that approximates a known external library, framework convention, or official pattern (e.g. shadcn components, a library's official examples, a documented API contract), check whether you have access to the real source and verify against it — don't assume prior hand-written approximations in the codebase are correct just because they're already there and "look right." Especially relevant when the original author noted they didn't have registry/network access at the time.
---

# Verify against source of truth

If a previous session wrote code approximating something with a real,
checkable source (a shadcn component, a library's canonical example, an
API's actual response shape), and you now have access that the prior
session didn't (network, CLI, docs) — verify the existing code against
the real thing before building on top of it. Diff structurally:
prop/variant names, accessibility attributes, edge-case handling.

Flag and fix the discrepancies that change correctness or accessibility,
not stylistic choices made deliberately for this project (e.g. its
custom color tokens) — those are intentional, not approximation errors.
