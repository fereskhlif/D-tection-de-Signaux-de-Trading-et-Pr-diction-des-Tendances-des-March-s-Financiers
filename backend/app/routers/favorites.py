from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
import logging

from app.database import get_db
from app.models.user import User
from app.models.favorite import Favorite
from app.schemas.favorite import FavoriteToggleRequest, FavoriteToggleResponse, FavoriteResponse, FavoriteListResponse
from app.routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/favorites", tags=["favorites"])

def normalize_ticker(ticker: str) -> str:
    """Normalise un ticker (supprime les espaces, majuscules)."""
    if not ticker:
        raise HTTPException(status_code=400, detail="Le ticker ne peut pas être vide.")
    return ticker.strip().upper()

@router.get("", response_model=FavoriteListResponse)
def get_favorites(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Récupère la liste des tickers favoris de l'utilisateur connecté."""
    favorites = db.query(Favorite).filter(Favorite.user_id == current_user.id).all()
    tickers = [fav.ticker for fav in favorites]
    return {"favorites": tickers}

@router.post("", response_model=FavoriteToggleResponse)
def add_favorite(request: FavoriteToggleRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ajoute un ticker aux favoris de l'utilisateur connecté."""
    ticker = normalize_ticker(request.ticker)
    
    # Vérifie l'existence pour ne pas dupliquer
    existing = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.ticker == ticker).first()
    if existing:
        return {"ticker": ticker, "is_favorite": True}
        
    try:
        new_fav = Favorite(user_id=current_user.id, ticker=ticker)
        db.add(new_fav)
        db.commit()
    except IntegrityError:
        db.rollback()
        # En cas de race condition (deux ajouts simultanés)
        pass
        
    return {"ticker": ticker, "is_favorite": True}

@router.delete("/{ticker}", response_model=FavoriteToggleResponse)
def remove_favorite(ticker: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Supprime un ticker des favoris de l'utilisateur connecté."""
    ticker = normalize_ticker(ticker)
    
    favorite = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.ticker == ticker).first()
    if favorite:
        db.delete(favorite)
        db.commit()
        
    return {"ticker": ticker, "is_favorite": False}

@router.post("/toggle", response_model=FavoriteToggleResponse)
def toggle_favorite(request: FavoriteToggleRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Bascule l'état favori d'un ticker de l'utilisateur connecté."""
    ticker = normalize_ticker(request.ticker)
    
    favorite = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.ticker == ticker).first()
    
    if favorite:
        # Il existe, on le supprime
        db.delete(favorite)
        db.commit()
        return {"ticker": ticker, "is_favorite": False}
    else:
        # Il n'existe pas, on l'ajoute
        try:
            new_fav = Favorite(user_id=current_user.id, ticker=ticker)
            db.add(new_fav)
            db.commit()
        except IntegrityError:
            db.rollback()
            # En cas de race condition, s'il a été inséré, il est donc favori
            pass
            
        return {"ticker": ticker, "is_favorite": True}
