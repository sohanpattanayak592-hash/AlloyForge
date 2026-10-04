"""
optimizer.py: Industrial Foundry Charge and Alloying Trim Optimization Engine.
Solves the least-cost elemental mass balance using Linear Programming (scipy.optimize.linprog)
and handles element additions, dilution, and decarburization/oxidation refining.
"""

from typing import Dict, List, Optional, Any
import numpy as np
from scipy.optimize import linprog


class AlloyOptimizer:
    def __init__(self, additives: List[Dict[str, Any]]):
        self.additives = additives
        self.additive_map = {a["id"]: a for a in additives}

    def optimize_charge(
        self,
        initial_mass_kg: float,
        initial_composition: Dict[str, float],
        target_grade: Dict[str, Any],
        max_furnace_capacity_kg: Optional[float] = None,
        custom_targets: Optional[Dict[str, Dict[str, float]]] = None,
        element_recovery_overrides: Optional[Dict[str, float]] = None,
        allowed_additive_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Calculates exact kg of each raw material / ferroalloy to add to reach the grade specs.

        :param initial_mass_kg: Weight of available ore / scrap melt in furnace (kg)
        :param initial_composition: Current melt analysis, e.g. {"C": 0.12, "Cr": 14.5, "Ni": 6.2}
        :param target_grade: Dictionary containing "grade", "elements" specs {elem: {min, max, target}}
        :param max_furnace_capacity_kg: Maximum permissible batch weight
        :param custom_targets: Override bounds or midpoints for specific elements
        :param element_recovery_overrides: Custom recovery fractions {elem: 0.95}
        :param allowed_additive_ids: Specific list of raw materials available in inventory
        :return: Comprehensive optimization result with addition recipe, dilution notes, and expected chemistry
        """
        # Filter additives
        active_additives = [
            a for a in self.additives
            if allowed_additive_ids is None or a["id"] in allowed_additive_ids
        ]
        num_additives = len(active_additives)

        # Merge target elements from grade
        target_specs = {}
        for elem, bounds in target_grade.get("elements", {}).items():
            if isinstance(bounds, dict) and ("min" in bounds or "max" in bounds):
                target_specs[elem] = {
                    "min": bounds.get("min", 0.0) if bounds.get("min") is not None else 0.0,
                    "max": bounds.get("max", 100.0) if bounds.get("max") is not None else 100.0,
                    "target": bounds.get("target"),
                }

        # Apply custom overrides if provided
        if custom_targets:
            for elem, bounds in custom_targets.items():
                if elem not in target_specs:
                    target_specs[elem] = {"min": 0.0, "max": 100.0}
                if "min" in bounds:
                    target_specs[elem]["min"] = bounds["min"]
                if "max" in bounds:
                    target_specs[elem]["max"] = bounds["max"]
                if "target" in bounds:
                    target_specs[elem]["target"] = bounds["target"]

        # Track which elements are tracked across all materials and initial composition
        all_elements = set(target_specs.keys()) | set(initial_composition.keys())
        for a in active_additives:
            all_elements.update(a.get("composition", {}).keys())
        all_elements.discard("Fe")  # Fe is the balance matrix

        # Prepare Linear Programming vectors
        # Objective: minimize sum(c_j * x_j)
        c = np.array([a.get("cost_per_kg", 1.0) for a in active_additives], dtype=float)

        A_ub = []
        b_ub = []

        # Constraint 1: Maximum furnace capacity (sum(x_j) <= max_cap - initial_mass)
        if max_furnace_capacity_kg and max_furnace_capacity_kg > initial_mass_kg:
            row_cap = np.ones(num_additives, dtype=float)
            A_ub.append(row_cap)
            b_ub.append(max_furnace_capacity_kg - initial_mass_kg)

        # Constraint 2: Elemental upper and lower bounds
        # For each element k:
        # Sum_j x_j * (C_min,k - C_jk * rec_jk) <= W0 * (C_0,k - C_min,k)  [Lower bound]
        # Sum_j x_j * (C_jk * rec_jk - C_max,k) <= W0 * (C_max,k - C_0,k)  [Upper bound]
        for elem, bounds in target_specs.items():
            c_min = float(bounds.get("min", 0.0) or 0.0)
            c_max = float(bounds.get("max", 100.0) or 100.0)
            c_init = float(initial_composition.get(elem, 0.0))

            # Lower bound row: ensure >= c_min
            if c_min > 0.0:
                row_min = []
                for a in active_additives:
                    comp_val = a.get("composition", {}).get(elem, 0.0)
                    rec = (
                        element_recovery_overrides.get(elem)
                        if element_recovery_overrides and elem in element_recovery_overrides
                        else a.get("recovery", 0.90)
                    )
                    coeff = c_min - (comp_val * rec)
                    row_min.append(coeff)
                A_ub.append(row_min)
                b_ub.append(initial_mass_kg * (c_init - c_min))

            # Upper bound row: ensure <= c_max
            if c_max < 100.0:
                row_max = []
                for a in active_additives:
                    comp_val = a.get("composition", {}).get(elem, 0.0)
                    rec = (
                        element_recovery_overrides.get(elem)
                        if element_recovery_overrides and elem in element_recovery_overrides
                        else a.get("recovery", 0.90)
                    )
                    coeff = (comp_val * rec) - c_max
                    row_max.append(coeff)
                A_ub.append(row_max)
                b_ub.append(initial_mass_kg * (c_max - c_init))

        bounds_x = [(0, None) for _ in range(num_additives)]

        # Run linear programming solver (HiGHS dual simplex / interior point)
        res = linprog(
            c=c,
            A_ub=np.array(A_ub) if A_ub else None,
            b_ub=np.array(b_ub) if b_ub else None,
            bounds=bounds_x,
            method="highs",
        )

        additions_recipe = []
        elemental_adjustments = {}
        excess_elements = []
        dilution_required = False

        # Detect elements currently exceeding maximum in the starting ore
        for elem, bounds in target_specs.items():
            c_max = bounds.get("max", 100.0)
            c_init = initial_composition.get(elem, 0.0)
            if c_init > c_max:
                excess_elements.append({
                    "element": elem,
                    "current_pct": c_init,
                    "max_pct": c_max,
                    "excess_pct": round(c_init - c_max, 4),
                    "action": "Needs Dilution with Low-Carbon Iron or Refining Decarburization/Oxidation"
                })

        if res.success:
            x_sol = res.x
            total_added_mass = float(np.sum(x_sol))
            final_batch_mass = initial_mass_kg + total_added_mass
            total_cost = float(res.fun)

            for i, amount in enumerate(x_sol):
                if amount > 0.01:
                    add = active_additives[i]
                    if add["id"] == "dilution_scrap":
                        dilution_required = True
                    additions_recipe.append({
                        "additive_id": add["id"],
                        "name": add["name"],
                        "mass_kg": round(float(amount), 2),
                        "cost_per_kg": add.get("cost_per_kg", 0.0),
                        "total_cost": round(float(amount * add.get("cost_per_kg", 0.0)), 2),
                        "pct_of_charge": round((amount / final_batch_mass) * 100, 2),
                    })

            # Calculate final expected chemistry
            final_composition = {}
            for elem in all_elements:
                init_elem_mass = initial_mass_kg * (initial_composition.get(elem, 0.0) / 100.0)
                added_elem_mass = 0.0
                for i, amount in enumerate(x_sol):
                    if amount > 0.0:
                        a = active_additives[i]
                        pct = a.get("composition", {}).get(elem, 0.0)
                        rec = (
                            element_recovery_overrides.get(elem)
                            if element_recovery_overrides and elem in element_recovery_overrides
                            else a.get("recovery", 0.90)
                        )
                        added_elem_mass += amount * (pct / 100.0) * rec

                final_elem_pct = ((init_elem_mass + added_elem_mass) / final_batch_mass) * 100.0
                spec = target_specs.get(elem, {})
                status = "Within Spec"
                if spec.get("min") is not None and final_elem_pct < spec["min"] - 0.005:
                    status = "Below Min"
                elif spec.get("max") is not None and final_elem_pct > spec["max"] + 0.005:
                    status = "Above Max"

                final_composition[elem] = {
                    "initial_pct": round(initial_composition.get(elem, 0.0), 3),
                    "final_pct": round(final_elem_pct, 3),
                    "min_pct": spec.get("min"),
                    "max_pct": spec.get("max"),
                    "target_pct": spec.get("target"),
                    "status": status,
                    "delta_pct": round(final_elem_pct - initial_composition.get(elem, 0.0), 3),
                }

            # Oxygen requirements estimation for burning off excess C or Si if needed
            oxygen_blowing = None
            for excess in excess_elements:
                if excess["element"] in ["C", "Si"]:
                    excess_kg = (excess["excess_pct"] / 100.0) * initial_mass_kg
                    # C + 1/2 O2 -> CO (12g C requires 16g O2 = 1.33 kg O2 / kg C)
                    o2_kg = excess_kg * (1.33 if excess["element"] == "C" else 1.14)
                    oxygen_blowing = {
                        "excess_element": excess["element"],
                        "excess_kg": round(excess_kg, 2),
                        "estimated_o2_nm3": round(o2_kg / 1.429, 2),  # Normal m3 of O2
                        "decarburization_note": f"Can be removed via oxygen lance blowing or AOD/converter decarburization instead of scrap dilution.",
                    }

            return {
                "success": True,
                "message": "Optimization succeeded. Target specification achieved.",
                "initial_mass_kg": round(initial_mass_kg, 2),
                "total_added_mass_kg": round(total_added_mass, 2),
                "final_batch_mass_kg": round(final_batch_mass, 2),
                "total_cost": round(total_cost, 2),
                "cost_per_ton_alloy": round((total_cost / (final_batch_mass / 1000.0)), 2),
                "additions_recipe": additions_recipe,
                "final_composition": final_composition,
                "excess_elements": excess_elements,
                "oxygen_blowing": oxygen_blowing,
                "dilution_required": dilution_required,
            }
        else:
            # Fallback relaxation or diagnostic
            return {
                "success": False,
                "message": f"Optimization infeasible with current inventory constraints: {res.message}",
                "excess_elements": excess_elements,
                "diagnostic": "Consider enabling dilution scrap or relaxing furnace maximum capacity to dilute over-spec elements.",
            }
