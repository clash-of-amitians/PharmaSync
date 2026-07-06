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

settings = Settings()
