# Agent Challenge — Polymarket Intelligence System

A Nosana × ElizaOS challenge submission built around a production-quality Polymarket analysis pipeline. This monorepo contains two deployable components: an ElizaOS AI agent and a Next.js Polymarket intelligence dashboard.

> **Challenge**: [Nosana × ElizaOS Agent Challenge](https://luma.com/calendar/cal-RF19mq3EtF4juLc) — win a share of **$3,000 USDC**.

---

## Repository Layout

```
agent/                              # ElizaOS agent (challenge submission core)
│   README.md                       # Agent setup, challenge brief, Nosana deployment
│   package.json
│   characters/
│   src/
polymarket-intelligence-agent/      # Next.js dashboard + strategy execution + simulation
│   README.md                       # App setup, architecture, API reference, Docker notes
│   app/
│   lib/
│   components/
│   prisma/
docker/
│   start-combined.sh               # Supervisor: runs agent + dashboard + LLM proxy together
│   llm-proxy.mjs                   # Nosana → OpenRouter fallback proxy
Dockerfile                          # Agent-only container (for Nosana deployment)
Dockerfile.fullstack                # Combined agent + dashboard container
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 23+ | Runtime for both components |
| pnpm | latest | Agent dependency management |
| npm | bundled with Node | Dashboard dependency management |
| Docker | latest | Container builds and fullstack runs |
| Git | any | Version control |

---

## Setup Instructions

### 1 — ElizaOS Agent

```bash
cd agent
cp .env.example .env           # Fill in Nosana endpoint and model settings
pnpm install
pnpm dev                       # Starts agent on http://localhost:3001
```

See [agent/README.md](agent/README.md) for full challenge brief, LLM configuration, and Nosana deployment steps.

### 2 — Polymarket Dashboard

```bash
cd polymarket-intelligence-agent
cp .env.example .env           # Set DATABASE_URL, ELIZA_AGENT_URL, etc.
npm install
npm run prisma:generate        # Generate Prisma client
npm run prisma:migrate         # Apply DB migrations (creates dev.db)
npm run prisma:seed            # Seed default strategy and starter markets
npm run dev                    # Starts dashboard on http://localhost:3000
```

See [polymarket-intelligence-agent/README.md](polymarket-intelligence-agent/README.md) for full environment reference and production setup.

---

## Usage Guidelines

### Run agent only

```bash
cd agent && pnpm dev
```

Exposes the ElizaOS agent API on `http://localhost:3001`. Useful for standalone agent development.

### Run dashboard only

```bash
cd polymarket-intelligence-agent && npm run dev
```

Dashboard connects to the agent at `ELIZA_AGENT_URL` (defaults to `http://localhost:3001`). If the agent is offline, the app falls back to OpenRouter (if `OPENROUTER_API_KEY` is set) or mock analysis.

### Run both locally (two terminals)

```bash
# Terminal 1
cd agent && pnpm dev

# Terminal 2
cd polymarket-intelligence-agent && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the dashboard.

### Run combined production container

```bash
# Build
docker build -f Dockerfile.fullstack -t agent-challenge-fullstack .

# Run
docker run --rm \
  -p 3000:3000 \
  -v agent_challenge_data:/app/data \
  -e OPENAI_BASE_URL="https://your-nosana-endpoint/v1" \
  -e OPENAI_API_KEY="nosana" \
  agent-challenge-fullstack
```

Open [http://localhost:3000](http://localhost:3000). The agent runs internally on port 3001 and the LLM proxy on port 4000 — only port 3000 (dashboard) is exposed.

### Key dashboard workflow

1. Open dashboard → markets load automatically from Polymarket.
2. Search for a specific market using the search bar (powered by Polymarket's public-search API).
3. Select one or more markets from the table.
4. Choose a strategy from the Strategies card.
5. Click **Analyze** to run the AI strategy on selected markets.
6. Review generated signals (BUY YES / BUY NO / MONITOR) with confidence scores and reasoning.
7. Click **Simulate** on any signal to open a paper-trading simulation.
8. Choose an outcome side (YES/NO) and bet size, then add the position to a simulation session.

---

## Environment Variables

Each component has its own `.env.example` — use those files as the authoritative reference. Common variables:

| Variable | Component | Purpose |
|----------|-----------|---------|
| `OPENAI_BASE_URL` | Agent | Nosana or compatible inference endpoint |
| `OPENAI_API_KEY` | Agent | API key (`nosana` for Nosana endpoint) |
| `OPENAI_LARGE_MODEL` | Agent | Model name for large tasks |
| `OPENAI_SMALL_MODEL` | Agent | Model name for small tasks |
| `ELIZA_AGENT_URL` | Dashboard | URL of the running ElizaOS agent |
| `DATABASE_URL` | Dashboard | SQLite path (e.g. `file:./prisma/dev.db`) |
| `OPENROUTER_API_KEY` | Dashboard | Optional fallback when Nosana is unreachable |
| `POLYMARKET_MOCK_MODE` | Dashboard | Set `true` to use mock data for offline demos |

---

## Code Quality

### Comments

- **Explain intent, not mechanics** — comment _why_ a decision was made, not what the line does if it is already obvious.
- **Document edge cases** — mark fallback paths, error handling assumptions, and API quirks with brief inline notes.
- **Keep comments current** — a stale comment is worse than no comment; update comments whenever behaviour changes.
- **Avoid noise** — do not add comments that restate what the code already clearly expresses.
- **Mark non-obvious integrations** — when calling an external API with specific parameter semantics (e.g. Polymarket `public-search` vs `markets` endpoint), note the reason at the call site.

### TypeScript

- Prefer explicit types for API responses and shared data structures (see `lib/types.ts`).
- Use Zod schemas for runtime validation of external API payloads (see `lib/polymarket.ts`).
- Avoid `any` except where a third-party type boundary genuinely requires it.

### API Routes

- All routes live in `app/api/` and follow Next.js App Router conventions.
- Each route validates its inputs before executing business logic.
- Error responses include a human-readable `error` or `message` field.

---

## Deployment

### Agent on Nosana

See [agent/README.md](agent/README.md) for step-by-step Nosana deployment. Key steps:
1. Build and push the Docker image to Docker Hub.
2. Claim Nosana builders credits at [nosana.com/builders-credits](https://nosana.com/builders-credits).
3. Submit the job using the Nosana CLI.

### Dashboard on any host

Build and run the standalone dashboard container:

```bash
docker build -f polymarket-intelligence-agent/Dockerfile \
  -t polymarket-dashboard \
  polymarket-intelligence-agent/

docker run --rm -p 3000:3000 \
  -v dashboard_data:/app/data \
  -e ELIZA_AGENT_URL="https://your-agent-url" \
  polymarket-dashboard
```

---

## Documentation Map

| Topic | Location |
|-------|---------|
| Challenge overview and prizes | [agent/README.md](agent/README.md) |
| Nosana deployment walkthrough | [agent/README.md](agent/README.md) |
| App architecture and sequence diagram | [polymarket-intelligence-agent/README.md](polymarket-intelligence-agent/README.md) |
| Full environment variable reference | [polymarket-intelligence-agent/README.md](polymarket-intelligence-agent/README.md) |
| Docker Compose usage | [polymarket-intelligence-agent/README.md](polymarket-intelligence-agent/README.md) |
| Prisma schema and DB operations | [polymarket-intelligence-agent/README.md](polymarket-intelligence-agent/README.md) |
| Production build commands | [polymarket-intelligence-agent/README.md](polymarket-intelligence-agent/README.md) |
