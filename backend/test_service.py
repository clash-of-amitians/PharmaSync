import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.failed_event_service import (
    process_order_event,
    log_failed_event,
    replay_failed_events,
    set_network_status,
    get_network_status
)

class TestFailedEventService(unittest.TestCase):
    
    def setUp(self):
        # Reset network status to online before each test
        set_network_status(True)
        
    def test_network_toggle(self):
        self.assertTrue(get_network_status())
        set_network_status(False)
        self.assertFalse(get_network_status())
        
    def test_process_order_event_success(self):
        # Should execute successfully when online and no simulate_failure flag
        result = process_order_event("EVT-101", "OrderCreated", {"item": "A"})
        self.assertTrue(result)
        
    def test_process_order_event_offline(self):
        # Should raise exception when offline
        set_network_status(False)
        with self.assertRaises(Exception) as context:
            process_order_event("EVT-101", "OrderCreated", {"item": "A"})
        self.assertIn("network offline", str(context.exception))
        
    def test_process_order_event_simulated_failure(self):
        # Should raise exception when simulate_failure is True in payload
        with self.assertRaises(Exception) as context:
            process_order_event("EVT-101", "OrderCreated", {"simulate_failure": True})
        self.assertIn("transaction processing failure", str(context.exception))

    @patch('app.services.failed_event_service.save_failed_event')
    def test_log_failed_event(self, mock_save):
        # Arrange
        mock_save.return_value = {"status": "SUCCESS"}
        
        # Act
        log_failed_event("EVT-102", "OrderCreated", "DB Error", {"item": "B"})
        
        # Assert
        mock_save.assert_called_once()
        called_arg = mock_save.call_args[0][0]
        self.assertEqual(called_arg["event_id"], "EVT-102")
        self.assertEqual(called_arg["event_type"], "OrderCreated")
        self.assertEqual(called_arg["status"], "FAILED")
        self.assertEqual(called_arg["failure_reason"], "DB Error")
        self.assertEqual(called_arg["event_payload"], {"item": "B"})
        self.assertEqual(called_arg["retry_count"], 0)

    @patch('app.services.failed_event_service.update_event_status')
    @patch('app.services.failed_event_service.get_events_by_status')
    def test_replay_failed_events_success(self, mock_get_events, mock_update_status):
        # Arrange
        failed_event = {
            "event_id": "EVT-103",
            "event_type": "OrderCreated",
            "event_payload": {"item": "C"},
            "retry_count": 0,
            "status": "FAILED",
            "created_at": "2026-07-06T10:00:00Z"
        }
        mock_get_events.return_value = [failed_event]
        # First update to PROCESSING returns success, second update to COMPLETED returns success
        mock_update_status.side_effect = [
            {"event_id": "EVT-103", "status": "PROCESSING"},
            {"event_id": "EVT-103", "status": "COMPLETED"}
        ]
        
        # Act
        results = replay_failed_events()
        
        # Assert
        self.assertEqual(results["total_attempted"], 1)
        self.assertEqual(results["succeeded"], ["EVT-103"])
        self.assertEqual(len(results["failed"]), 0)
        
        # Verify state transitions: FAILED -> PROCESSING -> COMPLETED
        mock_update_status.assert_any_call("EVT-103", status="PROCESSING")
        mock_update_status.assert_any_call(event_id="EVT-103", status="COMPLETED", last_attempt_at=unittest.mock.ANY)

    @patch('app.services.failed_event_service.update_event_status')
    @patch('app.services.failed_event_service.get_events_by_status')
    def test_replay_failed_events_failure_keeps_failed_status(self, mock_get_events, mock_update_status):
        # Arrange
        failed_event = {
            "event_id": "EVT-104",
            "event_type": "OrderCreated",
            "event_payload": {"simulate_failure": True},
            "retry_count": 0,
            "status": "FAILED",
            "created_at": "2026-07-06T10:00:00Z"
        }
        mock_get_events.return_value = [failed_event]
        # First update to PROCESSING returns success, second update back to FAILED returns success
        mock_update_status.side_effect = [
            {"event_id": "EVT-104", "status": "PROCESSING"},
            {"event_id": "EVT-104", "status": "FAILED", "retry_count": 1}
        ]
        
        # Act
        results = replay_failed_events()
        
        # Assert
        self.assertEqual(results["total_attempted"], 1)
        self.assertEqual(len(results["succeeded"]), 0)
        self.assertEqual(len(results["failed"]), 1)
        self.assertEqual(results["failed"][0]["event_id"], "EVT-104")
        
        # Verify state transitions: FAILED -> PROCESSING -> FAILED (with increment)
        mock_update_status.assert_any_call("EVT-104", status="PROCESSING")
        mock_update_status.assert_any_call(
            event_id="EVT-104", 
            status="FAILED", 
            failure_reason="Simulated transaction processing failure", 
            last_attempt_at=unittest.mock.ANY,
            increment_retry=True
        )

if __name__ == "__main__":
    unittest.main()
