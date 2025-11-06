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

### Regular Test (With Timeouts - Throws Errors)

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

### Production Simulation (NO Timeouts - Hangs Indefinitely)

**⚠️ WARNING:** These tests have NO timeouts and will HANG INDEFINITELY if majority is lost (simulating production behavior). Use `Ctrl+C` to kill the process.

#### Option A: Hang on Write Operation

1. Start the no-timeout test:
```bash
npm run build
npm run run:tx-notimeout
```

2. When you see "💡 STOP NODES NOW! You have 5 seconds...", quickly run:
```bash
docker stop mongo2 mongo3
```

3. The script should **hang indefinitely** at the update operation.

4. Use `Ctrl+C` to kill, then restore:
```bash
docker start mongo2 mongo3
```

#### Option B: Hang on Commit (Most Common Production Scenario)

This reproduces the most common production case where operations complete but commit hangs:

1. Start the hang-on-commit test:
```bash
npm run build
npm run run:tx-hangcommit
```

2. Wait for the countdown (20 seconds), then when prompted, choose ONE of these:

   **Option 1: Network Partition (More Realistic)**
   ```bash
   npm run partition:member -- mongo2 mongo3
   ```
   This simulates a network partition where nodes stay running but become unreachable (closer to production behavior).

   **Option 2: Stop Containers (Simpler)**
   ```bash
   docker stop mongo2 mongo3
   ```
   This is simpler but the primary detects the failure faster and may throw an error instead of hanging.

3. The script should **hang indefinitely** at `commitTransaction()`!

4. Use `Ctrl+C` to kill, then restore:
   ```bash
   # If you used network partition:
   npm run restore:member -- mongo2 mongo3

   # If you used docker stop:
   docker start mongo2 mongo3
   ```

**Key differences in no-timeout tests:**
- `socketTimeoutMS=0` (infinite socket timeout)
- No `wtimeout` in write concern
- No `maxCommitTimeMS` on transaction
- No `maxTimeMS` on operations

This matches typical production configurations where timeouts are not explicitly set, causing commits to hang forever when replica set loses majority.

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
