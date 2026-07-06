from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class DNSRecord(BaseModel):
    name: str = Field(..., description="Hostname, e.g. api.pharmasync.com")
    type: str = Field("A", description="DNS record type, e.g. A, CNAME")
    value: str = Field(..., description="Target IP or destination host")
    ttl: int = Field(10, description="Time To Live in seconds")

class DNSZone(BaseModel):
    zone_name: str = Field(..., description="Domain name, e.g. pharmasync.com")
    records: List[DNSRecord] = Field(default_factory=list)

class DNSRecordUpdate(BaseModel):
    zone_name: str
    name: str
    type: str = "A"
    new_value: str
    ttl: Optional[int] = None

class DNSLogEntry(BaseModel):
    timestamp: datetime
    zone_name: str
    record_name: str
    record_type: str
    old_value: str
    new_value: str
    action: str = "UPDATE"  # e.g., UPDATE, CREATE, FAILOVER, REVERT
    details: Optional[str] = None
