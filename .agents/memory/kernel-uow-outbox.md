---
name: DeltaOps kernel UoW/outbox contracts
description: Rules future DeltaOps modules must follow when using @workspace/kernel
---
Rules for building on `@workspace/kernel` (lib/kernel):
- Module repositories on PostgreSQL MUST write via `pgSessionOf(uow)` (the UoW's PoolClient), never the injected Pool — otherwise data commits outside the outbox transaction.
- Event handlers MUST be idempotent: outbox delivery is at-least-once (lease expiry/replay can redeliver). Outbox claiming uses `FOR UPDATE SKIP LOCKED` + `claimed_until` lease.
- Dead-letter transition is atomic (`markDead` buries + acks in one tx); never re-add a separate bury+ack path.

**Why:** an architect review flagged non-atomic UoW and duplicate-dispatch races in the first kernel version; these contracts are the fix and are enforced by `lib/kernel/src/__tests__/kernel.pg.test.ts`.

**How to apply:** any DGP-003+ module registering commands/handlers on the kernel runtime.
