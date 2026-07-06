import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.database.dynamodb import init_db
from app.api.failed_events import router as failed_event_router
from app.api.dns import router as dns_router
from app.services.failed_event_service import auto_replay_background_worker
from app.services.dns_service import init_dns_config
from app.services.dns_monitor_service import dns_outage_monitor_worker
from app.services.pipeline_simulator import simulate_pipeline_metrics_worker

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DynamoDB table on startup
    try:
        init_db()
    except Exception as e:
        print(f"Warning: Could not initialize DynamoDB table: {e}")
        
    # Initialize default DNS records
    try:
        init_dns_config()
    except Exception as e:
        print(f"Warning: Could not initialize DNS configuration: {e}")
        
    # Start auto-replay background task
    worker_task = asyncio.create_task(auto_replay_background_worker())
    
    # Start DNS Monitor background task
    dns_monitor_task = asyncio.create_task(dns_outage_monitor_worker())
    
    # Start CI/CD metrics simulator background task
    pipeline_sim_task = asyncio.create_task(simulate_pipeline_metrics_worker())
    
    yield
    
    # Cancel tasks on shutdown
    worker_task.cancel()
    dns_monitor_task.cancel()
    pipeline_sim_task.cancel()
    
    try:
        await asyncio.gather(worker_task, dns_monitor_task, pipeline_sim_task, return_exceptions=True)
    except Exception as e:
        print(f"Error shutting down background tasks: {e}")

app = FastAPI(
    title="PharmaSync API",
    version="1.0.0",
    description="Backend API for PharmaSync",
    lifespan=lifespan
)

from app.api.bandwidth import router as bandwidth_router

# Register API routes
app.include_router(failed_event_router)
app.include_router(dns_router)
app.include_router(bandwidth_router)


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


@app.get("/metrics", summary="Prometheus Metrics Endpoint")
def metrics():
    """
    Exposes raw Prometheus metrics to be scraped.
    """
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)