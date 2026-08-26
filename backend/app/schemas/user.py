from pydantic import BaseModel, EmailStr
from typing import Optional

class UserCreate(BaseModel):
    username: Optional[str] = None # The frontend might send fullName which we can map to username or first_name
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    username: Optional[str] = None
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    email: Optional[str] = None
