import unittest
import sys
import os
from unittest.mock import patch
from fastapi.testclient import TestClient

# Add inventory_sync_service directory to sys.path so we can import main
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventory_sync_service"))

from app.services.failed_event_service import process_order_event
from inventory_sync_service.main import app as sync_app

class TestInventorySyncIntegration(unittest.TestCase):
    
    @patch("app.services.inventory_sync_client.httpx.post")
    def test_order_event_triggers_inventory_sync_integration(self, mock_post):
        # Instantiate test client for the microservice
        sync_client = TestClient(sync_app)
        
        # Redirect network calls directly to our microservice local instance
        def mock_route_to_microservice(url, json, timeout=None):
            if "/sync/trigger" in url:
                return sync_client.post("/sync/trigger", json=json)
            raise ValueError(f"Unexpected url {url}")
            
        mock_post.side_effect = mock_route_to_microservice
        
        # Prepare mock order payload targeting India (IN)
        payload = {
            "sku": "SKU-PARA-650",
            "item_name": "Paracetamol 650mg",
            "quantity": 500,
            "target_region": "IN",
            "compliance_data": {
                "cdsco_license": "DL-DEL-5511",
                "gstin": "07AAACP0120A1Z2"
            }
        }
        
        # Process order event in the main application flow
        success = process_order_event(
            event_id="EVT-SYNC-TEST-1",
            event_type="OrderDispatched",
            payload=payload
        )
        
        self.assertTrue(success)
        
        # Verify sync API was triggered with the expected request schema
        self.assertEqual(mock_post.call_count, 1)
        args, kwargs = mock_post.call_args
        self.assertIn("/sync/trigger", args[0])
        self.assertEqual(kwargs["json"]["sku"], "SKU-PARA-650")
        
        # Verify microservice correctly processed, converted, and stored the sync history
        history_res = sync_client.get("/sync/history")
        self.assertEqual(history_res.status_code, 200)
        history = history_res.json()
        
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["sku"], "SKU-PARA-650")
        self.assertEqual(history[0]["calculated_units"]["local_quantity"], 50.0)  # 500 quantity / divisor 10
        self.assertEqual(history[0]["calculated_units"]["unit_type"], "Strips")
        self.assertEqual(history[0]["calculated_units"]["currency"], "INR")
        self.assertEqual(history[0]["regulatory_compliance"]["fields"]["cdsco_license"], "DL-DEL-5511")

if __name__ == "__main__":
    unittest.main()
