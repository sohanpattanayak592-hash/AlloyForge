"""
main.py: FastAPI application providing the metallurgical optimization,
recommendation, and recovery prediction APIs, as well as serving the web dashboard.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from pathlib import Path
import json

from engine.optimizer import AlloyOptimizer
from engine.recommender import GradeRecommender
from engine.yield_predictor import RecoveryYieldPredictor

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="AlloyForge - Foundry Charge & Alloying Optimizer",
    description="Intelligent metallurgical mass balance, ferroalloy trim calculation, and grade recommendation engine.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load database in memory
with open(DATA_DIR / "grades.json", "r", encoding="utf-8") as f:
    GRADES_DATA = json.load(f)

with open(DATA_DIR / "additives.json", "r", encoding="utf-8") as f:
    ADDITIVES_DATA = json.load(f)

optimizer_engine = AlloyOptimizer(ADDITIVES_DATA)
recommender_engine = GradeRecommender(GRADES_DATA, optimizer_engine)
yield_predictor = RecoveryYieldPredictor()


# Pydantic Schemas
class OptimizeRequest(BaseModel):
    initial_mass_kg: float = Field(..., gt=0, description="Available ore/melt weight in kg")
    initial_composition: Dict[str, float] = Field(..., description="Chemical composition % of current ore/scrap")
    grade_name: str = Field(..., description="Target alloy grade name")
    temperature_c: Optional[float] = Field(1600.0, description="Bath temperature in °C")
    slag_basicity: Optional[float] = Field(1.8, description="Slag basicity ratio")
    furnace_type: Optional[str] = Field("Induction", description="Induction or EAF")
    max_furnace_capacity_kg: Optional[float] = Field(None, description="Max batch weight capacity")
    custom_targets: Optional[Dict[str, Dict[str, float]]] = None
    allowed_additive_ids: Optional[List[str]] = None


class RecommendRequest(BaseModel):
    current_composition: Dict[str, float]
    family_filter: Optional[str] = "All"
    top_k: Optional[int] = 6


class PredictYieldRequest(BaseModel):
    temperature_c: float = 1600.0
    slag_basicity: float = 1.8
    holding_time_min: float = 20.0
    furnace_type: str = "Induction"
    dissolved_o2_ppm: float = 40.0


# API Routes
@app.get("/api/grades")
def get_grades(family: Optional[str] = None, search: Optional[str] = None):
    results = GRADES_DATA
    if family and family != "All":
        results = [g for g in results if g["family"].lower() == family.lower()]
    if search:
        s = search.lower()
        results = [
            g for g in results
            if s in g["grade"].lower() or s in g.get("equivalents", "").lower()
        ]
    return {
        "total": len(results),
        "families": sorted(list({g["family"] for g in GRADES_DATA})),
        "grades": results
    }


@app.get("/api/grades/{grade_id}")
def get_grade_details(grade_id: str):
    for g in GRADES_DATA:
        if g["id"] == grade_id or g["grade"].lower() == grade_id.lower():
            return g
    raise HTTPException(status_code=404, detail="Grade not found")


@app.get("/api/additives")
def get_additives():
    return ADDITIVES_DATA


@app.post("/api/predict-recovery")
def predict_element_recovery(req: PredictYieldRequest):
    recoveries = yield_predictor.predict_recoveries(
        temperature_c=req.temperature_c,
        slag_basicity=req.slag_basicity,
        holding_time_min=req.holding_time_min,
        furnace_type=req.furnace_type,
        dissolved_o2_ppm=req.dissolved_o2_ppm,
    )
    return {"recoveries": recoveries}


@app.post("/api/optimize")
def optimize_charge(req: OptimizeRequest):
    # Find target grade
    target_grade = None
    for g in GRADES_DATA:
        if g["grade"].lower() == req.grade_name.lower() or g["id"] == req.grade_name.lower():
            target_grade = g
            break

    if not target_grade:
        raise HTTPException(status_code=404, detail=f"Grade '{req.grade_name}' not found.")

    # Calculate dynamic element recoveries using the ML model
    predicted_recoveries = yield_predictor.predict_recoveries(
        temperature_c=req.temperature_c,
        slag_basicity=req.slag_basicity,
        furnace_type=req.furnace_type,
    )

    result = optimizer_engine.optimize_charge(
        initial_mass_kg=req.initial_mass_kg,
        initial_composition=req.initial_composition,
        target_grade=target_grade,
        max_furnace_capacity_kg=req.max_furnace_capacity_kg,
        custom_targets=req.custom_targets,
        element_recovery_overrides=predicted_recoveries,
        allowed_additive_ids=req.allowed_additive_ids,
    )
    result["target_grade"] = target_grade
    result["predicted_recoveries"] = predicted_recoveries
    return result


@app.post("/api/recommend")
def recommend_grades(req: RecommendRequest):
    top_grades = recommender_engine.recommend_best_grades(
        current_composition=req.current_composition,
        family_filter=req.family_filter,
        top_k=req.top_k or 6,
    )
    return {"recommendations": top_grades}


# Mount Static UI
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
