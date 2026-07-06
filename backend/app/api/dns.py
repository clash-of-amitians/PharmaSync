from fastapi import APIRouter, HTTPException, Query
from app.schemas.dns import DNSRecordUpdate
from app.services.dns_service import (
    update_dns_record,
    get_dns_history,
    get_dns_zone,
    query_dns_record
)
from app.core.config import settings

from app.services.dns_monitor_service import get_monitor_status

router = APIRouter(
    prefix="/dns",
    tags=["DNS Failover Management"]
)

@router.get("/monitor", summary="Get current status of the DNS health monitor")
def monitor_status():
    """
    Returns the current health status of the DNS Outage Monitor.
    """
    return get_monitor_status()

@router.get("/zones", summary="Get DNS Zone records")
def get_zones(zone_name: str = Query(None)):
    """
    Returns the DNS records registered under the specified zone name.
    """
    target_zone = zone_name if zone_name is not None else settings.DNS_ZONE_NAME
    zone = get_dns_zone(target_zone)
    if not zone:
        raise HTTPException(status_code=404, detail=f"DNS Zone '{target_zone}' not found.")
    return zone

@router.post("/records", summary="Update or Create a DNS record manually")
def update_record(request: DNSRecordUpdate):
    """
    Manually creates or updates a DNS record. Triggers an audit log entry.
    """
    result = update_dns_record(
        zone_name=request.zone_name,
        record_name=request.name,
        new_value=request.new_value,
        record_type=request.type,
        ttl=request.ttl
    )
    return result

@router.get("/logs", summary="Get DNS change log / audit trail")
def get_logs(limit: int = Query(50, description="Max number of logs to fetch")):
    """
    Returns the history of DNS modifications and failovers.
    """
    logs = get_dns_history()
    return {
        "count": len(logs),
        "logs": logs[:limit]
    }

@router.get("/resolve", summary="Simulate client-side DNS resolution")
def resolve_dns(name: str = Query(None), zone_name: str = Query(None)):
    """
    Resolves the provided domain to its active destination record value.
    """
    target_name = name if name is not None else settings.DNS_RECORD_NAME
    target_zone = zone_name if zone_name is not None else settings.DNS_ZONE_NAME
    
    record = query_dns_record(target_zone, target_name)
    if not record:
        raise HTTPException(status_code=404, detail=f"Hostname '{target_name}' under '{target_zone}' does not resolve.")
    return {
        "hostname": target_name,
        "resolved_value": record["value"],
        "record": record
    }
