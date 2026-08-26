# -*- coding: utf-8 -*-
"""
LightGBMWrapper — Partagé entre backend et Modeles AI/v13_3
============================================================
Ce fichier est la référence canonique pour la désérialisation
de calibrator_v13_3.joblib.

IMPORTANT : Ne jamais déplacer ni renommer ce fichier.
            Le calibrateur picklé y fait référence.
"""
import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin


class LightGBMWrapper(BaseEstimator, ClassifierMixin):
    """
    Wrapper sklearn-compatible autour d'un booster LightGBM brut.

    Permet d'utiliser CalibratedClassifierCV(cv='prefit') avec un booster
    LightGBM dont la sortie est déjà une distribution de probabilités.
    """

    def __init__(self, booster, classes):
        self.booster  = booster
        self.classes_ = np.array(classes)

    def fit(self, X, y=None):
        return self

    def predict_proba(self, X):
        """Retourne la matrice de probabilités (N×3) du booster LightGBM."""
        return self.booster.predict(X)

    def predict(self, X):
        """Retourne la classe argmax."""
        return np.argmax(self.predict_proba(X), axis=1)
