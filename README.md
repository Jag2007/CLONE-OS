# DCVerse Full Stack

Combined local workspace for the CloneOS backend and frontend.

## Folders

- `backend/` - Express + TypeScript API
- `frontend/` - React app

## Local Development

Install dependencies:

```bash
npm run install:all
```

Run both apps:

```bash
npm run dev
```

Run with local Postgres and Redis in Docker:

```bash
npm run dev:local
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Backend health: `http://localhost:3001/health`

## Environment Wiring

Frontend reads:

```bash
REACT_APP_BASE_URL=http://localhost:3001
REACT_APP_RAZORPAY_KEY_ID=
REACT_APP_TRAINING_API_URL=http://localhost:8002
```

Backend reads:

```bash
PORT=3001
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
STORAGE_DRIVER=local
BACKEND_PUBLIC_URL=http://localhost:3001
IMAGE_GENERATION_API_URL=http://localhost:8000
VIDEO_WORKER_API_URL=http://localhost:8001
VIDEO_API_KEY=
REPLICATE_API_TOKEN=
REPLICATE_VIDEO_MODEL=wan-video/wan-2.5-i2v-fast
REPLICATE_VIDEO_IMAGE_FIELD=image
REPLICATE_VIDEO_PROMPT_FIELD=prompt
REPLICATE_VIDEO_DURATION=5
REPLICATE_VIDEO_ASPECT_RATIO=16:9
```

The Python worker URLs are optional for login, registration, actors, payments, and project CRUD, but are required for image/video generation flows.
# CLONE-OS
