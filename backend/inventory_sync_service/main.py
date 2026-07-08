import time
import uuid
from datetime import datetime
from fastapi import FastAPI, HTTPException, status
from typing import List, Dict, Any

from schemas import SyncRequest, SyncResponse, CalculatedUnits, ComplianceFields

app = FastAPI(
    title="PharmaSync Inventory Synchronization Microservice",
    description="Containerized microservice for transforming and syncing SKU inventory across regions.",
    version="1.0.0"
)

# In-memory history log of all sync operations
sync_history: List[Dict[str, Any]] = []

# Regional configuration loader mapping units, compliance forms, and currencies
REGIONAL_CONFIGS = {
    "IN": {
        "unit_type": "Strips",
        "divisor": 10.0,
        "currency": "INR",
        "base_rate": 12.50,
        "required_compliance": ["cdsco_license", "gstin"]
    },
    "US": {
        "unit_type": "Bottles",
        "divisor": 30.0,
        "currency": "USD",
        "base_rate": 0.15,
        "required_compliance": ["fda_ndc", "dscsa_uid"]
    },
    "EU": {
        "unit_type": "Packs",
        "divisor": 28.0,
        "currency": "EUR",
        "base_rate": 0.18,
        "required_compliance": ["ema_fmd_serial", "gdpr_residency"]
    }
}

@app.get("/sync/config/{region}", summary="Load configuration schemas for a specific region")
def get_config(region: str):
    region_upper = region.upper()
    if region_upper not in REGIONAL_CONFIGS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Region configuration '{region}' is unsupported."
        )
    return REGIONAL_CONFIGS[region_upper]

@app.post("/sync/trigger", response_model=SyncResponse, status_code=status.HTTP_201_CREATED, summary="Trigger inventory sync for a specific warehouse SKU")
def trigger_sync(request: SyncRequest):
    region = request.target_region.upper()
    
    # Load regional configuration rules dynamically
    if region not in REGIONAL_CONFIGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot sync. Target region '{request.target_region}' is unsupported."
        )
        
    config = REGIONAL_CONFIGS[region]
    
    # Validate compliance fields based on regional requirements
    compliance_fields = request.compliance_data or {}
    missing_fields = [f for f in config["required_compliance"] if f not in compliance_fields]
    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Compliance validation failed. Missing required fields for region {region}: {missing_fields}"
        )
        
    # Calculate quantities and rates
    local_qty = round(request.base_quantity / config["divisor"], 2)
    rate = config["base_rate"]
    
    # Build synchronization payload
    sync_id = f"sync-{uuid.uuid4().hex[:12]}"
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    response_payload = {
        "sync_id": sync_id,
        "sku": request.sku,
        "item_name": request.item_name,
        "base_quantity": request.base_quantity,
        "target_region": region,
        "calculated_units": {
            "local_quantity": local_qty,
            "unit_type": config["unit_type"],
            "currency": config["currency"],
            "rate": rate
        },
        "regulatory_compliance": {
            "region_code": region,
            "fields": {k: compliance_fields[k] for k in config["required_compliance"]}
        },
        "status": "COMPLETED",
        "timestamp": timestamp
    }
    
    # Store in sync database history
    sync_history.append(response_payload)
    
    return response_payload

@app.get("/sync/history", response_model=List[SyncResponse], summary="Retrieve transaction logs of all sync events")
def get_sync_history():
    return sync_history
