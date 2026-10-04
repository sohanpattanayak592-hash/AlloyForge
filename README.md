# AlloyForge - Foundry Charge & Alloying Optimizer

**AlloyForge** is an industrial-grade metallurgy software suite designed for electric arc furnaces (EAF), coreless induction furnaces, and foundry shops. It solves the chemical mass balance problem to calculate the exact additions (in kg) of ferroalloys, master alloys, and virgin metals required to convert an available ore or scrap melt into any of **351 international steel and alloy grades**.

---

## 🌟 Key Capabilities

1. **Precision Mass-Balance & Trim Optimizer (Linear Programming - HiGHS)**:
   - Takes current spectrometer/lab analysis of the molten ore or scrap heat.
   - Formulates a constrained cost-minimization optimization problem subject to ASTM/EN/UNS elemental tolerances ($Min \le \%E \le Max$).
   - Outputs an exact step-by-step additions recipe with line-item weights, % of heat, and cost.

2. **Excess Chemistry Handling (Dilution & Oxygen Decarburization)**:
   - Identifies if an element in the starting melt is already higher than the grade's allowable ceiling ($C_{initial} > C_{max}$).
   - Computes low-carbon scrap dilution requirements or estimated normal cubic meters ($Nm^3$) of oxygen lance blowing for burning off excess Carbon and Silicon.

3. **Machine Learning Element Recovery (Yield) Predictor**:
   - Employs a trained Random Forest regressor (`scikit-learn`) to predict oxidation burning losses for reactive elements ($\text{Cr, Mn, Si, Ti, Al, V}$) dynamically based on bath temperature ($1500^\circ\text{C} - 1720^\circ\text{C}$), slag basicity ratio ($CaO / SiO_2$), furnace type, and holding time.

4. **Grade Recommender ("What Can I Make?")**:
   - Analyzes an arbitrary scrap or ore chemistry against all 351 grades to find the closest metallurgical matches with the lowest trimming cost and least alloy additions.

5. **351 Steel Grades Reference Dataset**:
   - Complete coverage parsed directly from the Laxcon Steels CC BY 4.0 dataset:
     - **Austenitic Stainless**: 71 grades (AISI 304, 316L, 310S, 321, 904L, Nitronic 60, etc.)
     - **Duplex & Super Duplex**: 15 grades (2205, 2507, S32760 Zeron 100, LDX 2101, etc.)
     - **Precipitation Hardening (PH)**: 9 grades (17-4 PH, 15-5 PH, 13-8 Mo, A286, Custom 450/455)
     - **Martensitic Stainless**: 46 grades (AISI 410, 420, 440C, 431, F-6NM, 1.4418, etc.)
     - **Ferritic Stainless**: 26 grades (AISI 409, 430, 444, 446, 3CR12, super-ferritics)
     - **Nickel Alloys & Superalloys**: 50 grades (Inconel 600/625/718, Incoloy 800/825, Monel 400/K500, Hastelloy C-276/C-22/B-2, Nimonic, Waspaloy)
     - **Tool Steels & High Speed Steels (HSS)**: 88 grades (D2, D3, A2, O1, H13, M2, M42, T1, S7, P20)
     - **Carbon Steels**: 46 grades (EN 1A, EN 8, EN 9, EN 45, C 15, C 45)

---

## 🚀 Quick Start

### 1. Requirements
- Python 3.10+
- Installed packages: `fastapi`, `uvicorn`, `scipy`, `scikit-learn`, `numpy`, `pydantic`

### 2. Launch with One Click
On Windows, simply double-click:
```bash
start_app.bat
```
Or run via terminal:
```bash
python run.py
```
This automatically starts the server and opens `http://localhost:8000` in your web browser.

---

## 📁 Project Architecture

```
Mini project phase 1/
│
├── api/
│   └── main.py              # FastAPI REST backend & static files server
│
├── data/
│   ├── grades.json          # 351 parsed steel & alloy grades with bounds & notes
│   ├── additives.json       # Standard commercial ferroalloys & master alloys library
│   └── raw_grades_source.md # Raw source table specifications
│
├── engine/
│   ├── optimizer.py         # Linear programming mass balance engine (HiGHS solver)
│   ├── recommender.py       # Grade compatibility and opportunity scoring
│   ├── yield_predictor.py   # ML Random Forest element recovery/oxidation model
│   └── parse_grades.py      # Parser for table to JSON extraction
│
├── static/
│   ├── index.html           # Foundry control room dashboard UI
│   ├── app.js               # Reactive frontend logic & Chart.js integration
│   └── style.css            # Dark/light theme styles & print heat sheet styles
│
├── test_engine.py           # Integration testing script
├── run.py                   # Server & browser launcher
└── start_app.bat            # Windows 1-click batch launcher
```

---

## 🛠️ REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/grades` | Search and filter grades by name or family. |
| `GET` | `/api/grades/{grade_id}` | Fetch elemental min/max/nominal specifications. |
| `GET` | `/api/additives` | List available ferroalloys, master alloys, purities, and costs. |
| `POST` | `/api/optimize` | Runs the mass balance optimization and returns the additions recipe. |
| `POST` | `/api/recommend` | Given an ore/melt chemistry, finds the top matching grades. |
| `POST` | `/api/predict-recovery` | ML prediction of elemental oxidation/recovery percentages. |

---

## 🌐 Deploying to Production

### Docker Deployment
Create a `Dockerfile`:
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```
Build and run:
```bash
docker build -t alloyforge .
docker run -p 8000:8000 alloyforge
```
Can be deployed directly to **AWS ECS / Google Cloud Run / Render / DigitalOcean App Platform**.
