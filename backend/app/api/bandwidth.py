import time
import random
from fastapi import APIRouter, Query

router = APIRouter(prefix="/bandwidth", tags=["bandwidth"])

# Initial state for network links
links_db = [
    { "id": "lnk-us-east-1", "name": "US East DC 1", "region": "us-east", "type": "DirectConnect", "speed": 850.0, "rate": 0.02, "totalData": 1250.0, "accruedCost": 25.00 },
    { "id": "lnk-us-east-2", "name": "US East VPN", "region": "us-east", "type": "VPN", "speed": 120.0, "rate": 0.08, "totalData": 310.0, "accruedCost": 24.80 },
    { "id": "lnk-us-west-1", "name": "US West DC 2", "region": "us-west", "type": "DirectConnect", "speed": 640.0, "rate": 0.03, "totalData": 940.0, "accruedCost": 28.20 },
    { "id": "lnk-eu-west-1", "name": "EU West VPN", "region": "eu-west", "type": "VPN", "speed": 110.0, "rate": 0.09, "totalData": 410.0, "accruedCost": 36.90 },
    { "id": "lnk-eu-west-2", "name": "EU West Satellite", "region": "eu-west", "type": "Satellite", "speed": 45.0, "rate": 0.25, "totalData": 85.0, "accruedCost": 21.25 },
    { "id": "lnk-ap-south-1", "name": "AP South Broadband", "region": "ap-south", "type": "Broadband", "speed": 300.0, "rate": 0.05, "totalData": 600.0, "accruedCost": 30.00 }
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
        
    # Fluctuate speeds and accrue data/cost in backend
    for lnk in links_db:
        # Fluctuate speed slightly (-10 to +10 Mbps)
        speed_delta = random.uniform(-10, 10)
        lnk["speed"] = max(round(lnk["speed"] + speed_delta, 1), 10.0)
        
        # Accrue data volume: Speed (Mbps) * elapsed time (seconds) / 8 bits / 1024 to convert to GB
        data_delta = (lnk["speed"] * elapsed) / 8192.0
        lnk["totalData"] = round(lnk["totalData"] + data_delta, 3)
        lnk["accruedCost"] = round(lnk["accruedCost"] + (data_delta * lnk["rate"]), 3)
        
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
