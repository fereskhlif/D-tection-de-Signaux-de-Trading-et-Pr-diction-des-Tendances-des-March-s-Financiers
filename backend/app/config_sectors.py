# -*- coding: utf-8 -*-
"""
AlphaML — Configuration centralisée des secteurs et tickers.

Cette configuration détermine :
  - la composition de chaque secteur (tickers d'affichage)
  - le symbole Yahoo Finance exact pour chaque ticker
  - le nom de la société

NE PAS modifier les symboles Yahoo Finance sans vérification.
Les cryptomonnaies utilisent le suffixe -USD (ex: BTC-USD).
BNP Paribas utilise le suffixe .PA sur Yahoo Finance.
"""
from __future__ import annotations

from typing import Dict, List

# ─────────────────────────────────────────────────────────────────────────────
# Composition des secteurs
# ─────────────────────────────────────────────────────────────────────────────

SECTOR_CONFIG: Dict[str, List[Dict[str, str]]] = {
    "Technologie": [
        {"display": "AAPL",  "yf": "AAPL",    "name": "Apple Inc."},
        {"display": "MSFT",  "yf": "MSFT",    "name": "Microsoft Corp."},
        {"display": "NVDA",  "yf": "NVDA",    "name": "NVIDIA Corp."},
    ],
    "Finance": [
        {"display": "JPM",   "yf": "JPM",     "name": "JPMorgan Chase"},
        {"display": "GS",    "yf": "GS",      "name": "Goldman Sachs"},
        {"display": "BNP",   "yf": "BNP.PA",  "name": "BNP Paribas"},
    ],
    "Santé": [
        {"display": "JNJ",   "yf": "JNJ",     "name": "Johnson & Johnson"},
        {"display": "UNH",   "yf": "UNH",     "name": "UnitedHealth Group"},
        {"display": "NVO",   "yf": "NVO",     "name": "Novo Nordisk A/S"},
    ],
    "Industrie": [
        {"display": "CAT",   "yf": "CAT",     "name": "Caterpillar Inc."},
        {"display": "GE",    "yf": "GE",      "name": "GE Aerospace"},
    ],
    "Services publics": [
        {"display": "NEE",   "yf": "NEE",     "name": "NextEra Energy"},
        {"display": "DUK",   "yf": "DUK",     "name": "Duke Energy"},
    ],
    "Crypto-monnaies": [
        {"display": "BTC",   "yf": "BTC-USD", "name": "Bitcoin"},
        {"display": "ETH",   "yf": "ETH-USD", "name": "Ethereum"},
        {"display": "BNB",   "yf": "BNB-USD", "name": "Binance Coin"},
        {"display": "SOL",   "yf": "SOL-USD", "name": "Solana"},
        {"display": "XRP",   "yf": "XRP-USD", "name": "Ripple (XRP)"},
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_all_yf_tickers() -> List[str]:
    """Retourne tous les symboles Yahoo Finance."""
    return [entry["yf"] for entries in SECTOR_CONFIG.values() for entry in entries]


def get_all_display_tickers() -> List[str]:
    """Retourne tous les tickers d'affichage."""
    return [entry["display"] for entries in SECTOR_CONFIG.values() for entry in entries]


def yf_to_display(yf_ticker: str) -> str:
    """Convertit un symbole Yahoo Finance en ticker d'affichage."""
    for entries in SECTOR_CONFIG.values():
        for entry in entries:
            if entry["yf"] == yf_ticker:
                return entry["display"]
    return yf_ticker


def display_to_yf(display_ticker: str) -> str:
    """Convertit un ticker d'affichage en symbole Yahoo Finance."""
    for entries in SECTOR_CONFIG.values():
        for entry in entries:
            if entry["display"].upper() == display_ticker.upper():
                return entry["yf"]
    return display_ticker


def get_company_name(display_ticker: str) -> str:
    """Retourne le nom de la société pour un ticker d'affichage."""
    for entries in SECTOR_CONFIG.values():
        for entry in entries:
            if entry["display"].upper() == display_ticker.upper():
                return entry["name"]
    return display_ticker


def get_sector_of(display_ticker: str) -> str:
    """Retourne le secteur d'un ticker d'affichage."""
    for sector, entries in SECTOR_CONFIG.items():
        for entry in entries:
            if entry["display"].upper() == display_ticker.upper():
                return sector
    return "Inconnu"
