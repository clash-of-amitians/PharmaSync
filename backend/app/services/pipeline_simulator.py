import asyncio
import random
from app.core.metrics import PIPELINE_BANDWIDTH, ACTIVE_BUILDS, PIPELINE_DURATION

async def simulate_pipeline_metrics_worker():
    """
    Simulates CI/CD pipeline activities, changing bandwidth consumption,
    active builds, and build durations in real-time.
    """
    print("CI/CD Pipeline Simulator Worker started.")
    
    pipelines = ["build-ui", "test-backend", "deploy-staging", "security-audit"]
    
    # Initialize labels to avoid missing metric warnings
    for pipe in pipelines:
        ACTIVE_BUILDS.labels(pipeline_id=pipe).set(0)
        for direction in ["download", "upload"]:
            for step in ["fetch_deps", "compile", "run_tests", "upload_artifacts"]:
                PIPELINE_BANDWIDTH.labels(direction=direction, pipeline_id=pipe, step=step).inc(0)
    
    while True:
        try:
            await asyncio.sleep(random.uniform(2, 5))
            
            pipe = random.choice(pipelines)
            
            # Increment active builds
            ACTIVE_BUILDS.labels(pipeline_id=pipe).inc()
            
            steps = ["fetch_deps", "compile", "run_tests", "upload_artifacts"]
            for step in steps:
                duration = random.uniform(0.5, 3.0)
                PIPELINE_DURATION.labels(pipeline_id=pipe, step=step).observe(duration)
                
                if step == "fetch_deps":
                    download_bytes = random.randint(5 * 1024 * 1024, 80 * 1024 * 1024)
                    PIPELINE_BANDWIDTH.labels(direction="download", pipeline_id=pipe, step=step).inc(download_bytes)
                elif step == "upload_artifacts":
                    upload_bytes = random.randint(2 * 1024 * 1024, 30 * 1024 * 1024)
                    PIPELINE_BANDWIDTH.labels(direction="upload", pipeline_id=pipe, step=step).inc(upload_bytes)
                else:
                    download_bytes = random.randint(10 * 1024, 200 * 1024)
                    PIPELINE_BANDWIDTH.labels(direction="download", pipeline_id=pipe, step=step).inc(download_bytes)
                    
                await asyncio.sleep(random.uniform(0.2, 0.5))
                
            ACTIVE_BUILDS.labels(pipeline_id=pipe).set(0)
            
        except asyncio.CancelledError:
            print("CI/CD Pipeline Simulator Worker stopping.")
            break
        except Exception as e:
            print(f"Error in Pipeline Simulator Worker: {e}")
