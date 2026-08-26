from pydantic import BaseModel, Field
from datetime import datetime
from typing import List

class FavoriteBase(BaseModel):
    ticker: str = Field(..., description="Le ticker de l'action", example="AAPL")

class FavoriteCreate(FavoriteBase):
    pass

class FavoriteToggleRequest(FavoriteBase):
    pass

class FavoriteResponse(FavoriteBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class FavoriteListResponse(BaseModel):
    favorites: List[str]

class FavoriteToggleResponse(BaseModel):
    ticker: str
    is_favorite: bool
