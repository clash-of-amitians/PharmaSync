import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.services.notification_service import get_notification_logs, update_notification_config

class TestNotificationsApi(unittest.TestCase):
    
    def setUp(self):
        self.client = TestClient(app)
        update_notification_config("SMS") # Reset config state for test isolation
        get_notification_logs().clear()
        
    def test_get_config(self):
        response = self.client.get("/notifications/config")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["active_channel"], "SMS")
        self.assertIn("sms_recipients", data)
        self.assertIn("email_recipients", data)
        
    def test_update_config_sms(self):
        response = self.client.post("/notifications/config", json={
            "active_channel": "SMS",
            "recipients": ["+123456", "+7890"]
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["active_channel"], "SMS")
        self.assertEqual(data["sms_recipients"], ["+123456", "+7890"])
        
    def test_update_config_email(self):
        response = self.client.post("/notifications/config", json={
            "active_channel": "EMAIL",
            "recipients": ["test1@email.com", "test2@email.com"]
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["active_channel"], "EMAIL")
        self.assertEqual(data["email_recipients"], ["test1@email.com", "test2@email.com"])
        
    def test_update_config_invalid(self):
        # Test invalid value raises HTTP 400 Bad Request
        response = self.client.post("/notifications/config", json={
            "active_channel": "PUSH"
        })
        self.assertEqual(response.status_code, 400)
        
        response = self.client.post("/notifications/config", json={
            "active_channel": "SLACK"
        })
        self.assertEqual(response.status_code, 400)
        
    def test_get_logs_empty(self):
        response = self.client.get("/notifications/logs")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
        
    def test_trigger_notification_success(self):
        response = self.client.post("/notifications/trigger", json={
            "pipeline_id": "test-pipeline",
            "step": "compile",
            "status": "SUCCESS",
            "duration": 5.5,
            "bandwidth_bytes": 1024 * 1024 # 1 MB
        })
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["pipeline_id"], "test-pipeline")
        self.assertEqual(data["step"], "compile")
        self.assertEqual(data["status"], "SUCCESS")
        self.assertEqual(data["channel"], "SMS")
        
        # Verify it shows up in logs
        response_logs = self.client.get("/notifications/logs")
        self.assertEqual(response_logs.status_code, 200)
        self.assertEqual(len(response_logs.json()), 1)
        self.assertEqual(response_logs.json()[0]["notification_id"], data["notification_id"])
        
if __name__ == "__main__":
    unittest.main()
