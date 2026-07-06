import hashlib
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["authentication"])

# Pre-seeded users database with hashed passwords
# securepass -> SHA256: e87c385b2e3e571db682b1318084a329ecb754cf53b81180fb8c5dfc5e032bf4
USERS_DB = {
    "operator1": {
        "username": "operator1",
        "hashed_password": hashlib.sha256("securepass".encode()).hexdigest(),
        "role": "WarehouseOperator"
    }
}

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    status: str
    token: str
    username: str
    role: str

@router.post("/login", response_model=LoginResponse, summary="Securely authenticate VDI operator session")
def login(request: LoginRequest):
    username = request.username
    password = request.password
    
    # Secure fail-safe check
    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password must be supplied."
        )
        
    user = USERS_DB.get(username)
    if not user:
        # Prevent username enumeration timing attacks by doing a mock hash check
        hashlib.sha256(password.encode()).hexdigest()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Session establishment rejected."
        )
        
    # Verify hashed password
    input_hash = hashlib.sha256(password.encode()).hexdigest()
    if input_hash != user["hashed_password"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Session establishment rejected."
        )
        
    # Generate mock secure VDI session token
    session_token = f"vdi_sec_token_{hashlib.sha256((username + input_hash).encode()).hexdigest()[:16]}"
    
    return {
        "status": "SUCCESS",
        "token": session_token,
        "username": username,
        "role": user["role"]
    }
