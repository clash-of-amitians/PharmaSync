import asyncio
import random
from app.core.metrics import PIPELINE_BANDWIDTH, ACTIVE_BUILDS, PIPELINE_DURATION
from app.services.notification_service import dispatch_cicd_notification

async def simulate_pipeline_metrics_worker():
    """
    Simulates CI/CD pipeline activities, changing bandwidth consumption,
    active builds, and build durations in real-time.
    Triggers low-bandwidth notifications on key pipeline events (Started, Succeeded, Failed).
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
            
            # 1. Trigger STARTED Notification
            dispatch_cicd_notification(
                pipeline_id=pipe,
                step="initialization",
                status="STARTED",
                duration=0.0,
                bandwidth_bytes=0
            )
            
            # Increment active builds
            ACTIVE_BUILDS.labels(pipeline_id=pipe).inc()
            
            steps = ["fetch_deps", "compile", "run_tests", "upload_artifacts"]
            pipeline_failed = False
            failed_step = ""
            total_bandwidth_bytes = 0
            total_duration = 0.0
            
            for step in steps:
                duration = random.uniform(0.5, 3.0)
                total_duration += duration
                PIPELINE_DURATION.labels(pipeline_id=pipe, step=step).observe(duration)
                
                # Simulate 10% chance of random step failure
                if random.random() < 0.10:
                    pipeline_failed = True
                    failed_step = step
                    break
                
                step_bandwidth = 0
                if step == "fetch_deps":
                    step_bandwidth = random.randint(5 * 1024 * 1024, 80 * 1024 * 1024)
                    PIPELINE_BANDWIDTH.labels(direction="download", pipeline_id=pipe, step=step).inc(step_bandwidth)
                elif step == "upload_artifacts":
                    step_bandwidth = random.randint(2 * 1024 * 1024, 30 * 1024 * 1024)
                    PIPELINE_BANDWIDTH.labels(direction="upload", pipeline_id=pipe, step=step).inc(step_bandwidth)
                else:
                    step_bandwidth = random.randint(10 * 1024, 200 * 1024)
                    PIPELINE_BANDWIDTH.labels(direction="download", pipeline_id=pipe, step=step).inc(step_bandwidth)
                
                total_bandwidth_bytes += step_bandwidth
                await asyncio.sleep(random.uniform(0.2, 0.5))
                
            ACTIVE_BUILDS.labels(pipeline_id=pipe).set(0)
            
            # 2. Trigger FAILED or SUCCESS Notification
            if pipeline_failed:
                dispatch_cicd_notification(
                    pipeline_id=pipe,
                    step=failed_step,
                    status="FAILED",
                    duration=total_duration,
                    bandwidth_bytes=total_bandwidth_bytes
                )
            else:
                dispatch_cicd_notification(
                    pipeline_id=pipe,
                    step="deployment",
                    status="SUCCESS",
                    duration=total_duration,
                    bandwidth_bytes=total_bandwidth_bytes
                )
            
        except asyncio.CancelledError:
            print("CI/CD Pipeline Simulator Worker stopping.")
            break
        except Exception as e:
            print(f"Error in Pipeline Simulator Worker: {e}")
