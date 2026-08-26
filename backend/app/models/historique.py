from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base

class Historique(Base):
    __tablename__ = "historique"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ticker = Column(String(20), nullable=False)
    prediction = Column(Integer, nullable=False)
    prediction_label = Column(String(50), nullable=False)
    confidence = Column(Float, nullable=False)
    actual_result = Column(Integer, nullable=True)
    actual_label = Column(String(50), nullable=True)
    is_correct = Column(Boolean, nullable=True)
    prediction_date = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    resolution_date = Column(DateTime, nullable=True)
    model_version = Column(String(50), nullable=True)
    horizon = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="historique")
