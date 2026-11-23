# NumeraRush

A real-time multiplayer mental-arithmetic arena.

## Brief Description
NumeraRush is a real-time multiplayer mental-arithmetic game where players construct target numbers from shared card sets using basic operations. Built with exact rational arithmetic (BigInt fractions), server-authoritative WebSocket gameplay, and local-first PowerSync replication for live leaderboards.

## Demo

*Live demo link will be added upon deployment*

## Architecture

This project uses a **hybrid dual-path architecture**:

- **Hot Path (Low-Latency Gameplay):** Browser ↔ WebSocket ↔ Server In-Memory Rule Engine. Active moves, validation, timers, and win detection run strictly in server memory over WebSockets.

- **Read / Sync Path (Local-First Replication):** Server → Supabase PostgreSQL → PowerSync Cloud → Embedded WASM SQLite in each browser. Live leaderboards and progress bars are queried reactively from local browser SQLite.

## Engineering Decisions

- **Exact Rational Arithmetic:** All math uses `BigInt` fractions to eliminate IEEE-754 floating-point bugs (e.g., `8 / (3 - 8/3) === 24` evaluates exactly).
- **Constructive Puzzle Generation:** Guarantees 100% solvable puzzles across 4 difficulty tiers including 7-card `scott_wu` mode, with verified optimal solution traces.
- **Server-Authoritative Rules:** Only the server determines round winners and scores; browsers never self-declare wins.
- **PowerSync Local-First:** Leaderboards and live race data are served from embedded SQLite in the browser, zero REST polling.

## Quickstart

```bash
pnpm install
pnpm dev
```

## License

See LICENSE for details.