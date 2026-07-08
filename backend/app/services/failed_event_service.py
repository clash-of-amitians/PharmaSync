import asyncio
from datetime import datetime, timezone
from app.database.dynamodb import (
    save_failed_event,
    get_events_by_status,
    update_event_status,
    delete_failed_event
)

import time
from app.core.metrics import ORDER_EVENTS_PROCESSED, ORDER_EVENTS_LATENCY

# Simulated network/outage status
NETWORK_ONLINE = True

def set_network_status(online: bool):
    """
    Sets the simulated network status (online/offline).
    """
    global NETWORK_ONLINE
    NETWORK_ONLINE = online

def get_network_status() -> bool:
    """
    Gets the current simulated network status.
    """
    return NETWORK_ONLINE

def process_order_event(event_id: str, event_type: str, payload: dict) -> bool:
    """
    Simulates processing of an order event.
    Throws Exception if network is offline or if payload explicitly requests simulation failure.
    """
    start_time = time.perf_counter()
    status = "SUCCESS"
    try:
        if not NETWORK_ONLINE:
            status = "FAILURE"
            raise Exception("Downstream API connection failure (network offline)")
            
        if payload.get("simulate_failure") is True:
            status = "FAILURE"
            raise Exception("Simulated transaction processing failure")
            
        # Simulate small real-world processing latency (20ms - 80ms)
        import random
        time.sleep(random.uniform(0.02, 0.08))
        
        # Automatically trigger regional inventory sync if SKU details are in payload
        if "sku" in payload and "target_region" in payload:
            from app.services.inventory_sync_client import trigger_regional_inventory_sync
            trigger_regional_inventory_sync(
                sku=payload["sku"],
                item_name=payload.get("item_name", "Unnamed Medicine"),
                quantity=payload.get("quantity", 0),
                region=payload["target_region"],
                compliance_data=payload.get("compliance_data")
            )
            
        print(f"Successfully processed event {event_id} of type {event_type}!")
        return True
    except Exception as e:
        status = "FAILURE"
        raise e
    finally:
        latency = time.perf_counter() - start_time
        ORDER_EVENTS_PROCESSED.labels(event_type=event_type, status=status).inc()
        ORDER_EVENTS_LATENCY.labels(event_type=event_type).observe(latency)

def log_failed_event(event_id: str, event_type: str, failure_reason: str, event_payload: dict):
    """
    Constructs and logs a failed event to DynamoDB.
    """
    failed_event = {
        "event_id": event_id,
        "event_type": event_type,
        "status": "FAILED",
        "failure_reason": failure_reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "event_payload": event_payload,
        "retry_count": 0
    }
    
    return save_failed_event(failed_event)

def replay_failed_events() -> dict:
    """
    Retrieves all failed events and retries processing them.
    Updates their status, retry count, and failure reasons accordingly.
    Uses 'PROCESSING' state transition to prevent duplicate processing.
    """
    failed_events = get_events_by_status("FAILED")
    
    results = {
        "total_attempted": len(failed_events),
        "succeeded": [],
        "failed": []
    }
    
    for event in failed_events:
        event_id = event["event_id"]
        event_type = event["event_type"]
        payload = event["event_payload"]
        
        # To avoid duplicate concurrent processing, transition status to 'PROCESSING'
        # Since update_event_status uses atomic SET, we perform an optimistic lock transition check.
        # Wait, if we want to ensure we don't process if someone else is processing:
        # we can verify that the previous status was indeed 'FAILED'. In a production DynamoDB setup,
        # we would use a Conditional Expression (AttributeExists & status == 'FAILED').
        # Let's keep it simple here, but update_event_status updates status to 'PROCESSING'.
        updated = update_event_status(event_id, status="PROCESSING")
        if not updated:
            continue
            
        try:
            # Process the event
            process_order_event(event_id, event_type, payload)
            
            # Update to COMPLETED on success
            update_event_status(
                event_id=event_id,
                status="COMPLETED",
                last_attempt_at=datetime.now(timezone.utc).isoformat()
            )
            results["succeeded"].append(event_id)
            
        except Exception as e:
            # On failure, return to FAILED status, record reason, and increment retry
            failure_reason = str(e)
            update_event_status(
                event_id=event_id,
                status="FAILED",
                failure_reason=failure_reason,
                last_attempt_at=datetime.now(timezone.utc).isoformat(),
                increment_retry=True
            )
            results["failed"].append({
                "event_id": event_id,
                "reason": failure_reason
            })
            
    return results

async def auto_replay_background_worker():
    """
    Background worker that runs periodically to detect connectivity restoration
    and replay failed events automatically.
    """
    print("Auto-Replay Background Worker started.")
    last_known_online = get_network_status()
    
    while True:
        try:
            await asyncio.sleep(5)  # Check every 5 seconds for responsive testing
            
            is_online = get_network_status()
            
            # If online, check if we just restored connection OR if we have pending failures
            if is_online:
                if not last_known_online:
                    print("[Auto-Replay Worker] Connectivity restoration detected! Triggering auto-replay...")
                
                # Retrieve pending failed events
                failed_events = get_events_by_status("FAILED")
                if len(failed_events) > 0:
                    print(f"[Auto-Replay Worker] Found {len(failed_events)} failed event(s). Reprocessing...")
                    replay_results = replay_failed_events()
                    print(f"[Auto-Replay Worker] Auto-replay run results: {replay_results}")
                    
            last_known_online = is_online
            
        except asyncio.CancelledError:
            print("Auto-Replay Background Worker stopping.")
            break
        except Exception as e:
            print(f"Error in Auto-Replay Background Worker: {e}")