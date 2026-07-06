import unittest
from unittest.mock import patch, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.dynamodb import get_dns_zone, save_dns_zone, save_dns_log, get_dns_logs
from app.services.dns_service import (
    init_dns_config,
    query_dns_record,
    update_dns_record,
    get_dns_history
)
from app.core.config import settings

class TestDNSSimulation(unittest.TestCase):
    
    @patch('app.services.dns_service.get_dns_zone')
    @patch('app.services.dns_service.save_dns_zone')
    @patch('app.services.dns_service.save_dns_log')
    def test_init_dns_config(self, mock_save_log, mock_save_zone, mock_get_zone):
        # Case 1: Zone doesn't exist, should seed it
        mock_get_zone.return_value = None
        
        init_dns_config()
        
        mock_save_zone.assert_called_once()
        mock_save_log.assert_called_once()
        
        # Verify the structure of the seeded zone
        seeded_zone = mock_save_zone.call_args[0][0]
        self.assertEqual(seeded_zone["zone_name"], settings.DNS_ZONE_NAME)
        self.assertEqual(seeded_zone["records"][0]["name"], settings.DNS_RECORD_NAME)
        self.assertEqual(seeded_zone["records"][0]["value"], settings.PRIMARY_LINK_IP)

    @patch('app.services.dns_service.get_dns_zone')
    def test_query_dns_record(self, mock_get_zone):
        mock_get_zone.return_value = {
            "zone_name": "test.com",
            "records": [
                {"name": "api.test.com", "type": "A", "value": "1.2.3.4", "ttl": 10}
            ]
        }
        
        # Valid query
        record = query_dns_record("test.com", "api.test.com")
        self.assertIsNotNone(record)
        self.assertEqual(record["value"], "1.2.3.4")
        
        # Invalid query
        record = query_dns_record("test.com", "unknown.test.com")
        self.assertIsNone(record)

    @patch('app.services.dns_service.get_dns_zone')
    @patch('app.services.dns_service.save_dns_zone')
    @patch('app.services.dns_service.save_dns_log')
    def test_update_dns_record(self, mock_save_log, mock_save_zone, mock_get_zone):
        # Case: record already exists, perform update
        mock_get_zone.return_value = {
            "zone_name": "test.com",
            "records": [
                {"name": "api.test.com", "type": "A", "value": "1.1.1.1", "ttl": 10}
            ]
        }
        
        result = update_dns_record(
            zone_name="test.com",
            record_name="api.test.com",
            new_value="2.2.2.2"
        )
        
        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(result["record"]["value"], "2.2.2.2")
        mock_save_zone.assert_called_once()
        mock_save_log.assert_called_once()
        
        log_entry = mock_save_log.call_args[0][0]
        self.assertEqual(log_entry["old_value"], "1.1.1.1")
        self.assertEqual(log_entry["new_value"], "2.2.2.2")

    @patch('app.services.dns_service.update_route53_record')
    @patch('app.services.dns_service.get_dns_zone')
    @patch('app.services.dns_service.save_dns_zone')
    @patch('app.services.dns_service.save_dns_log')
    def test_update_dns_record_with_route53(self, mock_save_log, mock_save_zone, mock_get_zone, mock_update_route53):
        # Configure zone id in settings using patch.object
        with patch.object(settings, 'ROUTE53_HOSTED_ZONE_ID', 'Z123456789'):
            mock_get_zone.return_value = {
                "zone_name": "test.com",
                "records": [
                    {"name": "api.test.com", "type": "A", "value": "1.1.1.1", "ttl": 10}
                ]
            }
            
            result = update_dns_record(
                zone_name="test.com",
                record_name="api.test.com",
                new_value="3.3.3.3"
            )
            
            self.assertEqual(result["status"], "SUCCESS")
            mock_update_route53.assert_called_once_with(
                zone_id='Z123456789',
                record_name='api.test.com',
                new_value='3.3.3.3',
                record_type='A',
                ttl=10
            )

if __name__ == "__main__":
    unittest.main()
