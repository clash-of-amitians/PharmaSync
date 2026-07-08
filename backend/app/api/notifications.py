from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any

from app.services.notification_service import (
    get_notification_config,
    update_notification_config,
    get_notification_logs,
    dispatch_cicd_notification
)
from app.schemas.notification import NotificationConfigUpdate, TriggerNotificationRequest

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/config", summary="Get notification system configuration")
def get_config():
    """
    Returns the current active notification channel and configured recipients.
    """
    return get_notification_config()

@router.post("/config", summary="Update notification system configuration")
def update_config(payload: NotificationConfigUpdate):
    """
    Updates the active notification channel and optionally sets the recipients list.
    """
    try:
        updated_config = update_notification_config(
            channel=payload.active_channel,
            recipients=payload.recipients
        )
        return updated_config
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/logs", summary="Get notification dispatch history")
def get_logs():
    """
    Retrieves a list of all low-bandwidth CI/CD notifications dispatched.
    """
    return get_notification_logs()

@router.post("/trigger", status_code=status.HTTP_201_CREATED, summary="Trigger mock CI/CD notification")
def trigger_notification(payload: TriggerNotificationRequest):
    """
    Simulates a CI/CD event and dispatches a notification to test the low-bandwidth system.
    """
    try:
        log = dispatch_cicd_notification(
            pipeline_id=payload.pipeline_id,
            step=payload.step,
            status=payload.status,
            duration=payload.duration,
            bandwidth_bytes=payload.bandwidth_bytes
        )
        return log
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
