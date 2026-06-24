---
name: Orval query-key invalidation
description: How to invalidate all filter variants of an Orval-generated list query
---

Orval generates `getListXQueryKey(params?)` returning `['/api/x', ...(params ? [params] : [])]`.
Calling it with the current `queryParams` produces a key specific to the active filter,
so `queryClient.invalidateQueries({ queryKey: getListXQueryKey(queryParams) })` only
refreshes that one filtered variant and leaves other cached variants stale after a
mutation.

**Why:** TanStack Query invalidation does prefix matching on the query key array.

**How to apply:** invalidate with the no-arg key — `getListXQueryKey()` returns just
`['/api/x']`, which prefix-matches every param variant and refreshes all of them.
