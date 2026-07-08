from pydantic import BaseModel, Field
from typing import List, Optional

class NotificationConfigUpdate(BaseModel):
    active_channel: str = Field(..., description="Active notification channel. Must be 'SMS' or 'EMAIL'")
    recipients: Optional[List[str]] = Field(None, description="Optional list of recipients (phone numbers for SMS, emails for EMAIL)")

class TriggerNotificationRequest(BaseModel):
    pipeline_id: str = Field(..., example="build-ui")
    step: str = Field(..., example="compile")
    status: str = Field(..., example="SUCCESS")
    duration: float = Field(..., example=15.4)
    bandwidth_bytes: int = Field(..., example=25165824) # 24 MB
