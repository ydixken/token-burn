# Installation Guide

## Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Node.js | 20.0.0+ | LTS recommended |
| pnpm | 8.0.0+ | **Required** — npm and yarn are not supported |
| Docker Desktop | Latest | For PostgreSQL and Redis |
| Git | 2.x | For version control |

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd token-burn

# 2. Install dependencies
pnpm install

# 3. Start infrastructure (PostgreSQL, Redis)
cd infra && docker compose up -d && cd ..

# 4. Configure environment
cp .env.example .env
# Edit .env — generate a real encryption key:
# openssl rand -hex 32

# 5. Setup database
pnpm prisma generate
pnpm prisma migrate dev

# 6. Seed database (optional — adds sample data)
pnpm run db:seed

# 7. Start development server
pnpm run dev
```

Visit http://localhost:3000 to access the dashboard.

## All-in-One Setup (Taskfile)

If you have [Task](https://taskfile.dev/) installed:

```bash
pnpm install -g @go-task/task
task setup
```

This runs: install dependencies, start Docker, generate Prisma client, push schema, and seed the database.

## Step-by-Step Installation

### 1. Install pnpm

```bash
# Using corepack (recommended)
corepack enable
corepack prepare pnpm@latest --activate

# Or using npm (one-time only)
npm install -g pnpm
```

### 2. Install Project Dependencies

```bash
pnpm install
```

This installs all runtime and development dependencies defined in `package.json`.

### 3. Start Infrastructure Services

```bash
cd infra
docker compose up -d
```

This starts:

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL 16 | 5432 | Primary database |
| Redis 7 | 6379 | Cache and job queue |
| Redis Commander | 8081 | Redis admin UI (optional) |

Verify services are healthy:

```bash
docker compose ps
```

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values. See [CONFIGURATION.md](CONFIGURATION.md) for all available options.

**Critical**: Generate a real encryption key for production:

```bash
openssl rand -hex 32
```

### 5. Setup Database

```bash
# Generate Prisma client
pnpm prisma generate

# Apply migrations
pnpm prisma migrate dev

# (Optional) Seed with sample data
pnpm run db:seed
```

### 6. Start Development Server

```bash
pnpm run dev
```

The application is available at:
- Dashboard: http://localhost:3000
- API Health: http://localhost:3000/api/health
- Redis Commander: http://localhost:8081

## Production Deployment

### Using Docker Compose

```bash
docker compose -f infra/docker-compose.prod.yml up -d
```

This starts the full production stack:
- Next.js application (port 3000)
- 2x BullMQ worker replicas
- Nginx reverse proxy (ports 80/443)
- PostgreSQL with resource limits
- Redis with persistence

### Manual Deployment

```bash
# Build
pnpm run build

# Start production server
pnpm run start

# Start workers separately
node lib/jobs/workers/session-executor.ts
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed production deployment instructions.

## Verifying Installation

```bash
# Check health endpoint
curl http://localhost:3000/api/health

# Run tests
pnpm test

# Type check
pnpm run type-check

# Build check
pnpm run build
```

## Troubleshooting

### Docker containers won't start
```bash
# Check logs
cd infra && docker compose logs

# Reset everything
docker compose down -v
docker compose up -d
```

### Database connection errors
- Verify PostgreSQL is running: `docker compose ps`
- Check `DATABASE_URL` in `.env` matches Docker config
- Try `pnpm prisma migrate reset` to reset the database

### Redis connection errors
- Verify Redis is running: `docker compose ps`
- Check `REDIS_URL` in `.env`
- Test connection: `redis-cli -h localhost -p 6379 ping`

### Build errors
- Ensure Node.js >= 20: `node --version`
- Ensure pnpm is used (not npm/yarn): `pnpm --version`
- Regenerate Prisma client: `pnpm prisma generate`
- Clear build cache: `rm -rf .next && pnpm run build`
