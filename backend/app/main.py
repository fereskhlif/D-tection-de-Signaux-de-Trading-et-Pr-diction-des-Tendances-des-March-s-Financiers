"""
AlphaML Backend — Point d'entrée principal FastAPI.

Configure :
  - CORS pour le frontend React (Vite)
  - Logging structuré
  - Gestion globale des exceptions
  - Inclusion des routers
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.exceptions import AlphaMLBaseError
from app.routers import comparison, health

# ──────────────────────────────────────────────────────────────────────────────
# Configuration du logging
# ──────────────────────────────────────────────────────────────────────────────

def _configure_logging(level: str) -> None:
    """Configure le logging structuré pour l'application."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    # Réduire le verbosité des bibliothèques tierces
    logging.getLogger("yfinance").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("peewee").setLevel(logging.WARNING)


logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Lifespan (startup / shutdown)
# ──────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialisation au démarrage et nettoyage à l'arrêt."""
    settings = get_settings()
    _configure_logging(settings.log_level)
    logger.info("=" * 60)
    logger.info("AlphaML Backend v%s démarré", settings.app_version)
    logger.info("Host: %s | Port: %s", settings.host, settings.port)
    logger.info("CORS autorisés : %s", settings.cors_origins_list)
    logger.info("Cache TTL : %ds", settings.cache_ttl)
    logger.info("=" * 60)
    yield
    logger.info("AlphaML Backend arrêté.")


# ──────────────────────────────────────────────────────────────────────────────
# Création de l'application
# ──────────────────────────────────────────────────────────────────────────────

settings = get_settings()

app = FastAPI(
    title="AlphaML API",
    description="Backend FastAPI pour la plateforme d'analyse financière AlphaML. Fournit des données réelles Yahoo Finance.",
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ──────────────────────────────────────────────────────────────────────────────
# Middleware CORS
# ──────────────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────────────
# Gestionnaires d'exceptions globaux
# ──────────────────────────────────────────────────────────────────────────────

@app.exception_handler(AlphaMLBaseError)
async def alphaml_exception_handler(request: Request, exc: AlphaMLBaseError) -> JSONResponse:
    """Gère les exceptions métier AlphaML."""
    logger.warning("Erreur métier [%d] %s : %s", exc.status_code, request.url.path, exc.message)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "type": type(exc).__name__},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Gère les exceptions inattendues."""
    logger.error("Erreur inattendue sur %s : %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Erreur interne du serveur", "detail": str(exc)},
    )


# ──────────────────────────────────────────────────────────────────────────────
# Inclusion des routers
# ──────────────────────────────────────────────────────────────────────────────

app.include_router(health.router)
app.include_router(comparison.router)

# ──────────────────────────────────────────────────────────────────────────────
# Lancement direct (optionnel)
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )
