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
REACT_APP_TRAINING_API_URL=
```

Backend reads:

```bash
PORT=3001
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
STORAGE_DRIVER=local
BACKEND_PUBLIC_URL=http://localhost:3001
IMAGE_GENERATION_API_URL=http://localhost:8000
VIDEO_WORKER_API_URL=https://curl-alan.onrender.com/api/generate
VIDEO_API_KEY=
VIDEO_AUTH_SCHEME=
VIDEO_IMAGE_FIELD=image
VIDEO_PROMPT_FIELD=prompt
VIDEO_DURATION_FIELD=duration
VIDEO_DURATION=5
VIDEO_OUTPUT_FIELD=output.video_url
VIDEO_TASK_ID_FIELD=output.task_id
VIDEO_TASK_STATUS_FIELD=output.task_status
VIDEO_MODEL=happyhorse-1.0-i2v
VIDEO_RESOLUTION=1080P
VIDEO_RATIO=16:9
TRAINING_API_URL=http://localhost:8002
RUNPOD_API_KEY=
RUNPOD_AUTH_SCHEME=
RUNPOD_ENDPOINT_ID=
RUNPOD_BASE_URL=https://api.runpod.ai/v2
RUNPOD_IMAGE_ENDPOINT_ID=
RUNPOD_IMAGE_INPUT_TEMPLATE_PATH=runpod/final_input.json
RUNPOD_IMAGE_SKETCH_FIELD=sketch_image
RUNPOD_IMAGE_PROMPT_FIELD=prompt
RUNPOD_IMAGE_TRIGGER_FIELD=trigger_word
RUNPOD_IMAGE_LORA_NAME_FIELD=lora_name
RUNPOD_IMAGE_LORA_URL_FIELD=lora_url
RUNPOD_IMAGE_WIDTH=1280
RUNPOD_IMAGE_HEIGHT=720
RUNPOD_IMAGE_OUTPUT_FIELD=images.0.data
RUNPOD_IMAGE_BASE64_PREFIX=false
RUNPOD_POLL_INTERVAL_MS=5000
RUNPOD_MAX_POLL_ATTEMPTS=120
RUNPOD_EXECUTION_TIMEOUT_MS=900000
RUNPOD_TTL_MS=1800000
```

The Python worker URLs are optional for login, registration, actors, payments, and project CRUD. Image generation still uses the configured image path, while final video generation now routes through the RunPod Serverless endpoint configured above.
# CLONE-OS
