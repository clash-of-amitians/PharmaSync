import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.database.dynamodb import init_db
from app.api.failed_events import router as failed_event_router
from app.services.failed_event_service import auto_replay_background_worker

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DynamoDB table on startup
    try:
        init_db()
    except Exception as e:
        print(f"Warning: Could not initialize DynamoDB table: {e}")
        
    # Start auto-replay background task
    worker_task = asyncio.create_task(auto_replay_background_worker())
    
    yield
    
    # Cancel background worker task on shutdown
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="PharmaSync API",
    version="1.0.0",
    description="Backend API for PharmaSync",
    lifespan=lifespan
)

# Register API routes
app.include_router(failed_event_router)


@app.get("/")
def root():
    return {
        "message": "Welcome to PharmaSync API 🚀"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }