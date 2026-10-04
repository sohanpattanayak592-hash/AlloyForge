"""
yield_predictor.py: Machine Learning Model for Element Recovery (Yield) Prediction.
Predicts burning/oxidation loss and recovery percentage for key reactive elements
(Cr, Mn, Si, Ti, Al, V) based on furnace operational parameters.
"""

from typing import Dict, Any
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib
from pathlib import Path


class RecoveryYieldPredictor:
    def __init__(self, model_path: Path = None):
        self.model_path = model_path
        self.models = {}
        self.elements = ["Cr", "Mn", "Si", "Ti", "Al", "V"]
        self._init_or_load_models()

    def _generate_synthetic_metallurgical_data(self, element: str, n_samples: int = 1500):
        """
        Generates realistic training data based on thermochemical and pyrometallurgical principles:
        - Higher temperature increases oxidation loss (decreases recovery).
        - Higher slag basicity protects oxidizable elements (increases recovery).
        - Induction furnaces have lower oxidation loss than EAF (inert / smaller slag contact).
        - Longer holding time increases loss.
        """
        np.random.seed(42)
        # Features: [temperature_c, slag_basicity, holding_time_min, furnace_type_eaf, dissolved_o2_ppm]
        temps = np.random.uniform(1500, 1720, n_samples)
        slag_basicity = np.random.uniform(1.0, 2.8, n_samples)
        holding_time = np.random.uniform(5, 60, n_samples)
        is_eaf = np.random.choice([0, 1], n_samples)
        dissolved_o2 = np.random.uniform(20, 250, n_samples)

        X = np.column_stack([temps, slag_basicity, holding_time, is_eaf, dissolved_o2])

        # Base nominal recoveries per element
        base_recovery = {
            "Cr": 0.94,
            "Mn": 0.89,
            "Si": 0.86,
            "Ti": 0.68,
            "Al": 0.62,
            "V": 0.91,
        }.get(element, 0.90)

        # Metallurgical sensitivity factors
        temp_effect = -0.00015 * (temps - 1580)
        slag_effect = 0.035 * (slag_basicity - 1.5)
        time_effect = -0.0012 * holding_time
        furnace_effect = -0.04 * is_eaf
        o2_effect = -0.0003 * (dissolved_o2 - 50)
        noise = np.random.normal(0, 0.015, n_samples)

        y = base_recovery + temp_effect + slag_effect + time_effect + furnace_effect + o2_effect + noise
        y = np.clip(y, 0.35, 0.99)

        return X, y

    def train_models(self):
        """Train Random Forest regression models for each oxidizable element."""
        for elem in self.elements:
            X, y = self._generate_synthetic_metallurgical_data(elem)
            rf = RandomForestRegressor(n_estimators=40, max_depth=6, random_state=42)
            rf.fit(X, y)
            self.models[elem] = rf

    def _init_or_load_models(self):
        # In-memory training for zero-latency startup
        self.train_models()

    def predict_recoveries(
        self,
        temperature_c: float = 1600.0,
        slag_basicity: float = 1.8,
        holding_time_min: float = 20.0,
        furnace_type: str = "Induction",
        dissolved_o2_ppm: float = 40.0
    ) -> Dict[str, float]:
        """
        Predicts element recovery fractions (0.0 to 1.0) under current operating conditions.
        """
        is_eaf = 1 if "eaf" in furnace_type.lower() or "arc" in furnace_type.lower() else 0
        features = np.array([[temperature_c, slag_basicity, holding_time_min, is_eaf, dissolved_o2_ppm]])

        results = {
            # Noble elements with near 100% recovery in molten steel
            "Ni": 0.985,
            "Mo": 0.965,
            "Cu": 0.960,
            "W": 0.940,
            "Nb": 0.890,
            "C": 0.850,
        }

        for elem in self.elements:
            if elem in self.models:
                pred = float(self.models[elem].predict(features)[0])
                results[elem] = round(pred, 3)

        return results
