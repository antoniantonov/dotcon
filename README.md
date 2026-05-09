# Dot Con

Interactive geopolitical world map. Hover over any country to see its name, capital, and metadata.

## Architecture

| Service   | Tech               | Port |
|-----------|--------------------|------|
| frontend  | React + react-simple-maps | 3000 |
| backend   | Go (gin)           | 4000 |
| db        | PostgreSQL 16      | 5432 |
| neo4j     | Neo4j 5 Community  | 7474 / 7687 |

## Quick Start

```bash
# Clone the repo
git clone https://github.com/antoniantonov/dotcon.git
cd dotcon

# (Optional) Copy and edit environment variables
cp .env.example .env

# Start everything
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

All services are configured via environment variables. See `.env.example` for defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `dotcon` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `dotcon` | PostgreSQL password |
| `POSTGRES_DB` | `dotcon` | PostgreSQL database name |
| `DATABASE_URL` | `postgresql://dotcon:dotcon@db:5432/dotcon` | Backend DB connection string (replace with cloud PG URL) |
| `BACKEND_PORT` | `4000` | Backend API port |
| `FRONTEND_PORT` | `3000` | Frontend port |
| `REACT_APP_API_URL` | `http://localhost:4000` | API URL used by frontend |
| `NEO4J_URI` | `bolt://neo4j:7687` | Neo4j Bolt URI |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `local-password` | Neo4j password |

### Connecting to a Cloud PostgreSQL

Replace `DATABASE_URL` in your `.env` file:

```
DATABASE_URL=postgresql://user:password@your-cloud-host:5432/dotcon
```

## Data Storage

PostgreSQL data is persisted in the `data/pgdata/` directory (git-ignored). The `countries` table is automatically created and seeded on first run.

Neo4j data is persisted in the `data/neo4j/` directory (git-ignored). Constraints and seed data are applied automatically on first run.

## Project Structure

```
├── docker-compose.yml      # Orchestration for all 4 services
├── .env.example            # Default environment variables
├── frontend/               # React application
│   ├── Dockerfile
│   ├── src/
│   │   ├── App.js          # Main application component
│   │   ├── WorldMap.js     # Interactive map component
│   │   └── index.js        # Entry point
│   └── public/
├── backend/                # Go API server (gin)
│   ├── Dockerfile
│   ├── go.mod
│   ├── go.sum
│   ├── main.go             # Entry point, PostgreSQL handlers
│   ├── neo4j.go            # Neo4j driver, type helpers, seed runner
│   └── graph.go            # /api/graph/* handlers
├── db/                     # Database initialization
│   ├── pg/                 # PostgreSQL initialization
│   │   ├── init.sql        # Schema (countries table)
│   │   └── seed.sql        # Country data seed
│   └── neo4j/              # Neo4j initialization
│       └── init/           # Cypher constraints and seed data
└── data/                   # Data volumes (git-ignored)
```

<img width="1793" height="927" alt="image" src="https://github.com/user-attachments/assets/c23b8438-dd67-45bb-a9d1-24491a91ccde" />

