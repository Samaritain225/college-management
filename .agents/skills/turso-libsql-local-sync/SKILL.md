---
name: turso-libsql-local-sync
description: Use when modifying src/db/client.ts or local database sync behavior.
---

# Turso / libSQL Local Sync Conventions

- Local database replicas sync using `client.sync()`.
- Keep the try-catch block inside `trySync()` simple and silent to prevent errors from breaking offline usability when connectivity is unavailable.
- Note browser/OPFS limitations compared to Tauri's native filesystem replicas.
