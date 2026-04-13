# Polymarket Intelligence Agent

Polymarket Intelligence Agent is a Next.js application for exploring live Polymarket markets, selecting the markets that matter, and running persisted AI analysis strategies against them. It is built as a Superteam submission and packaged to run cleanly inside Docker for Nosana-style deployments.

## What the app does

- Pulls live market data from the Polymarket Gamma API.
- Stores synced markets, strategy definitions, runs, and generated signals in SQLite via Prisma.
- Lets users select markets across filtered views and run a strategy on the selected set.
- Persists the full reasoning, action, confidence, and run metadata for later review.
- Shows market details, liquidity, and the most recent stored analysis in the dashboard.
- Falls back to deterministic mock analysis when the upstream AI service is unavailable.

## Features

- Signal Alpha Engine: Flags mispriced outcomes by comparing AI fair value against live market price.
- Deep Reasoning Logs: Persists structured reasoning sections (market context, sentiment analysis, final verdict) for auditability.
- Multi-Agent Personas: Toggle between Contrarian, Quant, News Junkie, and Balanced analyst modes.
- Nosana-Ready Architecture: Built for low-latency inference with resilient fallback handling when upstream inference is unavailable.
- Per-Market Analysis Modal: Run analysis directly on a single market, inspect latest signal context, and review recent analyses without leaving the modal.
- Venue Deep Links: Open high-conviction markets and modal markets directly on Polymarket/Kalshi pages from the dashboard.
- Market-Scoped Simulation Insights: View market-specific simulation PnL-over-time in the modal, including bet-placement timestamp and session controls.
- Simulation Session Management: Delete simulation sessions from the modal with confirmation and automatic dashboard refresh.

## Core workflow

```mermaid
sequenceDiagram
    actor User
    participant UI as Next.js Dashboard
    participant Markets as Markets API
  participant Compare as Comparison API
    participant Strategies as Strategies API
    participant Runs as Strategy Runs API
  participant Sims as Simulations API
    participant Runner as Strategy Runner
    participant Eliza as Eliza Agent
    participant DB as SQLite via Prisma

    User->>UI: Open dashboard
    UI->>Markets: GET /api/markets
    Markets->>DB: Upsert market snapshot
    DB-->>Markets: Stored markets
    Markets-->>UI: Paginated market data
    UI->>Strategies: GET /api/strategies
    Strategies->>DB: Ensure default strategy
    DB-->>Strategies: Active strategies
    Strategies-->>UI: Strategy list
    User->>UI: Select markets and run strategy
    UI->>Runs: POST /api/strategy-runs
    Runs->>Runner: Execute selected strategy
    Runner->>Eliza: Analyze market batches
    Eliza-->>Runner: Signals with reasoning
    Runner->>DB: Persist run + signals
    DB-->>Runner: Stored results
    Runner-->>Runs: Completed run summary
    Runs-->>UI: Run id and status
    UI->>Runs: GET /api/strategy-runs/:id
    Runs->>DB: Load stored signals
    DB-->>Runs: Run details
    Runs-->>UI: Persisted analysis results

    User->>UI: Open cross-platform comparison
    UI->>Compare: GET /api/markets/comparison
    Compare->>DB: Read synced market snapshots
    DB-->>Compare: Polymarket + venue data
    Compare-->>UI: Arbitrage candidate list

    User->>UI: Simulate selected signal
    UI->>Sims: POST /api/simulations
    Sims->>DB: Create session/positions/snapshots
    DB-->>Sims: Stored simulation state
    Sims-->>UI: Session id + current PnL
    UI->>Sims: GET /api/simulations/:id
    Sims->>DB: Load market-scoped history
    DB-->>Sims: Simulation timeline
    Sims-->>UI: PnL-over-time chart data
```

## Stack

- Next.js App Router with React and TypeScript
- Prisma ORM with SQLite persistence
- ElizaOS API client for strategy execution
- Tailwind CSS and custom UI primitives
- Recharts for dashboard analytics
- Zod for input validation

## Environment

Copy `.env.example` to `.env` for local development.

