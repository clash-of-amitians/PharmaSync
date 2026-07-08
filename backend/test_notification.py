import unittest
from app.services.notification_service import (
    get_notification_config,
    update_notification_config,
    dispatch_cicd_notification,
    get_notification_logs,
    format_sms_payload,
    format_email_payload
)

class TestNotificationService(unittest.TestCase):
    
    def setUp(self):
        # Reset configuration before each test
        update_notification_config("SMS")
        get_notification_logs().clear()
        
    def test_default_config(self):
        config = get_notification_config()
        self.assertEqual(config["active_channel"], "SMS")
        self.assertIn("+15550199", config["sms_recipients"])
        
    def test_update_config_valid(self):
        config = update_notification_config("EMAIL", ["test@test.com"])
        self.assertEqual(config["active_channel"], "EMAIL")
        self.assertIn("test@test.com", config["email_recipients"])
        
    def test_update_config_invalid(self):
        with self.assertRaises(ValueError):
            update_notification_config("TELEGRAM")
            
    def test_sms_payload_length(self):
        sms = format_sms_payload("build-ui", "compile", "SUCCESS", 12.5, 15 * 1024 * 1024)
        # Verify it's compact (well under 160 characters)
        self.assertTrue(len(sms) < 60)
        self.assertIn("build-ui", sms)
        self.assertIn("compile", sms)
        
    def test_dispatch_sms(self):
        log = dispatch_cicd_notification(
            pipeline_id="deploy-staging",
            step="run_tests",
            status="SUCCESS",
            duration=4.8,
            bandwidth_bytes=5242880 # 5 MB
        )
        self.assertEqual(log["channel"], "SMS")
        self.assertEqual(log["dispatch_status"], "SENT")
        self.assertEqual(log["uncompressed_size_bytes"], log["compressed_size_bytes"])
        
        # Verify it was added to history
        history = get_notification_logs()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["notification_id"], log["notification_id"])
        
    def test_dispatch_email_compression(self):
        # Switch to EMAIL
        update_notification_config("EMAIL")
        
        log = dispatch_cicd_notification(
            pipeline_id="security-audit",
            step="upload_artifacts",
            status="FAILED",
            duration=12.2,
            bandwidth_bytes=10485760 # 10 MB
        )
        self.assertEqual(log["channel"], "EMAIL")
        # For a verbose email text, zlib compression should reduce the size
        self.assertTrue(log["compressed_size_bytes"] < log["uncompressed_size_bytes"])
        self.assertTrue(log["saving_percentage"] > 0)
        
if __name__ == "__main__":
    unittest.main()
