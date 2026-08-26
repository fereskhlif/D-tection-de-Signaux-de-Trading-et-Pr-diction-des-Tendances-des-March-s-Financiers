from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.user import UserCreate
from app.core.security import get_password_hash

def get_user_by_email(db: Session, email: str):
    normalized = email.strip().lower()
    return db.query(User).filter(User.email == normalized).first()

def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def create_user(db: Session, user: UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = User(
        email=user.email,
        username=user.username,
        password_hash=hashed_password,
        first_name=user.username, # Defaulting first name to username
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_user_by_google_id(db: Session, google_id: str):
    return db.query(User).filter(User.google_id == google_id).first()

def create_google_user(db: Session, email: str, google_id: str, name: str):
    # Dummy password hash since SQLite might complain if it's null (even if nullable=True wasn't altered)
    # Actually we can just use empty string or a dummy hash.
    db_user = User(
        email=email,
        username=name,
        password_hash="", # Par sécurité, mettons une chaîne vide
        google_id=google_id,
        auth_provider="google",
        first_name=name,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def link_google_account(db: Session, user: User, google_id: str):
    user.google_id = google_id
    db.commit()
    db.refresh(user)
    return user

import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from app.models.user import PasswordResetToken

def create_password_reset_token(db: Session, user: User) -> str:
    # Invalidate existing active tokens
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used == False,
        PasswordResetToken.expires_at > datetime.utcnow()
    ).update({"used": True})
    
    # Generate new token
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    
    # Expiration: 30 minutes
    expires_at = datetime.utcnow() + timedelta(minutes=30)
    
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at
    )
    db.add(reset_token)
    db.commit()
    
    return raw_token

def verify_password_reset_token(db: Session, token: str) -> PasswordResetToken | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    token_record = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used == False,
        PasswordResetToken.expires_at > datetime.utcnow()
    ).first()
    return token_record

def reset_user_password(db: Session, token_record: PasswordResetToken, new_password: str):
    user = db.query(User).filter(User.id == token_record.user_id).first()
    if user:
        user.password_hash = get_password_hash(new_password)
        token_record.used = True
        db.commit()
        return True
    return False
