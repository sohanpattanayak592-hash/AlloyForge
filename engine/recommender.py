"""
recommender.py: Grade Similarity and Opportunity Recommender.
Uses multi-dimensional chemical distance and cost proxy scoring to recommend
the top 5-10 alloy grades that a foundry can most easily/economically make from an ore or scrap melt.
"""

from typing import Dict, List, Any
import numpy as np


class GradeRecommender:
    def __init__(self, grades: List[Dict[str, Any]], optimizer=None):
        self.grades = grades
        self.optimizer = optimizer

    def recommend_best_grades(
        self,
        current_composition: Dict[str, float],
        family_filter: str = "All",
        top_k: int = 6
    ) -> List[Dict[str, Any]]:
        """
        Rank all grades based on how well they match the current melt composition,
        penalizing excessive elements (which require expensive dilution or oxygen blowing)
        and rewarding matching elements.
        """
        scored_grades = []

        all_tracked_elements = ["C", "Mn", "Si", "Cr", "Ni", "Mo", "Cu", "Al", "Ti", "V", "W", "Co", "Nb"]

        curr_vector = np.array([current_composition.get(el, 0.0) for el in all_tracked_elements])

        for g in self.grades:
            if family_filter != "All" and g.get("family") != family_filter:
                continue

            target_elements = g.get("elements", {})
            distance_score = 0.0
            excess_penalty = 0.0
            missing_elements = []
            surplus_elements = []

            for i, el in enumerate(all_tracked_elements):
                curr_val = curr_vector[i]
                spec = target_elements.get(el)

                if spec and isinstance(spec, dict):
                    mn = spec.get("min", 0.0) or 0.0
                    mx = spec.get("max", 100.0) or 100.0
                    tgt = spec.get("target", (mn + mx) / 2 if mx < 100 else mn)

                    if curr_val < mn:
                        deficit = mn - curr_val
                        # Missing element that can be added
                        distance_score += deficit * 1.5
                        missing_elements.append({"element": el, "deficit_pct": round(deficit, 2)})
                    elif curr_val > mx:
                        excess = curr_val - mx
                        # Excess element is hard to subtract (requires dilution or burning)
                        excess_penalty += excess * 5.0
                        surplus_elements.append({"element": el, "excess_pct": round(excess, 2)})
                    else:
                        # Inside spec window!
                        distance_score += abs(curr_val - tgt) * 0.2
                else:
                    # Target has no requirement for this element (tolerates trace or zero)
                    if curr_val > 0.2:
                        excess_penalty += curr_val * 2.0

            total_penalty = distance_score + excess_penalty

            # Convert to a 0-100% feasibility/match score
            match_score = max(5.0, round(100.0 / (1.0 + (total_penalty * 0.12)), 1))

            scored_grades.append({
                "grade": g["grade"],
                "family": g["family"],
                "equivalents": g.get("equivalents", ""),
                "match_score": match_score,
                "missing_elements": missing_elements,
                "surplus_elements": surplus_elements,
                "has_excess": len(surplus_elements) > 0,
                "notes": g.get("notes", "")
            })

        # Sort descending by match score
        scored_grades.sort(key=lambda x: x["match_score"], reverse=True)
        return scored_grades[:top_k]
