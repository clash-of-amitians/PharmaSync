import asyncio
from datetime import datetime, timezone
from app.core.config import settings
from app.services.failed_event_service import get_network_status
from app.services.dns_service import query_dns_record, update_dns_record
from app.database.dynamodb import save_dns_log

# Global state for monitor status
MONITOR_STATUS = {
    "is_running": True,
    "last_check_timestamp": None,
    "primary_link_status": "UP",  # UP or DOWN
    "failover_triggered": False
}

def get_monitor_status() -> dict:
    """
    Returns the current DNS Outage Monitor state.
    """
    return MONITOR_STATUS

def trigger_alert(subject: str, message: str):
    """
    Simulates sending an alert to monitoring and paging tools (Slack, PagerDuty).
    """
    alert_time = datetime.now(timezone.utc).isoformat()
    
    # Print bold terminal alert warning
    print(f"\n[ALERT SYSTEM] [{alert_time}]")
    print(f"   SUBJECT: {subject}")
    print(f"   MESSAGE: {message}\n")
    
    # Save the alert in DNS logs for auditing and complete visibility
    save_dns_log({
        "timestamp": alert_time,
        "zone_name": settings.DNS_ZONE_NAME,
        "record_name": settings.DNS_RECORD_NAME,
        "record_type": "ALERT",
        "old_value": "HEALTH_MONITOR",
        "new_value": "ALERT_TRIGGERED",
        "action": "ALERT",
        "details": f"Alert: {subject} - {message}"
    })

async def dns_outage_monitor_worker():
    """
    Background worker task that monitors the health of the primary link
    and triggers automatic DNS failover and failback.
    Runs every 5 seconds to guarantee failover happens within 60 seconds (AC1).
    """
    print("DNS Outage Monitor Worker started.")
    MONITOR_STATUS["is_running"] = True
    
    while True:
        try:
            await asyncio.sleep(5)  # Check health every 5 seconds
            
            MONITOR_STATUS["last_check_timestamp"] = datetime.now(timezone.utc).isoformat()
            
            # Check simulated primary link connectivity
            primary_online = get_network_status()
            current_dns = query_dns_record(settings.DNS_ZONE_NAME, settings.DNS_RECORD_NAME)
            current_ip = current_dns["value"] if current_dns else None
            
            # Case 1: Outage Detected (Primary Link Down)
            if not primary_online:
                if MONITOR_STATUS["primary_link_status"] == "UP":
                    MONITOR_STATUS["primary_link_status"] = "DOWN"
                    trigger_alert(
                        subject=f"PRIMARY LINK DOWN: {settings.DNS_RECORD_NAME}",
                        message=f"The primary link IP {settings.PRIMARY_LINK_IP} is unresponsive. Triggering automated failover..."
                    )
                
                # Perform Failover: Point DNS record to Backup Link IP
                if current_ip == settings.PRIMARY_LINK_IP:
                    print(f"[DNS Monitor] Initiating automatic failover for {settings.DNS_RECORD_NAME} -> {settings.BACKUP_LINK_IP}...")
                    update_result = update_dns_record(
                        zone_name=settings.DNS_ZONE_NAME,
                        record_name=settings.DNS_RECORD_NAME,
                        new_value=settings.BACKUP_LINK_IP,
                        ttl=10
                    )
                    
                    # Update action flag on the log record for failover representation
                    log_entry = update_result["log"]
                    log_entry["action"] = "FAILOVER"
                    log_entry["details"] = f"Automated failover routed traffic to Backup IP {settings.BACKUP_LINK_IP}."
                    save_dns_log(log_entry)
                    
                    MONITOR_STATUS["failover_triggered"] = True
                    trigger_alert(
                        subject=f"FAILOVER COMPLETED: {settings.DNS_RECORD_NAME}",
                        message=f"DNS record updated to Backup Link IP {settings.BACKUP_LINK_IP}. Traffic redirected."
                    )
            
            # Case 2: Link Restored (Primary Link Up)
            else:
                if MONITOR_STATUS["primary_link_status"] == "DOWN":
                    MONITOR_STATUS["primary_link_status"] = "UP"
                    trigger_alert(
                        subject=f"PRIMARY LINK RESTORED: {settings.DNS_RECORD_NAME}",
                        message=f"The primary link IP {settings.PRIMARY_LINK_IP} has recovered. Initiating automated failback..."
                    )
                
                # Perform Failback: Revert DNS record to Primary Link IP
                if current_ip == settings.BACKUP_LINK_IP:
                    print(f"[DNS Monitor] Initiating automatic failback for {settings.DNS_RECORD_NAME} -> {settings.PRIMARY_LINK_IP}...")
                    update_result = update_dns_record(
                        zone_name=settings.DNS_ZONE_NAME,
                        record_name=settings.DNS_RECORD_NAME,
                        new_value=settings.PRIMARY_LINK_IP,
                        ttl=10
                    )
                    
                    # Update action flag on the log record for failback representation
                    log_entry = update_result["log"]
                    log_entry["action"] = "FAILBACK"
                    log_entry["details"] = f"Automated failback reverted traffic to Primary IP {settings.PRIMARY_LINK_IP}."
                    save_dns_log(log_entry)
                    
                    MONITOR_STATUS["failover_triggered"] = False
                    trigger_alert(
                        subject=f"FAILBACK COMPLETED: {settings.DNS_RECORD_NAME}",
                        message=f"DNS record successfully reverted to Primary Link IP {settings.PRIMARY_LINK_IP}."
                    )
                    
        except asyncio.CancelledError:
            print("DNS Outage Monitor Worker stopping.")
            MONITOR_STATUS["is_running"] = False
            break
        except Exception as e:
            print(f"Error in DNS Outage Monitor: {e}")
