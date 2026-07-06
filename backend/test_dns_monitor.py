import unittest
from unittest.mock import patch, MagicMock, AsyncMock
import sys
import os
import asyncio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.dns_monitor_service import (
    dns_outage_monitor_worker,
    get_monitor_status,
    trigger_alert
)
from app.services.failed_event_service import set_network_status
from app.core.config import settings

class TestDNSMonitor(unittest.TestCase):
    
    @patch('app.services.dns_monitor_service.query_dns_record')
    @patch('app.services.dns_monitor_service.update_dns_record')
    @patch('app.services.dns_monitor_service.save_dns_log')
    @patch('asyncio.sleep', new_callable=AsyncMock)
    async def run_monitor_test(self, mock_sleep, mock_save_log, mock_update, mock_query):
        # Reset monitoring status
        status = get_monitor_status()
        status["primary_link_status"] = "UP"
        status["failover_triggered"] = False
        
        # Scenario 1: Primary Link is DOWN (outage), should trigger failover to Backup IP
        set_network_status(False)
        
        # DNS resolves to primary originally
        mock_query.return_value = {"name": settings.DNS_RECORD_NAME, "value": settings.PRIMARY_LINK_IP, "type": "A"}
        mock_update.return_value = {"log": {"timestamp": "2026-07-06T20:00:00Z", "action": "FAILOVER"}}
        
        mock_sleep.side_effect = [None, asyncio.CancelledError()]
        
        await dns_outage_monitor_worker()
        
        mock_update.assert_called_with(
            zone_name=settings.DNS_ZONE_NAME,
            record_name=settings.DNS_RECORD_NAME,
            new_value=settings.BACKUP_LINK_IP,
            ttl=10
        )
        self.assertEqual(status["primary_link_status"], "DOWN")
        self.assertTrue(status["failover_triggered"])
        
        # Scenario 2: Primary Link recoveries (reverts back to UP)
        set_network_status(True)
        mock_update.reset_mock()
        
        # DNS currently points to backup
        mock_query.return_value = {"name": settings.DNS_RECORD_NAME, "value": settings.BACKUP_LINK_IP, "type": "A"}
        mock_sleep.side_effect = [None, asyncio.CancelledError()]
        
        await dns_outage_monitor_worker()
        
        mock_update.assert_called_with(
            zone_name=settings.DNS_ZONE_NAME,
            record_name=settings.DNS_RECORD_NAME,
            new_value=settings.PRIMARY_LINK_IP,
            ttl=10
        )
        self.assertEqual(status["primary_link_status"], "UP")
        self.assertFalse(status["failover_triggered"])

    def test_monitor(self):
        asyncio.run(self.run_monitor_test())

if __name__ == "__main__":
    unittest.main()