```env
DATABASE_URL=file:./prisma/dev.db
ELIZA_AGENT_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=Polymarket Intelligence Agent
POLYMARKET_MOCK_MODE=false
```

Notes:

- `DATABASE_URL` uses SQLite. Local development defaults to a file inside `prisma/`.
- Docker defaults to `file:/app/data/polymarket.db` so the database can live on a mounted volume.
- `POLYMARKET_MOCK_MODE=true` forces mock market and signal behavior for offline demos.

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Generate the Prisma client.

```bash
npm run prisma:generate
```

3. Apply the local migration history.

```bash
npm run prisma:migrate -- --name init
```

4. Seed the local database with starter markets and the default strategy.

```bash
npm run prisma:seed
```

5. Start the development server.

```bash
npm run dev
```

6. Open `http://localhost:3000`.

## How to use the app

1. Open the dashboard and let the market sync finish.
2. Search or page through Polymarket markets.
3. Click a market to open the analytics modal and run per-market analysis.
4. In the modal, select a strategy, run analysis, and inspect latest signal reasoning.
5. Use Simulate to add the latest market signal to a paper-trading simulation session.
6. Review simulation PnL-over-time for that market and manage sessions directly in the modal.
7. Use the History & Batch Operations panel when you need cross-market/batch analysis workflows.

## Docker deployment

The production container now does three things on startup:

1. Ensures the SQLite directory exists.
2. Runs `prisma migrate deploy`.
3. Starts the Next.js server on `0.0.0.0:3000`.

Build the image:

```bash
docker build -t polymarket-intelligence-agent .
```

Run the container directly:

```bash
docker run --rm \
  -p 3000:3000 \
  -e ELIZA_AGENT_URL=http://host.docker.internal:3001 \
  -e DATABASE_URL=file:/app/data/polymarket.db \
  -v polymarket_data:/app/data \
  polymarket-intelligence-agent
```

Run with Docker Compose:

```bash
docker compose up --build
```

Compose uses a named volume for SQLite persistence and maps `host.docker.internal` so the container can reach an Eliza service running on the host.

## Nosana deployment notes

For Nosana, use the Docker image produced from this repository as the job container that serves the Next.js app. The important runtime settings are:

- Expose port `3000`.
- Set `ELIZA_AGENT_URL` to the reachable Eliza endpoint for the job.
- Keep `DATABASE_URL=file:/app/data/polymarket.db` or another writable SQLite path.
- Mount a writable volume to `/app/data` if the job runtime supports persistence.

If the job environment is ephemeral, the app still works, but strategy runs and market history will be lost between executions.

## Production commands

```bash
npm run build
npm run lint
npm run prisma:migrate:deploy
npm run start
```

## Repository highlights

- `app/dashboard/page.tsx`: dashboard, selection flow, and strategy execution UX.
- `app/api/markets/route.ts`: Polymarket sync plus DB upsert.
- `app/api/markets/comparison/route.ts`: heuristic cross-market arbitrage scanner (Polymarket vs Kalshi/Jupiter).
- `components/MarketDetailModal.tsx`: per-market analysis modal, venue links, and simulation chart/session controls.
- `components/HighConvictionGrid.tsx`: high-confidence signal cards with direct venue links.
- `app/api/simulations/[id]/route.ts`: simulation detail, status updates, and session deletion.
- `app/api/strategies/route.ts`: active strategies, including the default strategy.
- `app/api/strategy-runs/route.ts`: run execution and history listing.
- `lib/strategy-runner.ts`: strategy orchestration and signal persistence.
- `prisma/schema.prisma`: SQLite schema for markets, signals, strategies, and runs.

## Operational notes

- The app stores strategy results in SQLite, not just in memory.
- The default strategy is created automatically if it does not already exist.
- If Eliza is unavailable, mock analysis keeps the UI functional for demos and testing.
- Cross-market arbitrage recommendations are advisory heuristics (not auto-trading execution).
- Simulation widgets in the market modal are scoped to the currently opened market.
- Strategy scheduling fields exist in the data model, but automatic scheduled execution is not implemented yet.
