from fastapi import APIRouter, HTTPException, Query
from app.schemas.failed_event import ProcessEventRequest
from app.services.failed_event_service import (
    log_failed_event,
    replay_failed_events,
    set_network_status,
    get_network_status,
    process_order_event
)
from app.database.dynamodb import get_events_by_status, get_failed_event

router = APIRouter(
    prefix="/events",
    tags=["Failed Events"]
)

@router.get("/network", summary="Get network connection status")
def network_status():
    """
    Returns whether the simulated network is online or offline.
    """
    return {"network_online": get_network_status()}

@router.post("/network/toggle", summary="Toggle network status (online/offline)")
def toggle_network(online: bool):
    """
    Toggles the simulated network status. Used for simulating offline outages.
    """
    set_network_status(online)
    return {"message": f"Network simulated status updated to {'ONLINE' if online else 'OFFLINE'}", "network_online": online}

@router.post("/process", summary="Process a new order event")
def process_event(request: ProcessEventRequest):
    """
    Attempts to process an event. If processing fails (e.g. network outage),
    the event is durable stored/logged in DynamoDB and marked as FAILED.
    """
    try:
        # Attempt to process
        process_order_event(
            event_id=request.event_id,
            event_type=request.event_type,
            payload=request.event_payload
        )
        return {
            "status": "SUCCESS",
            "message": f"Event {request.event_id} processed successfully."
        }
    except Exception as error:
        # Log to DynamoDB on failure
        logged_event = log_failed_event(
            event_id=request.event_id,
            event_type=request.event_type,
            failure_reason=str(error),
            event_payload=request.event_payload
        )
        return {
            "status": "FAILED",
            "message": f"Processing failed: {str(error)}. Event logged for retry.",
            "logged_event": logged_event
        }

@router.post("/replay", summary="Trigger retry/replay of failed events")
def trigger_replay():
    """
    Triggers the replay mechanism to reprocess all currently failed events.
    """
    results = replay_failed_events()
    return {
        "message": "Replay mechanism completed.",
        "results": results
    }

@router.get("", summary="Get tracked events by status")
def list_events(status: str = Query("FAILED", description="Status of events to fetch (FAILED, COMPLETED, PROCESSING)")):
    """
    Lists tracked events in DynamoDB filtered by their status.
    """
    events = get_events_by_status(status)
    return {
        "status": status,
        "count": len(events),
        "events": events
    }

@router.get("/{event_id}", summary="Get a specific event's details")
def get_event(event_id: str):
    """
    Fetches the details of a tracked event by its ID.
    """
    event = get_failed_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event with ID {event_id} not found.")
    return event