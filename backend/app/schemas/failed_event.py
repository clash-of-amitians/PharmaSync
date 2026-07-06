from pydantic import BaseModel, Field
from datetime import datetime
from typing import Dict, Any, Optional

class FailedEvent(BaseModel):
    event_id: str
    event_type: str
    status: str = "FAILED"
    failure_reason: str
    created_at: datetime
    event_payload: Dict[str, Any]
    retry_count: int = 0
    last_attempt_at: Optional[datetime] = None

class ProcessEventRequest(BaseModel):
    event_id: str
    event_type: str
    event_payload: Dict[str, Any]