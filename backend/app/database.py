import pymysql
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import make_url
from app.config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

def create_database_if_not_exists(db_url: str):
    try:
        url = make_url(db_url)
        if url.drivername.startswith("mysql"):
            conn = pymysql.connect(
                host=url.host,
                port=url.port or 3306,
                user=url.username or "root",
                password=url.password or ""
            )
            cursor = conn.cursor()
            db_name = url.database
            if db_name:
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
                conn.commit()
            cursor.close()
            conn.close()
    except Exception as e:
        logger.error(f"Failed to ensure database exists: {e}")

create_database_if_not_exists(settings.database_url)

engine = create_engine(settings.database_url, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
