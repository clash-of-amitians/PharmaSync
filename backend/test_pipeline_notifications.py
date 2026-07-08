import unittest
import asyncio
from unittest.mock import patch, MagicMock
from app.services.pipeline_simulator import simulate_pipeline_metrics_worker
from app.services.notification_service import get_notification_logs, update_notification_config

class TestPipelineNotifications(unittest.TestCase):

    def setUp(self):
        update_notification_config("SMS")
        get_notification_logs().clear()

    @patch('app.services.pipeline_simulator.asyncio.sleep')
    @patch('app.services.pipeline_simulator.random.choice')
    @patch('app.services.pipeline_simulator.random.random')
    def test_pipeline_simulator_triggers_notifications(self, mock_random, mock_choice, mock_sleep):
        # Configure mocks to run one pipeline iteration quickly
        mock_choice.return_value = "build-ui"
        mock_random.return_value = 0.5  # No failure (10% threshold)
        
        # We will run the worker in an event loop and cancel it after 1 sleep cycle
        # We can mock asyncio.sleep to raise CancelledError on its second call
        sleep_call_count = 0
        def side_effect(delay):
            nonlocal sleep_call_count
            sleep_call_count += 1
            if sleep_call_count > 2:  # After initialization and start of steps
                raise asyncio.CancelledError()
            return None
        mock_sleep.side_effect = side_effect

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(simulate_pipeline_metrics_worker())
        except asyncio.CancelledError:
            pass
        finally:
            loop.close()

        # Verify that notifications were dispatched
        logs = get_notification_logs()
        self.assertTrue(len(logs) >= 1)
        self.assertEqual(logs[0]["pipeline_id"], "build-ui")
        self.assertEqual(logs[0]["status"], "STARTED")

if __name__ == "__main__":
    unittest.main()
