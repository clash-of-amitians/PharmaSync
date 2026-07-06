import httpx
import logging

INVENTORY_SYNC_SERVICE_URL = "http://localhost:8001"

def trigger_regional_inventory_sync(sku: str, item_name: str, quantity: int, region: str, compliance_data: dict = None) -> dict:
    """
    HTTP client wrapper to trigger the Region-Specific Inventory Sync Microservice.
    """
    try:
        payload = {
            "sku": sku,
            "item_name": item_name,
            "base_quantity": quantity,
            "target_region": region,
            "compliance_data": compliance_data
        }
        # Call the standalone microservice endpoint
        response = httpx.post(f"{INVENTORY_SYNC_SERVICE_URL}/sync/trigger", json=payload, timeout=5.0)
        if response.status_code == 201:
            return response.json()
        else:
            logging.error(f"Inventory sync returned status {response.status_code}: {response.text}")
            return {"status": "FAILED", "detail": response.text}
    except Exception as e:
        logging.error(f"Could not connect to Inventory Sync Microservice: {str(e)}")
        return {"status": "FAILED", "detail": str(e)}
