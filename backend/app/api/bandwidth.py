import time
import random
from fastapi import APIRouter, Query

router = APIRouter(prefix="/bandwidth", tags=["bandwidth"])

# Initial state for network links (Indian Regions & Rupee rates)
links_db = [
    { "id": "lnk-in-west-1", "name": "Mumbai DC 1", "region": "IN-West", "type": "DirectConnect", "speed": 850.0, "rate": 1.50, "totalData": 1250.0, "accruedCost": 1875.00 },
    { "id": "lnk-in-west-2", "name": "Mumbai VPN", "region": "IN-West", "type": "VPN", "speed": 120.0, "rate": 6.00, "totalData": 310.0, "accruedCost": 1860.00 },
    { "id": "lnk-in-south-1", "name": "Bengaluru DC 2", "region": "IN-South", "type": "DirectConnect", "speed": 640.0, "rate": 2.20, "totalData": 940.0, "accruedCost": 2068.00 },
    { "id": "lnk-in-north-1", "name": "Delhi VPN", "region": "IN-North", "type": "VPN", "speed": 110.0, "rate": 7.50, "totalData": 410.0, "accruedCost": 3075.00 },
    { "id": "lnk-in-north-2", "name": "Delhi Satellite", "region": "IN-North", "type": "Satellite", "speed": 45.0, "rate": 18.00, "totalData": 85.0, "accruedCost": 1530.00 },
    { "id": "lnk-in-east-1", "name": "Kolkata Broadband", "region": "IN-East", "type": "Broadband", "speed": 300.0, "rate": 4.00, "totalData": 600.0, "accruedCost": 2400.00 }
]


last_update_time = time.time()

@router.get("/links", summary="Get real-time bandwidth and cost metrics for network links")
def get_bandwidth_links(
    region: str = Query(None, description="Filter links by region"),
    link_type: str = Query(None, alias="type", description="Filter links by link type")
):
    global last_update_time
    current_time = time.time()
    elapsed = current_time - last_update_time
    last_update_time = current_time
    
    # Guarantee a sane default if elapsed is abnormal or first request
    if elapsed <= 0 or elapsed > 60:
        elapsed = 3.0
        
    from app.services.failed_event_service import get_network_status
    network_active = get_network_status()
    
    # Fluctuate speeds and accrue data/cost in backend only if connection is active
    for lnk in links_db:
        if network_active:
            # Fluctuate speed slightly (-10 to +10 Mbps)
            speed_delta = random.uniform(-10, 10)
            lnk["speed"] = max(round(lnk["speed"] + speed_delta, 1), 10.0)
            
            # Accrue data volume: Speed (Mbps) * elapsed time (seconds) / 8 bits / 1024 to convert to GB
            data_delta = (lnk["speed"] * elapsed) / 8192.0
            lnk["totalData"] = round(lnk["totalData"] + data_delta, 3)
            lnk["accruedCost"] = round(lnk["accruedCost"] + (data_delta * lnk["rate"]), 3)
        else:
            # Drop speed to 0.0 Mbps when simulated offline; freeze accrued cost and data.
            lnk["speed"] = 0.0
        
        
    # Apply filters
    filtered_links = links_db
    if isinstance(region, str) and region != "All":
        filtered_links = [l for l in filtered_links if l["region"] == region]
    if isinstance(link_type, str) and link_type != "All":
        filtered_links = [l for l in filtered_links if l["type"] == link_type]
        
    return {
        "links": filtered_links,
        "timestamp": current_time,
        "elapsed_seconds": elapsed
    }
