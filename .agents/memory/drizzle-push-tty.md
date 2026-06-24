---
name: Drizzle push needs TTY
description: Why drizzle-kit push fails in this environment and how to apply schema DDL instead
---

`drizzle-kit push` and even the `push-force` script fail in this environment with
"Interactive prompts require a TTY terminal" whenever the change triggers
drizzle-kit's `pgSuggestions` prompt (e.g. adding a UNIQUE constraint or any
potentially-destructive column change).

**Why:** the agent shell is non-interactive (no TTY); drizzle-kit blocks waiting
for confirmation.

**How to apply:** for safe, well-understood DDL (e.g. adding a UNIQUE constraint
when data is already unique), apply it directly via SQL (`executeSql` in the code
sandbox or the database skill): `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE (...)`.
Verify there are no conflicting rows first. Keep the Drizzle schema file in sync so
future fresh pushes match.
