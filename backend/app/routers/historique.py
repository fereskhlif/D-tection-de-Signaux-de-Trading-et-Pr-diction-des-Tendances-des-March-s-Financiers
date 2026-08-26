from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from app.database import get_db
from app.models.historique import Historique
from app.schemas.historique import HistorySummary, HistoriqueResponse
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api", tags=["Historique"])

@router.get("/history", response_model=HistorySummary)
def get_history(
    status: Optional[str] = None,
    ticker: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Historique).filter(Historique.user_id == current_user.id)
    
    if ticker:
        query = query.filter(Historique.ticker == ticker.upper())
        
    if status == "correct":
        query = query.filter(Historique.is_correct == True)
    elif status == "wrong" or status == "incorrect":
        query = query.filter(Historique.is_correct == False)
    
    historiques = query.order_by(desc(Historique.prediction_date)).all()
    
    total_query = db.query(Historique).filter(Historique.user_id == current_user.id)
    
    if ticker:
        total_query = total_query.filter(Historique.ticker == ticker.upper())
        
    all_hist = total_query.all()
    
    total = len(all_hist)
    correct = sum(1 for h in all_hist if h.is_correct is True)
    incorrect = sum(1 for h in all_hist if h.is_correct is False)
    pending = sum(1 for h in all_hist if h.is_correct is None)
    
    resolved = correct + incorrect
    accuracy = (correct / resolved * 100) if resolved > 0 else 0.0
    
    return {
        "items": historiques,
        "total": total,
        "correct": correct,
        "incorrect": incorrect,
        "pending": pending,
        "accuracy": round(accuracy, 2)
    }
