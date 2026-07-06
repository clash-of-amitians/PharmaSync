import unittest
from unittest.mock import MagicMock, patch, AsyncMock
import sys
import os
import asyncio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.failed_event_service import (
    auto_replay_background_worker,
    set_network_status,
    get_network_status
)

class TestBackgroundWorker(unittest.TestCase):
    
    @patch('app.services.failed_event_service.replay_failed_events')
    @patch('app.services.failed_event_service.get_events_by_status')
    @patch('asyncio.sleep', new_callable=AsyncMock)
    async def run_worker_test(self, mock_sleep, mock_get_events, mock_replay):
        # We want to test that when the network is online, it queries failed events and triggers replay.
        
        # Setup mock behavior
        mock_get_events.return_value = []
        
        # Case 1: Network is offline
        set_network_status(False)
        mock_sleep.side_effect = [None, asyncio.CancelledError()] # Exit on second iteration
        
        await auto_replay_background_worker()
        
        mock_get_events.assert_not_called()
        mock_replay.assert_not_called()
        
        # Case 2: Network transitions to online, and we have 1 failed event
        set_network_status(True)
        mock_get_events.reset_mock()
        mock_replay.reset_mock()
        mock_get_events.return_value = [{"event_id": "EVT-999", "status": "FAILED"}]
        mock_replay.return_value = {"total_attempted": 1, "succeeded": ["EVT-999"], "failed": []}
        
        mock_sleep.side_effect = [None, asyncio.CancelledError()]
        
        await auto_replay_background_worker()
        
        mock_get_events.assert_called_with("FAILED")
        mock_replay.assert_called_once()

    def test_worker(self):
        # Run the async test in the event loop
        asyncio.run(self.run_worker_test())

if __name__ == "__main__":
    unittest.main()
