import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Add backend directory to sys.path so we can import app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.dynamodb import (
    save_failed_event,
    get_failed_event,
    update_event_status,
    get_events_by_status,
    delete_failed_event
)

class TestDynamoDBDatabase(unittest.TestCase):
    
    @patch('app.database.dynamodb.get_dynamodb_resource')
    def test_save_failed_event(self, mock_get_resource):
        # Arrange
        mock_table = MagicMock()
        mock_resource = MagicMock()
        mock_resource.Table.return_value = mock_table
        mock_get_resource.return_value = mock_resource
        
        event = {
            "event_id": "EVT-100",
            "event_type": "OrderCreated",
            "failure_reason": "Timeout",
            "created_at": "2026-07-06T10:00:00Z",
            "event_payload": {"item": "A"}
        }
        
        # Act
        result = save_failed_event(event)
        
        # Assert
        mock_resource.Table.assert_called_with("FailedEvents")
        mock_table.put_item.assert_called_once()
        called_args = mock_table.put_item.call_args[1]
        self.assertEqual(called_args["Item"]["event_id"], "EVT-100")
        self.assertEqual(called_args["Item"]["status"], "FAILED") # default added
        self.assertEqual(called_args["Item"]["retry_count"], 0) # default added
        self.assertEqual(result["event_id"], "EVT-100")
        
    @patch('app.database.dynamodb.get_dynamodb_resource')
    def test_get_failed_event(self, mock_get_resource):
        # Arrange
        mock_table = MagicMock()
        mock_resource = MagicMock()
        mock_resource.Table.return_value = mock_table
        mock_get_resource.return_value = mock_resource
        
        expected_item = {"event_id": "EVT-100", "status": "FAILED"}
        mock_table.get_item.return_value = {"Item": expected_item}
        
        # Act
        result = get_failed_event("EVT-100")
        
        # Assert
        mock_table.get_item.assert_called_once_with(Key={"event_id": "EVT-100"})
        self.assertEqual(result, expected_item)

    @patch('app.database.dynamodb.get_dynamodb_resource')
    def test_update_event_status(self, mock_get_resource):
        # Arrange
        mock_table = MagicMock()
        mock_resource = MagicMock()
        mock_resource.Table.return_value = mock_table
        mock_get_resource.return_value = mock_resource
        
        mock_table.update_item.return_value = {"Attributes": {"event_id": "EVT-100", "status": "COMPLETED"}}
        
        # Act
        result = update_event_status(
            event_id="EVT-100",
            status="COMPLETED",
            failure_reason="Resolved",
            last_attempt_at="2026-07-06T10:05:00Z",
            increment_retry=True
        )
        
        # Assert
        mock_table.update_item.assert_called_once()
        called_args = mock_table.update_item.call_args[1]
        self.assertEqual(called_args["Key"], {"event_id": "EVT-100"})
        self.assertIn("#s = :status", called_args["UpdateExpression"])
        self.assertIn("failure_reason = :reason", called_args["UpdateExpression"])
        self.assertIn("last_attempt_at = :last_attempt", called_args["UpdateExpression"])
        self.assertIn("retry_count = retry_count + :inc", called_args["UpdateExpression"])
        self.assertEqual(called_args["ExpressionAttributeValues"][":status"], "COMPLETED")
        self.assertEqual(called_args["ExpressionAttributeValues"][":reason"], "Resolved")
        self.assertEqual(called_args["ExpressionAttributeValues"][":last_attempt"], "2026-07-06T10:05:00Z")
        self.assertEqual(called_args["ExpressionAttributeValues"][":inc"], 1)
        self.assertEqual(result, {"event_id": "EVT-100", "status": "COMPLETED"})

    @patch('app.database.dynamodb.get_dynamodb_resource')
    def test_get_events_by_status(self, mock_get_resource):
        # Arrange
        mock_table = MagicMock()
        mock_resource = MagicMock()
        mock_resource.Table.return_value = mock_table
        mock_get_resource.return_value = mock_resource
        
        expected_items = [{"event_id": "EVT-100", "status": "FAILED"}]
        mock_table.query.return_value = {"Items": expected_items}
        
        # Act
        result = get_events_by_status("FAILED")
        
        # Assert
        mock_table.query.assert_called_once()
        called_args = mock_table.query.call_args[1]
        self.assertEqual(called_args["IndexName"], "StatusIndex")
        self.assertEqual(result, expected_items)

    @patch('app.database.dynamodb.get_dynamodb_resource')
    def test_delete_failed_event(self, mock_get_resource):
        # Arrange
        mock_table = MagicMock()
        mock_resource = MagicMock()
        mock_resource.Table.return_value = mock_table
        mock_get_resource.return_value = mock_resource
        
        # Act
        result = delete_failed_event("EVT-100")
        
        # Assert
        mock_table.delete_item.assert_called_once_with(Key={"event_id": "EVT-100"})
        self.assertTrue(result)

if __name__ == "__main__":
    unittest.main()
