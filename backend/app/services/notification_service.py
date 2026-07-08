import time
import zlib
from datetime import datetime, timezone
from typing import List, Dict, Any

# Current Active Configuration
# Supported channels: 'SMS', 'EMAIL'
active_channel = "SMS"

# Stakeholders contact information
sms_recipients = ["+15550199", "+919876543210"]
email_recipients = ["oncall@pharmasync.com", "stakeholder@pharmasync.com"]

# Notification logs database in-memory
notification_logs: List[Dict[str, Any]] = []

def get_notification_config() -> Dict[str, Any]:
    """
    Returns the current notification configuration.
    """
    return {
        "active_channel": active_channel,
        "sms_recipients": sms_recipients,
        "email_recipients": email_recipients,
        "channel_options": [
            {
                "name": "SMS",
                "description": "Ultra-low bandwidth format. Limited to 160 characters. Plaintext shorthand.",
                "typical_size_bytes": 120,
                "compression_ratio": "N/A"
            },
            {
                "name": "EMAIL",
                "description": "Compressed HTML/MIME structure using zlib/deflate encoding for payload efficiency.",
                "typical_size_bytes": 250,
                "compression_ratio": "approx. 2.5x"
            }
        ]
    }

def update_notification_config(channel: str, recipients: List[str] = None) -> Dict[str, Any]:
    """
    Updates the active notification channel and recipient list.
    """
    global active_channel, sms_recipients, email_recipients
    
    chan_upper = channel.upper()
    if chan_upper not in ["SMS", "EMAIL"]:
        raise ValueError(f"Unsupported notification channel: {channel}. Supported: 'SMS', 'EMAIL'")
        
    active_channel = chan_upper
    
    if recipients is not None:
        if chan_upper == "SMS":
            sms_recipients = recipients
        else:
            email_recipients = recipients
            
    return get_notification_config()

def format_sms_payload(pipeline_id: str, step: str, status: str, duration: float, bandwidth_mb: float) -> str:
    """
    Formats the notification into a highly compressed, shorthand SMS format (<160 chars).
    """
    # Example format: PS: build-ui | compile | SUCCESS | 2.5s | 12.4MB
    return f"PS:{pipeline_id}|{step}|{status}|{duration:.1f}s|{bandwidth_mb:.1f}MB"

def format_email_payload(pipeline_id: str, step: str, status: str, duration: float, bandwidth_mb: float) -> str:
    """
    Formats the notification into a standard JSON/text format representing an email body.
    """
    return (
        f"Subject: CI/CD Alert: {pipeline_id} - {status}\n"
        f"Pipeline: {pipeline_id}\n"
        f"Execution Step: {step}\n"
        f"Status: {status}\n"
        f"Step Duration: {duration:.2f} seconds\n"
        f"Bandwidth Consumed: {bandwidth_mb:.2f} MB\n"
        f"Timestamp: {datetime.now(timezone.utc).isoformat()}"
    )

def dispatch_cicd_notification(pipeline_id: str, step: str, status: str, duration: float, bandwidth_bytes: int) -> Dict[str, Any]:
    """
    Dispatches a low-bandwidth notification using the active channel configuration.
    Calculates payload compression benefits and logs the transaction.
    """
    bandwidth_mb = bandwidth_bytes / (1024 * 1024)
    
    if active_channel == "SMS":
        body = format_sms_payload(pipeline_id, step, status, duration, bandwidth_mb)
        uncompressed_size = len(body.encode('utf-8'))
        # SMS is plaintext and already minimal, we don't compress SMS transmission but show it's naturally low-bandwidth
        compressed_size = uncompressed_size
        recipients = sms_recipients
    else:
        body = format_email_payload(pipeline_id, step, status, duration, bandwidth_mb)
        uncompressed_bytes = body.encode('utf-8')
        uncompressed_size = len(uncompressed_bytes)
        # Apply zlib compression to email body
        compressed_bytes = zlib.compress(uncompressed_bytes)
        compressed_size = len(compressed_bytes)
        recipients = email_recipients
        
    log_entry = {
        "notification_id": f"notif-{int(time.time() * 1000)}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pipeline_id": pipeline_id,
        "step": step,
        "status": status,
        "channel": active_channel,
        "recipients": recipients.copy(),
        "body_preview": body[:60] + "..." if len(body) > 60 else body,
        "uncompressed_size_bytes": uncompressed_size,
        "compressed_size_bytes": compressed_size,
        "saving_percentage": round((1.0 - (compressed_size / uncompressed_size)) * 100, 1) if uncompressed_size > 0 else 0,
        "dispatch_status": "SENT"
    }
    
    notification_logs.append(log_entry)
    print(f"[Stakeholder Notification] Dispatched via {active_channel}: {log_entry['body_preview']}")
    return log_entry

def get_notification_logs() -> List[Dict[str, Any]]:
    """
    Retrieves all dispatched notification logs.
    """
    return notification_logs
