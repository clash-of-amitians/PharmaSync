import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
from boto3.dynamodb.conditions import Key
from app.core.config import settings

# Global switch for fallback in-memory DB if DynamoDB is offline/misconfigured
USE_FALLBACK_DB = False
fallback_db = {}  # In-memory dictionary to store events locally

def get_dynamodb_resource(timeout=None):
    """
    Returns a DynamoDB resource instance configured based on settings.
    Allows passing a timeout configuration to prevent hangs during startup.
    """
    params = {
        "region_name": settings.DYNAMODB_REGION,
    }
    if settings.DYNAMODB_ENDPOINT_URL:
        params["endpoint_url"] = settings.DYNAMODB_ENDPOINT_URL
    if settings.AWS_ACCESS_KEY_ID:
        params["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
    if settings.AWS_SECRET_ACCESS_KEY:
        params["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
    
    if timeout is not None:
        params["config"] = Config(
            connect_timeout=timeout,
            read_timeout=timeout,
            retries={"max_attempts": 0}
        )
    
    return boto3.resource("dynamodb", **params)

def init_db():
    """
    Initializes the DynamoDB table. Creates it if it doesn't already exist.
    Falls back to In-Memory storage if DynamoDB is not reachable.
    """
    global USE_FALLBACK_DB
    
    # Use a short timeout to prevent deadlocks on startup
    dynamodb = get_dynamodb_resource(timeout=1.0)
    table_name = settings.DYNAMODB_TABLE_NAME
    
    try:
        table = dynamodb.create_table(
            TableName=table_name,
            KeySchema=[
                {"AttributeName": "event_id", "KeyType": "HASH"}  # Partition key
            ],
            AttributeDefinitions=[
                {"AttributeName": "event_id", "AttributeType": "S"},
                {"AttributeName": "status", "AttributeType": "S"},
                {"AttributeName": "created_at", "AttributeType": "S"}
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "StatusIndex",
                    "KeySchema": [
                        {"AttributeName": "status", "KeyType": "HASH"},       # Partition key for GSI
                        {"AttributeName": "created_at", "KeyType": "RANGE"}   # Sort key for GSI
                    ],
                    "Projection": {
                        "ProjectionType": "ALL"
                    },
                    "ProvisionedThroughput": {
                        "ReadCapacityUnits": 5,
                        "WriteCapacityUnits": 5
                    }
                }
            ],
            ProvisionedThroughput={
                "ReadCapacityUnits": 5,
                "WriteCapacityUnits": 5
            }
        )
        print(f"Creating table '{table_name}'...")
        table.meta.client.get_waiter("table_exists").wait(
            TableName=table_name,
            WaiterConfig={"Delay": 1, "MaxAttempts": 3}
        )
        print(f"Table '{table_name}' created successfully.")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceInUseException":
            print(f"Table '{table_name}' already exists.")
        else:
            print(f"Warning: Error creating table '{table_name}': {e}. Falling back to In-Memory DB.")
            USE_FALLBACK_DB = True
    except Exception as e:
        print(f"Warning: DynamoDB connectivity check failed: {e}. Falling back to In-Memory DB.")
        USE_FALLBACK_DB = True

def save_failed_event(event: dict):
    """
    Saves a failed event to DynamoDB or fallback local database.
    """
    if "retry_count" not in event:
        event["retry_count"] = 0
    if "status" not in event:
        event["status"] = "FAILED"
    
    event["retry_count"] = int(event["retry_count"])
    
    if USE_FALLBACK_DB:
        fallback_db[event["event_id"]] = event
        print(f"[Fallback DB] Logged event {event['event_id']}")
        return event

    dynamodb = get_dynamodb_resource()
    table = dynamodb.Table(settings.DYNAMODB_TABLE_NAME)
    try:
        table.put_item(Item=event)
    except Exception as e:
        print(f"Warning: DynamoDB save failed: {e}. Attempting fallback DB.")
        fallback_db[event["event_id"]] = event
    return event

def get_failed_event(event_id: str) -> dict | None:
    """
    Retrieves a failed event by its event_id.
    """
    if USE_FALLBACK_DB:
        return fallback_db.get(event_id)

    dynamodb = get_dynamodb_resource()
    table = dynamodb.Table(settings.DYNAMODB_TABLE_NAME)
    
    try:
        response = table.get_item(Key={"event_id": event_id})
        return response.get("Item")
    except Exception as e:
        print(f"Warning: DynamoDB get failed: {e}. Attempting fallback DB.")
        return fallback_db.get(event_id)

def update_event_status(
    event_id: str, 
    status: str, 
    failure_reason: str = None, 
    last_attempt_at: str = None,
    increment_retry: bool = False
) -> dict | None:
    """
    Updates the status, and optionally the failure reason, last attempt timestamp, 
    and retry count of a failed event.
    """
    if USE_FALLBACK_DB:
        if event_id not in fallback_db:
            return None
        event = fallback_db[event_id]
        event["status"] = status
        if failure_reason is not None:
            event["failure_reason"] = failure_reason
        if last_attempt_at is not None:
            event["last_attempt_at"] = last_attempt_at
        if increment_retry:
            event["retry_count"] += 1
        return event

    dynamodb = get_dynamodb_resource()
    table = dynamodb.Table(settings.DYNAMODB_TABLE_NAME)
    
    update_expression = "SET #s = :status"
    expression_attribute_names = {"#s": "status"}
    expression_attribute_values = {":status": status}
    
    if failure_reason is not None:
        update_expression += ", failure_reason = :reason"
        expression_attribute_values[":reason"] = failure_reason
        
    if last_attempt_at is not None:
        update_expression += ", last_attempt_at = :last_attempt"
        expression_attribute_values[":last_attempt"] = last_attempt_at
        
    if increment_retry:
        update_expression += ", retry_count = retry_count + :inc"
        expression_attribute_values[":inc"] = 1
        
    try:
        response = table.update_item(
            Key={"event_id": event_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues="ALL_NEW"
        )
        return response.get("Attributes")
    except Exception as e:
        print(f"Warning: DynamoDB update failed: {e}. Attempting fallback DB.")
        # Try updating fallback database in case DynamoDB connection died mid-run
        if event_id in fallback_db:
            event = fallback_db[event_id]
            event["status"] = status
            if failure_reason is not None:
                event["failure_reason"] = failure_reason
            if last_attempt_at is not None:
                event["last_attempt_at"] = last_attempt_at
            if increment_retry:
                event["retry_count"] += 1
            return event
        return None

def get_events_by_status(status: str, limit: int = 50) -> list[dict]:
    """
    Queries failed events by their status using the StatusIndex.
    """
    if USE_FALLBACK_DB:
        results = [evt for evt in fallback_db.values() if evt.get("status") == status]
        results.sort(key=lambda x: x.get("created_at", ""))
        return results[:limit]

    dynamodb = get_dynamodb_resource()
    table = dynamodb.Table(settings.DYNAMODB_TABLE_NAME)
    
    try:
        response = table.query(
            IndexName="StatusIndex",
            KeyConditionExpression=Key("status").eq(status),
            Limit=limit
        )
        return response.get("Items", [])
    except Exception as e:
        print(f"Warning: DynamoDB query failed: {e}. Attempting fallback DB.")
        results = [evt for evt in fallback_db.values() if evt.get("status") == status]
        results.sort(key=lambda x: x.get("created_at", ""))
        return results[:limit]

def delete_failed_event(event_id: str) -> bool:
    """
    Deletes a failed event from the table.
    """
    if USE_FALLBACK_DB:
        if event_id in fallback_db:
            del fallback_db[event_id]
            return True
        return False

    dynamodb = get_dynamodb_resource()
    table = dynamodb.Table(settings.DYNAMODB_TABLE_NAME)
    
    try:
        table.delete_item(Key={"event_id": event_id})
        return True
    except Exception as e:
        print(f"Warning: DynamoDB delete failed: {e}. Attempting fallback DB.")
        if event_id in fallback_db:
            del fallback_db[event_id]
            return True
        return False