import os
import sys
from sqlalchemy import create_engine, text

# Assurez-vous d'être dans le dossier backend/app ou backend pour importer la conf
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def migrate():
    settings = get_settings()
    engine = create_engine(settings.database_url, echo=True)
    
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR(255) DEFAULT NULL;"))
            print("Colonne 'google_id' ajoutée.")
        except Exception as e:
            print(f"Erreur (peut-être déjà existante) pour google_id: {e}")
            
        try:
            conn.execute(text("CREATE UNIQUE INDEX ix_users_google_id ON users (google_id);"))
            print("Index unique créé pour 'google_id'.")
        except Exception as e:
            print(f"Erreur (peut-être déjà existant) pour index google_id: {e}")
            
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50) DEFAULT 'password';"))
            print("Colonne 'auth_provider' ajoutée.")
        except Exception as e:
            print(f"Erreur (peut-être déjà existante) pour auth_provider: {e}")
            
        try:
            if engine.url.drivername.startswith("mysql"):
                conn.execute(text("ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;"))
                print("Colonne 'password_hash' modifiée en NULL (MySQL).")
            elif engine.url.drivername.startswith("sqlite"):
                print("SQLite détecté : la contrainte NOT NULL de password_hash sera contournée applicativement.")
        except Exception as e:
            print(f"Erreur lors de la modification de 'password_hash': {e}")
            
if __name__ == "__main__":
    print("Début de la migration de la base de données...")
    migrate()
    print("Migration terminée.")
