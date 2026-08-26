from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class HistoriqueBase(BaseModel):
    ticker: str
    prediction: int
    prediction_label: str
    confidence: float
    actual_result: Optional[int] = None
    actual_label: Optional[str] = None
    is_correct: Optional[bool] = None
    model_version: Optional[str] = None
    horizon: Optional[int] = None

class HistoriqueCreate(HistoriqueBase):
    pass

class HistoriqueResponse(HistoriqueBase):
    id: int
    user_id: int
    prediction_date: datetime
    resolution_date: Optional[datetime] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class HistorySummary(BaseModel):
    items: List[HistoriqueResponse]
    total: int
    correct: int
    incorrect: int
    pending: int
    accuracy: float
