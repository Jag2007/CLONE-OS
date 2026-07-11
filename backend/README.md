## Razorpay Payment Integration

Add the following to your `.env` file:

```
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

Replace with your Razorpay dashboard credentials.
# CloneOS Backend - Orchestrator Service

A production-ready Node.js + TypeScript backend for the CloneOS application.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript (Strict mode)
- **Database**: PostgreSQL
- **ORM**: TypeORM
- **Queue**: BullMQ (Redis)
- **Validation**: Zod

## Architecture

Follows the Controller-Service-Repository pattern:

```
/src
  /config      - Environment, Database, Redis configuration
  /controllers - Request handling
  /services    - Business logic, Credit deduction, Queue dispatch
  /entities    - TypeORM Database Models
  /routes      - API endpoints
  /middleware  - Auth stub, Error handler
  /types       - TypeScript interfaces
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your database and Redis credentials

# Run in development mode
npm run dev

# Build for production
npm run build
npm start
```

## API Endpoints

### Actors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/actors` | Get all available actors |
| GET | `/actors/:id` | Get actor by ID |

### Projects (Requires Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects` | Create a new project |
| GET | `/projects` | Get user's projects |
| GET | `/projects/:id` | Get project by ID |
| POST | `/projects/:id/render` | Start video rendering |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users` | Create a new user |
| GET | `/users/me` | Get current user (auth) |
| GET | `/users/credits` | Get credits balance (auth) |
| POST | `/users/credits` | Add credits (auth) |

## Authentication

Currently uses a stub authentication via the `x-user-id` header.

```bash
# Example authenticated request
curl -X GET http://localhost:3000/users/me \
  -H "x-user-id: <user-uuid>"
```

## Render Flow

1. Client calls `POST /projects/:id/render` with `actorId`
2. Server validates user credits against actor cost
3. Credits are deducted transactionally
4. Job is added to `video-generation-queue` (BullMQ)
5. Returns `202 Accepted` with job ID

## Queue Integration

The backend dispatches jobs to BullMQ's `video-generation-queue`.

Job data structure:
```typescript
{
  projectId: string;
  userId: string;
  actorId: string;
  actorName: string;
  scriptText?: string;
  timestamp: string;
}
```

A separate Python worker (not included) should consume this queue.

## Hardcoded Actors

| ID | Name | Cost |
|----|------|------|
| actor-001 | Salman | 50 |
| actor-002 | Ryan | 45 |
| actor-003 | Emma | 40 |
| actor-004 | John | 35 |
| actor-005 | Sophia | 55 |
| actor-006 | Marcus | 30 |

## Error Handling

All errors return consistent JSON:

```json
{
  "success": false,
  "error": "Error message",
  "details": [] // Optional, for validation errors
}
```

## License

MIT