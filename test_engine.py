"""
test_engine.py: Quick integration test for optimization, recommender, and ML yield predictor.
"""

import json
from pathlib import Path
from engine.optimizer import AlloyOptimizer
from engine.recommender import GradeRecommender
from engine.yield_predictor import RecoveryYieldPredictor

data_dir = Path(__file__).resolve().parent / "data"
with open(data_dir / "grades.json", "r", encoding="utf-8") as f:
    grades = json.load(f)

with open(data_dir / "additives.json", "r", encoding="utf-8") as f:
    additives = json.load(f)

print(f"Loaded {len(grades)} grades and {len(additives)} additives.")

# Test 1: ML Yield Predictor
yp = RecoveryYieldPredictor()
recoveries = yp.predict_recoveries(temperature_c=1620, slag_basicity=1.9, furnace_type="Induction")
print("\nPredicted Recoveries at 1620°C Induction:")
for k, v in recoveries.items():
    print(f"  {k}: {round(v*100, 1)}%")

# Test 2: Target AISI 316 L from a scrap/ore melt with 1000 kg
target_316L = next(g for g in grades if g["grade"] == "AISI 316 L")
print(f"\nTarget Grade: {target_316L['grade']} ({target_316L['equivalents']})")
print(f"Specs: {target_316L['elements']}")

initial_ore = {
    "C": 0.02,
    "Mn": 0.8,
    "Si": 0.4,
    "Cr": 12.0,   # Under spec (needs 16.0 - 18.0)
    "Ni": 6.0,    # Under spec (needs 10.0 - 14.0)
    "Mo": 0.5,    # Under spec (needs 2.0 - 3.0)
    "P": 0.02,
    "S": 0.015,
}

optimizer = AlloyOptimizer(additives)
res = optimizer.optimize_charge(
    initial_mass_kg=1000.0,
    initial_composition=initial_ore,
    target_grade=target_316L,
    element_recovery_overrides=recoveries,
)

print("\nOptimization Result:")
print("Success:", res["success"])
print(f"Initial Mass: {res['initial_mass_kg']} kg | Added Mass: {res['total_added_mass_kg']} kg | Final: {res['final_batch_mass_kg']} kg")
print(f"Total Alloying Cost: ${res['total_cost']} (${res['cost_per_ton_alloy']}/ton)")
print("\nAdditions Recipe:")
for item in res["additions_recipe"]:
    print(f"  - {item['name']}: {item['mass_kg']} kg (${item['total_cost']})")

print("\nFinal Chemistry:")
for elem, vals in res["final_composition"].items():
    print(f"  {elem}: Init {vals['initial_pct']}% -> Final {vals['final_pct']}% [Min: {vals['min_pct']} | Max: {vals['max_pct']}] -> {vals['status']}")

# Test 3: Recommendation
rec = GradeRecommender(grades)
recommendations = rec.recommend_best_grades(initial_ore, top_k=5)
print("\nTop 5 Recommended Grades for this Ore:")
for r in recommendations:
    print(f"  - {r['grade']} ({r['family']}): Score {r['match_score']}% | Deficits: {[d['element'] for d in r['missing_elements']]}")
