from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.user import UserCreate, UserResponse, Token
from app.services import auth_service
from app.core.security import verify_password, create_access_token
from app.models.user import User
import jwt
import os
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests

from app.config import get_settings

class GoogleAuthRequest(BaseModel):
    credential: str

settings = get_settings()
router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        email: str = payload.get("email")
        if email is None:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception
    user = auth_service.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    return user

oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

async def get_optional_current_user(token: str = Depends(oauth2_scheme_optional), db: Session = Depends(get_db)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        email: str = payload.get("email")
        if email is None:
            return None
    except InvalidTokenError:
        return None
    user = auth_service.get_user_by_email(db, email=email)
    return user

@router.post("/register", response_model=UserResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    normalized_email = user_in.email.strip().lower()
    user = auth_service.get_user_by_email(db, email=normalized_email)
    if user:
        # Give a specific message if the account uses Google
        if user.auth_provider == "google":
            raise HTTPException(
                status_code=409,
                detail="Ce compte existe déjà via Google. Connectez-vous avec Google, ou utilisez « Mot de passe oublié » pour définir un mot de passe local."
            )
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cette adresse email.")
    
    if user_in.username:
        user_by_name = auth_service.get_user_by_username(db, username=user_in.username)
        if user_by_name:
            raise HTTPException(status_code=409, detail="Ce nom d'utilisateur est déjà pris.")
            
    if len(user_in.password) < 8:
        raise HTTPException(status_code=422, detail="Le mot de passe doit contenir au moins 8 caractères.")
        
    if len(user_in.password.encode("utf-8")) > 256:
        raise HTTPException(
            status_code=422,
            detail="Le mot de passe est trop long."
        )

    new_user = auth_service.create_user(db, user_in)
    return new_user

@router.post("/login", response_model=Token)
def login(user_in: UserCreate, db: Session = Depends(get_db)):
    normalized_email = user_in.email.strip().lower()
    user = auth_service.get_user_by_email(db, email=normalized_email)
    
    # Detect Google-only accounts before trying to verify password
    if user and user.auth_provider == "google" and not user.password_hash:
        raise HTTPException(
            status_code=401,
            detail="Ce compte utilise la connexion Google. Cliquez sur \"Continuer avec Google\" pour vous connecter."
        )
    
    if not user or not verify_password(user_in.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Compte inactif. Contactez le support.")
        
    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@router.get("/me", response_model=UserResponse)
def get_current_active_user(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/logout")
def logout():
    return {"message": "Successfully logged out"}

@router.post("/google", response_model=Token)
def google_auth(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    try:
        # Configuration required in .env: GOOGLE_CLIENT_ID
        client_id = os.getenv("GOOGLE_CLIENT_ID", getattr(settings, "google_client_id", None))
        
        # Determine if credential is a JWT or an access token
        if request.credential.count(".") == 2:
            # Verify the ID token with Google
            idinfo = id_token.verify_oauth2_token(request.credential, requests.Request(), client_id)
            if idinfo["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
                raise ValueError("Wrong issuer.")
            if not idinfo.get("email_verified", False):
                raise HTTPException(status_code=403, detail="L'email Google n'est pas vérifié.")
        else:
            # Verify access token by calling userinfo endpoint
            import httpx
            resp = httpx.get("https://www.googleapis.com/oauth2/v3/userinfo", headers={"Authorization": f"Bearer {request.credential}"})
            if resp.status_code != 200:
                raise ValueError("Invalid access token.")
            idinfo = resp.json()
            if not idinfo.get("email_verified", False):
                raise HTTPException(status_code=403, detail="L'email Google n'est pas vérifié.")
            
        google_id = idinfo["sub"]
        email = idinfo["email"]
        name = idinfo.get("name", idinfo.get("given_name", "Utilisateur Google"))
        
        # Check if user already exists by google_id
        user = auth_service.get_user_by_google_id(db, google_id)
        
        if not user:
            # Check if user exists by email
            user = auth_service.get_user_by_email(db, email)
            if user:
                # Link account
                user = auth_service.link_google_account(db, user, google_id)
            else:
                # Create new account
                user = auth_service.create_google_user(db, email, google_id, name)
                
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Compte inactif")
            
        # Create standard AlphaML access token
        access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
        return {"access_token": access_token, "token_type": "bearer", "user": user}
        
    except ValueError as e:
        # Invalid token
        raise HTTPException(status_code=401, detail="Authentification Google invalide.")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erreur interne lors de l'authentification Google.")

from app.services import email_service
import logging

logger_auth = logging.getLogger(__name__)

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Normalize email: strip + lowercase
    normalized_email = request.email.strip().lower()
    
    generic_response = {"message": "Si cette adresse correspond à un compte, un lien de réinitialisation a été envoyé."}
    
    user = auth_service.get_user_by_email(db, email=normalized_email)
    
    if not user:
        # Anti-enumeration: always return the same response
        logger_auth.info("forgot-password: email not found (no action taken)")
        return generic_response
    
    # Generate reset token and send email
    try:
        raw_token = auth_service.create_password_reset_token(db, user)
    except Exception as e:
        logger_auth.error("forgot-password: failed to create token for user_id=%d — %s", user.id, e)
        raise HTTPException(status_code=500, detail="Erreur interne. Veuillez réessayer.")
    
    # Send email — failure does NOT expose user existence to caller
    email_sent = email_service.send_reset_password_email(
        email=user.email,
        raw_token=raw_token,
        frontend_url=settings.frontend_url
    )
    
    if not email_sent:
        logger_auth.warning(
            "forgot-password: email NOT sent for user_id=%d (SMTP misconfigured or error). "
            "Token created but not delivered.",
            user.id
        )
        # Still return generic response — don't expose delivery failure
    else:
        logger_auth.info("forgot-password: reset email sent for user_id=%d", user.id)
    
    return generic_response

@router.get("/reset-password/verify/{token}")
def verify_reset_token(token: str, db: Session = Depends(get_db)):
    """Vérifie qu'un token de reset est valide et non expiré."""
    token_record = auth_service.verify_password_reset_token(db, token)
    if token_record:
        return {"valid": True}
    return {"valid": False}

@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Réinitialise le mot de passe avec un token valide."""
    if len(request.new_password) < 8:
        raise HTTPException(status_code=422, detail="Le mot de passe doit contenir au moins 8 caractères.")
    
    if len(request.new_password.encode("utf-8")) > 256:
        raise HTTPException(status_code=422, detail="Le mot de passe est trop long.")
        
    token_record = auth_service.verify_password_reset_token(db, request.token)
    if not token_record:
        raise HTTPException(status_code=400, detail="Ce lien de réinitialisation est invalide ou a expiré. Veuillez demander un nouveau lien.")
        
    success = auth_service.reset_user_password(db, token_record, request.new_password)
    if not success:
        logger_auth.error("reset-password: failed to update password for token_id=%d", token_record.id)
        raise HTTPException(status_code=500, detail="Erreur lors de la réinitialisation du mot de passe.")
    
    logger_auth.info("reset-password: password successfully reset for user_id=%d", token_record.user_id)
    return {"message": "Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter."}

@router.get("/smtp-test", include_in_schema=False)
def smtp_test():
    """Test interne SMTP — non exposé dans la doc API publique."""
    result = email_service.test_smtp_connection()
    return result
