# AGENTS.md — Mandatory Engineering Guardrails

1. NEVER deviate from the directory structure, file paths, package names, database column names, or WebSocket message schemas defined in `IMPLEMENTATION_PLAN.md`.
2. NEVER substitute libraries (no Express, no Socket.IO, no ESLint/Prettier, no MUI/Chakra, no Redux).
3. NEVER use JavaScript floating-point `number` arithmetic to evaluate card moves. ALWAYS use the exact `BigInt` `Rational` engine from `@numera/shared`.
4. NEVER allow `apps/web` to determine round winners, compute scores, or write directly to Supabase tables. Only `apps/server` is authoritative.
5. NEVER fetch leaderboard or live-race data via REST APIs or duplicate them into Zustand. `LiveRacePanel` and `LeaderboardDrawer` MUST read exclusively from local PowerSync SQLite via `useQuery` from `@powersync/react`.
6. NEVER hardcode PowerSync dev tokens or Supabase service-role keys inside `apps/web`.
7. NEVER proceed to the next phase until the current phase's Verification Gate exits with status code `0`.
8. Keep all math, puzzle generation, rule evaluation, and Elo functions pure and unit-tested.
