# -*- coding: utf-8 -*-
"""
V13.2 — Calculateur de Metriques de Confiance Explicables
==========================================================
Enrichit la sortie du modele avec des indicateurs lisibles
SANS jamais modifier les probabilites ni la decision du modele.

confidence   = P1 (sortie brute LightGBM, inchangee)
raw_confidence = alias de confidence (traçabilite)
margin         = P1 - P2
entropy        = entropie de Shannon normalisee [0=certain, 1=aleatoire]
confidence_level  = etiquette lisible (Tres elevee / Elevee / Moyenne / Faible / Tres faible)
confidence_reason = explication en langage naturel
"""
import math


def _compute_level(confidence: float, margin: float) -> str:
    """
    Retourne le niveau de confiance lisible combine sur P1 et la marge.
    """
    if confidence >= 0.70 and margin >= 0.20:
        return "Tres elevee"
    elif confidence >= 0.60 and margin >= 0.15:
        return "Elevee"
    elif confidence >= 0.45 and margin >= 0.10:
        return "Moyenne"
    elif confidence >= 0.35 and margin >= 0.05:
        return "Faible"
    else:
        return "Tres faible"


def _compute_quality(level: str) -> str:
    """Retourne l'indice de fiabilite qualitatif base sur le niveau de confiance."""
    mapping = {
        "Tres elevee": "Tres fiable",
        "Elevee": "Fiable",
        "Moyenne": "Correcte",
        "Faible": "Ambigue",
        "Tres faible": "Tres ambigue"
    }
    return mapping.get(level, "Ambigue")


def _compute_reason(probs: dict, confidence: float, margin: float, entropy: float) -> str:
    """
    Genere une explication en langage naturel de la confiance.
    Basee uniquement sur les probabilites brutes du modele.
    """
    sorted_items = sorted(probs.items(), key=lambda x: x[1], reverse=True)
    label_map = {"Hausse": "Hausse", "Baisse": "Baisse", "Stabilite": "Stabilite"}

    first_name  = label_map.get(sorted_items[0][0], sorted_items[0][0])
    second_name = label_map.get(sorted_items[1][0], sorted_items[1][0])
    first_pct   = round(sorted_items[0][1] * 100)
    second_pct  = round(sorted_items[1][1] * 100)

    # Cas 1 : tres proche entre P1 et P2 (margin < 5 %)
    if margin < 0.05:
        return (
            f"Les probabilites {first_name} ({first_pct}%) et {second_name} ({second_pct}%) "
            f"sont tres proches (ecart : {round(margin * 100, 1)}%). "
            f"Le modele hesite entre deux scenarios. "
            f"Cette prediction doit etre interpretee avec prudence."
        )

    # Cas 2 : faible separation (5 <= margin < 15 %)
    if margin < 0.15:
        return (
            f"La probabilite {first_name} ({first_pct}%) est moderement superieure "
            f"a {second_name} ({second_pct}%) (ecart : {round(margin * 100, 1)}%). "
            f"Le signal est present mais le marche reste incertain."
        )

    # Cas 3 : bonne separation (15 <= margin < 30 %)
    if margin < 0.30:
        return (
            f"La probabilite {first_name} ({first_pct}%) est nettement superieure "
            f"a {second_name} ({second_pct}%) (ecart : {round(margin * 100, 1)}%). "
            f"Le signal est relativement robuste."
        )

    # Cas 4 : tres forte separation (margin >= 30 %)
    return (
        f"La probabilite dominante {first_name} ({first_pct}%) est tres largement superieure "
        f"aux autres classes (ecart : {round(margin * 100, 1)}%). "
        f"La prediction est robuste et le signal est fort."
    )


def compute_confidence_metrics(probs: dict) -> dict:
    """
    Calcule les metriques de confiance a partir des probabilites brutes.

    Args:
        probs: dict avec cles 'Hausse', 'Baisse', 'Stabilite'
              (sortie directe du modele LightGBM V12.4, non modifiee)

    Returns:
        dict avec :
          confidence        : P1 brut du modele (= max des probabilites, inchange)
          raw_confidence    : alias de confidence (traçabilite)
          margin            : P1 - P2 (separation entre les 2 premieres classes)
          entropy           : entropie de Shannon normalisee [0=certain, 1=aleatoire]
          confidence_level  : etiquette lisible (Tres elevee -> Tres faible)
          confidence_reason : explication en langage naturel
          prediction_quality: indice de fiabilite (Tres fiable -> Tres ambigue)
    """
    p_values = list(probs.values())
    sorted_probs = sorted(p_values, reverse=True)

    p1 = sorted_probs[0]  # Probabilite maximale = confidence brute du modele
    p2 = sorted_probs[1]  # Deuxieme probabilite

    # Marge : separation entre les 2 classes les plus probables
    margin = round(p1 - p2, 4)

    # Entropie de Shannon normalisee par log(n_classes)
    # 0 = certitude totale, 1 = incertitude maximale (distribution uniforme)
    n_classes = len(p_values)
    eps = 1e-10
    entropy_raw = -sum(p * math.log(p + eps) for p in p_values)
    entropy = round(entropy_raw / math.log(n_classes), 4)

    # Niveau de confiance combine (P1 + margin)
    confidence_level = _compute_level(p1, margin)
    
    # Indice qualitatif
    prediction_quality = _compute_quality(confidence_level)

    # Justification en langage naturel
    confidence_reason = _compute_reason(probs, p1, p1 - p2, entropy)

    return {
        "raw_confidence": round(p1, 4),
        "margin": margin,
        "entropy": entropy,
        "confidence_level": confidence_level,
        "prediction_quality": prediction_quality,
        "confidence_reason": confidence_reason,
    }
