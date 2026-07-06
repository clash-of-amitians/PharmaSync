import unittest
from fastapi.testclient import TestClient
from main import app

class TestInventorySyncMicroservice(unittest.TestCase):
    
    def setUp(self):
        self.client = TestClient(app)
        
    def test_get_config_success(self):
        response = self.client.get("/sync/config/IN")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["unit_type"], "Strips")
        self.assertEqual(data["currency"], "INR")
        self.assertIn("gstin", data["required_compliance"])
        
    def test_get_config_unsupported(self):
        response = self.client.get("/sync/config/XYZ")
        self.assertEqual(response.status_code, 404)
        
    def test_sync_trigger_india_success(self):
        payload = {
            "sku": "SKU-AMOX-500",
            "item_name": "Amoxicillin 500mg",
            "base_quantity": 1000,
            "target_region": "IN",
            "compliance_data": {
                "cdsco_license": "DL-MUM-9988",
                "gstin": "27AAACP0120A1Z2"
            }
        }
        response = self.client.post("/sync/trigger", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["status"], "COMPLETED")
        self.assertEqual(data["calculated_units"]["local_quantity"], 100.0) # 1000 / 10
        self.assertEqual(data["calculated_units"]["unit_type"], "Strips")
        self.assertEqual(data["regulatory_compliance"]["fields"]["gstin"], "27AAACP0120A1Z2")
        
    def test_sync_trigger_us_success(self):
        payload = {
            "sku": "SKU-AMOX-500",
            "item_name": "Amoxicillin 500mg",
            "base_quantity": 900,
            "target_region": "US",
            "compliance_data": {
                "fda_ndc": "0002-8215-01",
                "dscsa_uid": "DSCSA-1122"
            }
        }
        response = self.client.post("/sync/trigger", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["calculated_units"]["local_quantity"], 30.0) # 900 / 30
        self.assertEqual(data["calculated_units"]["unit_type"], "Bottles")
        
    def test_sync_trigger_missing_compliance(self):
        payload = {
            "sku": "SKU-AMOX-500",
            "item_name": "Amoxicillin 500mg",
            "base_quantity": 1000,
            "target_region": "IN",
            "compliance_data": {
                "cdsco_license": "DL-MUM-9988"
                # Missing gstin!
            }
        }
        response = self.client.post("/sync/trigger", json=payload)
        self.assertEqual(response.status_code, 422)
        data = response.json()
        self.assertIn("detail", data)
        self.assertIn("Missing required fields", data["detail"])

if __name__ == "__main__":
    unittest.main()
