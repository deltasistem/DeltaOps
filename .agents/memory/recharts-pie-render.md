---
name: Recharts pie renders tiny
description: Donut/pie appears as a tiny fragment in screenshots; cause and fix
---

A Recharts `PieChart` inside a `ResponsiveContainer` can appear as a tiny fragment
(not a full donut) in screenshots while a sibling `BarChart` in the same grid renders
fine.

**Why:** the pie's entrance animation grows the radius from 0; the screenshot tool
captures an early animation frame. The data and sizing are actually correct.

**How to apply:** set `isAnimationActive={false}` on the `<Pie>` for dashboards/charts
that need to be correct in static captures. Adding a `<Legend>` and slightly larger
`outerRadius` also helps legibility. Not a layout/measurement bug — don't chase
ResponsiveContainer sizing.
