# AGENTS.md

Working guide for humans and AI coding agents in the NumeraRush repository.

## Overview & Stack

NumeraRush is a two-player arithmetic card duel: players combine number cards with
`+ - * /` to hit a target exactly, and the server resolves every round. The repo is a
`pnpm` workspace monorepo on Node 22+.

| Layer | Stack |
| --- | --- |
| Language | TypeScript 5.6, `strict` everywhere; Zod 3 for every wire schema |
| `apps/server` | Fastify 5 + `@fastify/websocket`, Supabase Postgres via service role |
| `apps/web` | React 19, Vite 6, Tailwind v4, Zustand 5, PowerSync WASM SQLite replica, WebGPU scene |
| Tooling | Biome (lint + format), Vitest, tsup, Docker Compose for local infra |

## Commands

Run from the repository root.

```bash
pnpm install          # install workspace dependencies
pnpm dev              # server (:4000) + web (:5173) in parallel
pnpm check            # Biome lint + format check (read-only)
pnpm check:fix        # apply Biome fixes
pnpm typecheck        # tsc --noEmit across every package
pnpm test             # Vitest across every package
pnpm build            # build shared -> server (tsup) -> web (vite)
```

Before every commit: `pnpm check && pnpm typecheck && pnpm test && pnpm build` must all
exit `0`.

## Repository Map

- `packages/shared` — protocol schemas, constants, and the exact `Rational` math engine.
- `apps/server` — authoritative game rooms, rule engine, puzzles, bots, Elo, WebSocket I/O.
- `apps/web` — React client, Zustand stores, PowerSync replica, WebGPU ink renderer.
- `infra` — Supabase SQL migrations, PowerSync sync config, local Docker Compose files.

## Architectural Invariants

- **Exact arithmetic.** Card moves are evaluated with the `BigInt` `Rational` engine in
  `@numera/shared`. Never use IEEE-754 `number` math for gameplay values.
- **Server authority.** `apps/server` validates moves, decides round and match winners,
  awards points, computes Elo, and is the only writer to Supabase tables. `apps/web`
  renders state; it never decides outcomes.
- **Local-first reads.** `LiveRacePanel` and `LeaderboardDrawer` read exclusively from the
  local PowerSync SQLite replica through `useQuery` from `@powersync/react`. No REST
  polling, no duplicated leaderboard state in Zustand.
- **Pure domain logic.** Math, puzzle generation, rule evaluation, and Elo live in pure,
  unit-tested functions under `packages/shared` and `apps/server/src/engine/`.

## Boundaries

- Never commit `.env` files, Supabase service-role keys, or hardcoded PowerSync tokens.
  Only `.env.example` templates belong in Git.
- Never swap core libraries for alternatives (no Express, Socket.IO, ESLint/Prettier,
  MUI/Chakra, or Redux) without explicit approval.
- Never add `Co-authored-by:` trailers, and never set an AI agent, bot, or tool as Git
  author or committer. Every commit is authored and committed by the repository owner.
- Never bypass the verification suite above, and never weaken a test to make it pass.
