# OutBox - Outbound Email Infrastructure

OutBox is a production-ready, highly concurrent email scheduling platform. Designed as a "Command Center for Outbound Communication," it provides robust guarantees for delayed execution, rate limiting, and exact-time delivery.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-005571?style=for-the-badge&logo=elasticsearch)

---

## 🚀 Key Capabilities

- **Precision Scheduling without Cron:** Powered by BullMQ and Redis ZSETs for exact-time execution without polling.
- **Strict Delivery Guarantees:** 100% idempotency via UUID job tracking and Ethereal SMTP message ID reconciliation.
- **Smart Rate Limiting:** Atomic sliding-window rate limiting via Redis Lua scripts. Jobs exceeding the limit are safely delayed to the next hourly window, never dropped.
- **Command Center UI:** A premium, dark-mode focused React frontend featuring interactive CSV parsing, multi-sender toggling, and live data polling.
- **Robust Search:** Full-text search over millions of records using Elasticsearch, with graceful fallback to PostgreSQL.
- **Enterprise Integrations:** Real OAuth 2.0 flows for both Google (Authentication) and Slack (Real-time alerting for rate limit triggers).

---

## 🏗 Architecture

```text
+-----------------------------------------------------------------------------------+
|                                 FRONTEND (React + Vite)                           |
|  - Real Google OAuth & Instant Demo Login                                         |
|  - Real Slack OAuth Authorization                                                 |
|  - CSV Lead Parser (Client-side validation & duplicate removal)                   |
|  - Scheduled & Sent Email Tables (Paginated, Searchable via Elasticsearch)        |
+----------------------------------------+------------------------------------------+
                                         | HTTP / REST (JWT Cookie)
                                         v
+-----------------------------------------------------------------------------------+
|                              BACKEND API (Express.js)                             |
|  - Auth Controllers (Google ID Token -> HttpOnly Session Cookie)                  |
|  - Email Scheduling Endpoint (Zod Validation -> DB Tx -> Queue Add)               |
|  - Slack OAuth Controller (Exchange Auth Code -> AES-256 Encrypted Storage)       |
|  - Search API (Routes query to Elasticsearch, degrades gracefully to Postgres)    |
|  - BullBoard Dashboard Route (/admin/queues - Protected Session)                  |
+-------------------+--------------------+--------------------+---------------------+
                    |                    |                    |
        Transactional |                    | Queue Job          | Sync / Index
        Read / Write|                    | Enqueue            |
                    v                    v                    v
         +------------------+    +------------------+    +------------------+
         |    PostgreSQL    |    |   Redis / BullMQ |    |  Elasticsearch   |
         |  - Users         |    |  - Delayed ZSET  |    |  - email_index   |
         |  - Senders       |    |  - Waiting Queue |    |    (Full text)   |
         |  - Emails        |    |  - Sliding Window|    +------------------+
         |  - Slack Tokens  |    |    Lua Counters  |
         +------------------+    +--------+---------+
                                          |
                                          | Job Pickup (Worker Concurrency = 10)
                                          v
+-----------------------------------------------------------------------------------+
|                               BULLMQ WORKER PROCESS                               |
|  1. Pick up delayed job from Redis ZSET                                           |
|  2. Atomic State Transition in PostgreSQL (QUEUED -> PROCESSING)                  |
|  3. Atomic Redis Sliding-Window Rate Limit Check per Sender (Lua Script)          |
|     |                                                                             |
|     +---> IF LIMIT EXCEEDED:                                                      |
|     |     - Calculate delay until next hourly window                              |
|     |     - Move job to delayed state (DO NOT FAIL OR DROP)                       |
|     |     - Dispatch Slack Notification (if connected & deduplicated)             |
|     |                                                                             |
|     +---> IF WITHIN LIMIT:                                                        |
|           - Execute SMTP send via Nodemailer / Ethereal Mail                      |
|           - Update DB: status = SENT, providerMessageId = Ethereal ID             |
|           - Sync state change to Elasticsearch                                    |
|           - Enforce inter-email minimum delay before releasing worker thread      |
+-----------------------------------------------------------------------------------+
```

---

## 🛡 Idempotency & Resiliency

1. **Deterministic Job IDs:** Every BullMQ job ID matches the corresponding PostgreSQL Email primary key UUID (`email.id`).
2. **Atomic DB State Locks:** The worker executes `UPDATE emails SET status = 'PROCESSING' WHERE id = $1 AND status IN ('SCHEDULED', 'QUEUED', 'RATE_LIMITED') RETURNING id`. If 0 rows are updated, execution safely halts, preventing duplicate processing.
3. **Provider Tracking:** Ethereal SMTP message IDs are stored upon send completion. In the event of a worker crash and retry, existing provider IDs act as a circuit breaker against duplicate dispatches.
4. **Crash Recovery:** If the backend or worker process crashes, delayed jobs remain persisted in Redis. Upon restart, jobs are picked up precisely where they left off.

---

## ⚡ Quick Start Guide

### Prerequisites
- **Node.js**: v18+ or v20 LTS
- **Docker & Docker Compose**: For local PostgreSQL, Redis, and Elasticsearch containers

### 1. Launch Infrastructure
Start PostgreSQL (port 5432), Redis (port 6379), and Elasticsearch (port 9200) using Docker Compose:
```bash
docker-compose up -d
```

### 2. Environment Configuration
Create environment files from the provided templates:
```bash
cp .env.example .env
```

### 3. Install Dependencies & Setup Database
Run the setup script from the project root:
```bash
# Install backend and frontend dependencies
npm run setup

# Apply database schema
cd backend
npx prisma db push
cd ..
```

### 4. Run Application Components
Launch all processes concurrently:

```bash
# Terminal 1: API Server
npm run dev:backend

# Terminal 2: BullMQ Worker Process
npm run dev:worker

# Terminal 3: React Frontend Dashboard
npm run dev:frontend
```

Open your browser at:
- **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000) (or the port specified by Vite)
- **Backend API:** [http://localhost:5000](http://localhost:5000)
- **Live BullMQ Board:** [http://localhost:5000/admin/queues](http://localhost:5000/admin/queues)

---

## 🔧 Production Deployment

OutBox includes a pre-configured `render.yaml` Blueprint for 1-click infrastructure deployment on [Render](https://render.com). 

The Blueprint provisions:
- Render Static Site for the React SPA
- Render Web Service for the Express API
- Render Background Worker for BullMQ
- Managed PostgreSQL and Redis (Key Value) instances
- Private Elasticsearch Docker deployment on a persistent disk

See the internal Render Blueprint configuration (`render.yaml`) for exact environment requirements.

---

*Designed for high-throughput outbound email delivery.*
