---
name: drizzle-zod identity columns
description: createInsertSchema already excludes GENERATED ALWAYS AS IDENTITY columns
---
Rule: with drizzle-zod (zod v4), `createInsertSchema(table).omit({ id: true })` throws `Unrecognized key: "id"` when `id` is `generatedAlwaysAsIdentity()` — the insert schema already excludes it.

**Why:** identity columns can't be inserted, so drizzle-zod drops them before omit runs; zod v4 `.omit` is strict about unknown keys.

**How to apply:** only omit columns that actually exist in the insert schema (e.g. timestamps); never omit generated identity PKs.
