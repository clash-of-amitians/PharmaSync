from pydantic import BaseModel
from typing import Dict, Any, Optional

class SyncRequest(BaseModel):
    sku: str
    item_name: str
    base_quantity: int
    target_region: str  # 'IN', 'US', 'EU'
    compliance_data: Optional[Dict[str, Any]] = None

class CalculatedUnits(BaseModel):
    local_quantity: float
    unit_type: str
    currency: str
    rate: float

class ComplianceFields(BaseModel):
    region_code: str
    fields: Dict[str, Any]

class SyncResponse(BaseModel):
    sync_id: str
    sku: str
    item_name: str
    base_quantity: int
    target_region: str
    calculated_units: CalculatedUnits
    regulatory_compliance: ComplianceFields
    status: str
    timestamp: str
