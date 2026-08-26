import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, Base
from app.models.user import User
from app.models.favorite import Favorite
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    logger.info("Creating tables if they do not exist...")
    Base.metadata.create_all(bind=engine)
    logger.info("Migration successful. 'favorites' table is ready.")

if __name__ == "__main__":
    migrate()
