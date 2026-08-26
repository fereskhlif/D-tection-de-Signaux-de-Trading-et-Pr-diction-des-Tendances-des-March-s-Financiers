import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.schema import CreateTable

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings
from app.models.user import PasswordResetToken

def migrate():
    settings = get_settings()
    engine = create_engine(settings.database_url, echo=True)
    
    # We use SQLAlchemy's create_all which will create the table if it doesn't exist
    # but we will only pass the PasswordResetToken table to be safe
    PasswordResetToken.__table__.create(engine, checkfirst=True)
    print("Table 'password_reset_tokens' créée avec succès.")

if __name__ == "__main__":
    print("Début de la création de la table password_reset_tokens...")
    migrate()
    print("Migration terminée.")
