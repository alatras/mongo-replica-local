# MongoDB Timeout & Transaction Reproduction

Local 3-member MongoDB replica set for testing timeouts, transactions, and failure scenarios.

## Setup

**Requirements:** Docker, Node.js 18+, mongosh

**1. Add hostnames to `/etc/hosts`:**

```bash
echo "127.0.0.1 mongo1 mongo2 mongo3" | sudo tee -a /etc/hosts
```

**2. Start replica set:**

```bash
npm install
npm run start:db
npm run init:rs
```

**3. Build and run test:**

```bash
npm run build
npm run run:tx
```

Connection string: `mongodb://mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0`

## Test Scenarios

**Lose majority (WriteConcernFailed):**
```bash
npm run stop:member -- mongo2
npm run stop:member -- mongo3
npm run run:tx
npm run start:member -- mongo2
npm run start:member -- mongo3
```

**Force stepdown:**
```bash
npm run stepdown
npm run run:tx
```

**Kill member (crash simulation):**
```bash
npm run kill:member -- mongo2
npm run run:tx
npm run start:member -- mongo2
```

**Operation timeout:**
```bash
export OP_MAXTIME_MS=1
npm run run:tx
```

## Configuration

Environment variables (defaults shown):
```bash
W_TIMEOUT_MS=2000       # Write concern timeout
MAX_COMMIT_MS=1500      # Transaction commit timeout
OP_MAXTIME_MS=1000      # Operation timeout
```

## Cleanup

```bash
docker compose down -v
```
