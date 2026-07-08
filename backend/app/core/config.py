import os
from dotenv import load_dotenv

# Load env variables from backend/.env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))

class Settings:
    PROJECT_NAME: str = "PharmaSync API"
    VERSION: str = "1.0.0"
    
    # Environment (e.g., development, production)
    ENV: str = os.getenv("ENV", "development")
    
    # DynamoDB Configuration
    DYNAMODB_REGION: str = os.getenv("AWS_DEFAULT_REGION", os.getenv("DYNAMODB_REGION", "us-east-1"))
    # In development, default to local DynamoDB endpoint
    DYNAMODB_ENDPOINT_URL: str | None = os.getenv(
        "DYNAMODB_ENDPOINT_URL", 
        "http://localhost:8000" if os.getenv("ENV", "development") == "development" else None
    )
    DYNAMODB_TABLE_NAME: str = os.getenv("DYNAMODB_TABLE_NAME", "FailedEvents")
    
    # AWS Credentials (useful for local development, dummy credentials)
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "dummy" if os.getenv("ENV", "development") == "development" else "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "dummy" if os.getenv("ENV", "development") == "development" else "")

    # DNS Failover Simulation Settings
    PRIMARY_LINK_IP: str = os.getenv("PRIMARY_LINK_IP", "10.0.1.10")
    BACKUP_LINK_IP: str = os.getenv("BACKUP_LINK_IP", "10.0.2.20")
    DNS_RECORD_NAME: str = os.getenv("DNS_RECORD_NAME", "api.pharmasync.com")
    DNS_ZONE_NAME: str = os.getenv("DNS_ZONE_NAME", "pharmasync.com")
    
    # DNS Provider API Integration (AWS Route 53)
    ROUTE53_HOSTED_ZONE_ID: str | None = os.getenv("ROUTE53_HOSTED_ZONE_ID", None)

    # Inventory Sync Service Configuration
    INVENTORY_SYNC_SERVICE_URL: str = os.getenv("INVENTORY_SYNC_SERVICE_URL", "http://localhost:8001")

settings = Settings()
