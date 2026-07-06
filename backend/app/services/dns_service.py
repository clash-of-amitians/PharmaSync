from datetime import datetime, timezone
from app.database.dynamodb import get_dns_zone, save_dns_zone, save_dns_log, get_dns_logs
from app.core.config import settings

def init_dns_config():
    """
    Initializes the DNS Zone with primary records if it does not exist yet.
    """
    zone_name = settings.DNS_ZONE_NAME
    existing = get_dns_zone(zone_name)
    if not existing:
        zone_doc = {
            "zone_name": zone_name,
            "records": [
                {
                    "name": settings.DNS_RECORD_NAME,
                    "type": "A",
                    "value": settings.PRIMARY_LINK_IP,
                    "ttl": 10
                }
            ]
        }
        save_dns_zone(zone_doc)
        
        # Log initial creation
        save_dns_log({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "zone_name": zone_name,
            "record_name": settings.DNS_RECORD_NAME,
            "record_type": "A",
            "old_value": "NONE",
            "new_value": settings.PRIMARY_LINK_IP,
            "action": "CREATE",
            "details": "Initial zone A record configured to Primary Link IP."
        })
        print(f"DNS Zone '{zone_name}' seeded successfully.")

def query_dns_record(zone_name: str, record_name: str, record_type: str = "A") -> dict | None:
    """
    Simulates querying/resolving a specific DNS record.
    """
    zone = get_dns_zone(zone_name)
    if not zone:
        return None
        
    for rec in zone.get("records", []):
        if rec.get("name") == record_name and rec.get("type") == record_type:
            return rec
            
    return None

def update_dns_record(zone_name: str, record_name: str, new_value: str, record_type: str = "A", ttl: int = None) -> dict:
    """
    Updates a DNS record and adds an audit log entry.
    Used for manual updates and failover automation.
    """
    zone = get_dns_zone(zone_name)
    if not zone:
        zone = {
            "zone_name": zone_name,
            "records": []
        }
        
    old_value = "NONE"
    record_found = False
    
    # Search for record to update
    for rec in zone.get("records", []):
        if rec["name"] == record_name and rec["type"] == record_type:
            old_value = rec["value"]
            rec["value"] = new_value
            if ttl is not None:
                rec["ttl"] = ttl
            record_found = True
            break
            
    # Add record if not found
    if not record_found:
        if "records" not in zone:
            zone["records"] = []
        zone["records"].append({
            "name": record_name,
            "type": record_type,
            "value": new_value,
            "ttl": ttl if ttl is not None else 10
        })
        
    save_dns_zone(zone)
    
    # AWS Route 53 API integration (Automate DNS updates using provider APIs)
    hosted_zone_id = settings.ROUTE53_HOSTED_ZONE_ID
    if hosted_zone_id:
        print(f"[DNS Service] AWS Route 53 Hosted Zone ID configured: {hosted_zone_id}. Sending API update...")
        try:
            update_route53_record(
                zone_id=hosted_zone_id,
                record_name=record_name,
                new_value=new_value,
                record_type=record_type,
                ttl=ttl if ttl is not None else 10
            )
            print("[DNS Service] AWS Route 53 API update completed successfully.")
        except Exception as e:
            print(f"Warning: AWS Route 53 API update failed: {e}. Syncing with local DB fallback.")
            
    # Log the update
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "zone_name": zone_name,
        "record_name": record_name,
        "record_type": record_type,
        "old_value": old_value,
        "new_value": new_value,
        "action": "UPDATE" if record_found else "CREATE",
        "details": f"DNS record updated from {old_value} to {new_value}."
    }
    save_dns_log(log_entry)
    
    return {
        "status": "SUCCESS",
        "record": {
            "name": record_name,
            "type": record_type,
            "value": new_value,
            "ttl": ttl if ttl is not None else 10
        },
        "log": log_entry
    }

def update_route53_record(zone_id: str, record_name: str, new_value: str, record_type: str = "A", ttl: int = 10):
    """
    Simulates or executes a real resource record update in Route 53.
    """
    import boto3
    params = {
        "region_name": settings.DYNAMODB_REGION,
    }
    if settings.AWS_ACCESS_KEY_ID:
        params["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
    if settings.AWS_SECRET_ACCESS_KEY:
        params["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        
    client = boto3.client("route53", **params)
    
    response = client.change_resource_record_sets(
        HostedZoneId=zone_id,
        ChangeBatch={
            "Comment": f"Automated DNS Failover updates for {record_name}",
            "Changes": [
                {
                    "Action": "UPSERT",
                    "ResourceRecordSet": {
                        "Name": record_name,
                        "Type": record_type,
                        "TTL": ttl,
                        "ResourceRecords": [{"Value": new_value}]
                    }
                }
            ]
        }
    )
    return response

def get_dns_history() -> list[dict]:
    """
    Returns audit logs of all DNS updates.
    """
    return get_dns_logs()
