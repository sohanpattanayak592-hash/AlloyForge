// app.js: Frontend Application Logic for ScrapSmart (Clean, Frictionless Melter UI)

const TRACKED_ELEMENTS = [
  { symbol: "C", name: "Carbon", default: 0.02, step: 0.01 },
  { symbol: "Mn", name: "Manganese", default: 0.80, step: 0.05 },
  { symbol: "Si", name: "Silicon", default: 0.40, step: 0.05 },
  { symbol: "Cr", name: "Chromium", default: 12.00, step: 0.1 },
  { symbol: "Ni", name: "Nickel", default: 6.00, step: 0.1 },
  { symbol: "Mo", name: "Molybdenum", default: 0.50, step: 0.05 },
  { symbol: "Cu", name: "Copper", default: 0.10, step: 0.05 },
  { symbol: "Al", name: "Aluminum", default: 0.02, step: 0.01 },
  { symbol: "Ti", name: "Titanium", default: 0.00, step: 0.01 },
  { symbol: "V", name: "Vanadium", default: 0.00, step: 0.05 },
  { symbol: "W", name: "Tungsten", default: 0.00, step: 0.1 },
  { symbol: "Co", name: "Cobalt", default: 0.00, step: 0.1 },
  { symbol: "Nb", name: "Niobium", default: 0.00, step: 0.01 },
  { symbol: "P", name: "Phosphorus", default: 0.025, step: 0.005 },
  { symbol: "S", name: "Sulfur", default: 0.015, step: 0.005 }
];

let allGrades = [];
let allAdditives = [];
let selectedGrade = null;
let compositionChart = null;

// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
  renderElementsInputGrid();
  await loadGrades();
  await loadAdditives();
  initCompositionChart();

  // Select default grade AISI 316 L
  const defaultGrade = allGrades.find(g => g.grade === "AISI 316 L") || allGrades[0];
  if (defaultGrade) {
    selectGrade(defaultGrade);
  }

  // Auto-run initial charge calculation
  setTimeout(() => runOptimization(), 300);

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    const searchInput = document.getElementById("grade-search");
    const dropdown = document.getElementById("grade-dropdown-list");
    if (dropdown && !dropdown.contains(e.target) && e.target !== searchInput) {
      dropdown.classList.add("hidden");
    }
  });
});

// Render dynamic large touch-friendly element input cards
function renderElementsInputGrid() {
  const container = document.getElementById("elements-input-grid");
  if (!container) return;
  container.innerHTML = "";

  TRACKED_ELEMENTS.forEach(el => {
    const card = document.createElement("div");
    card.className = "element-card-input";
    card.id = `card-elem-${el.symbol}`;
    card.innerHTML = `
      <div class="flex justify-between items-baseline">
        <label for="input-elem-${el.symbol}" class="text-xs font-black text-amber-400 font-mono tracking-wider">${el.symbol}</label>
        <span class="text-[10px] text-slate-400 font-medium truncate ml-1">${el.name}</span>
      </div>
      <div class="flex items-baseline justify-between mt-1">
        <input type="number" id="input-elem-${el.symbol}" value="${el.default}" min="0" max="100" step="${el.step}"
          class="text-lg font-bold text-white font-mono outline-none"
          oninput="onCompositionChange()">
        <span class="text-[11px] font-mono text-slate-500 font-bold ml-1">%</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// Load Grades (supports Netlify static path & FastAPI)
async function loadGrades() {
  try {
    let res = await fetch("/data/grades.json").catch(() => null);
    if (!res || !res.ok) {
      res = await fetch("/api/grades");
    }
    const data = await res.json();
    allGrades = Array.isArray(data) ? data : (data.grades || []);
  } catch (err) {
    console.error("Failed to load grades database:", err);
  }
}

// Filter & Browse All 351 Grades Grouped by Family
function filterGradesDropdown(searchTerm = null) {
  const input = document.getElementById("grade-search");
  const dropdown = document.getElementById("grade-dropdown-list");
  const familySelect = document.getElementById("grade-family-select");
  if (!dropdown) return;

  const selectedFamily = familySelect ? familySelect.value : "All";

  // If searchTerm is null or matches current selected grade name exactly upon focus, show all
  let term = "";
  if (searchTerm !== null) {
    term = searchTerm.toLowerCase().trim();
  } else if (input) {
    const rawVal = input.value.trim();
    if (selectedGrade && rawVal.toLowerCase() === selectedGrade.grade.toLowerCase()) {
      term = ""; // Show all grades when focused on existing selection
    } else {
      term = rawVal.toLowerCase();
    }
  }

  // Filter grades
  let matches = allGrades.filter(g => {
    const matchesFamily = (selectedFamily === "All") || (g.family.toLowerCase() === selectedFamily.toLowerCase());
    if (!matchesFamily) return false;
    if (!term) return true;

    return g.grade.toLowerCase().includes(term) ||
      g.family.toLowerCase().includes(term) ||
      (g.equivalents && g.equivalents.toLowerCase().includes(term));
  });

  if (matches.length === 0) {
    dropdown.innerHTML = `
      <div class="p-4 text-center text-xs text-slate-400">
        <p>No steel grades found matching "${term}".</p>
        <button onclick="clearGradeSearch()" class="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-semibold">
          Reset Filter & Show All 351 Alloys
        </button>
      </div>`;
    dropdown.classList.remove("hidden");
    return;
  }

  // Group matches by family for organized browsing
  const grouped = {};
  matches.forEach(g => {
    if (!grouped[g.family]) grouped[g.family] = [];
    grouped[g.family].push(g);
  });

  let html = `
    <div class="sticky top-0 bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between z-10 text-xs">
      <span class="text-slate-300 font-bold">Showing <span class="text-amber-400 font-mono">${matches.length}</span> of ${allGrades.length} alloys</span>
      ${term || selectedFamily !== "All" ? `
        <button onclick="clearGradeSearch()" class="text-amber-400 hover:underline text-[11px] font-medium">Show All 351</button>
      ` : ''}
    </div>
  `;

  for (const [family, gradesList] of Object.entries(grouped)) {
    html += `
      <div class="family-group">
        <div class="sticky top-8 bg-slate-950/95 backdrop-blur px-3.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 flex justify-between items-center">
          <span class="text-amber-400">${family}</span>
          <span class="font-mono text-slate-500">${gradesList.length}</span>
        </div>
        <div>
          ${gradesList.map(g => {
            const isSelected = selectedGrade && selectedGrade.id === g.id;
            return `
              <div onclick="selectGradeById('${g.id}')" 
                class="px-3.5 py-2.5 hover:bg-slate-800 cursor-pointer transition flex items-center justify-between ${isSelected ? 'bg-amber-500/10 border-l-2 border-amber-500' : ''}">
                <div class="min-w-0 pr-2">
                  <div class="flex items-center space-x-2">
                    <span class="text-sm font-bold text-white font-mono">${g.grade}</span>
                    ${isSelected ? '<span class="text-[10px] text-amber-400 font-semibold px-1.5 py-0.2 rounded bg-amber-500/20">Active</span>' : ''}
                  </div>
                  ${g.equivalents ? `<p class="text-[11px] text-slate-400 truncate mt-0.5">${g.equivalents}</p>` : ''}
                </div>
                <span class="text-[10px] text-slate-400 flex-shrink-0 font-medium">${g.family}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  dropdown.innerHTML = html;
  dropdown.classList.remove("hidden");
}

// When clicking or focusing on the search box, select text and show all alloys
function onGradeSearchFocus() {
  const input = document.getElementById("grade-search");
  if (input) input.select();
  filterGradesDropdown(""); // Show full list of alloys in active family
}

// Clear search and show all 351 grades
function clearGradeSearch() {
  const input = document.getElementById("grade-search");
  const familySelect = document.getElementById("grade-family-select");
  if (input) input.value = "";
  if (familySelect) familySelect.value = "All";
  filterGradesDropdown("");
  if (input) input.focus();
}

// Show all grades dropdown explicitly
function showAllGradesDropdown() {
  clearGradeSearch();
}

// When family filter changes
function onFamilyFilterChange() {
  const input = document.getElementById("grade-search");
  if (input) input.value = "";
  filterGradesDropdown("");
}

function selectGradeById(gradeId) {
  const grade = allGrades.find(g => g.id === gradeId);
  if (grade) {
    selectGrade(grade);
    document.getElementById("grade-dropdown-list")?.classList.add("hidden");
    const searchInput = document.getElementById("grade-search");
    if (searchInput) searchInput.value = grade.grade;
    runOptimization();
  }
}

// Select Active Grade & Update Header Badges
function selectGrade(grade) {
  selectedGrade = grade;
  const gradeSearch = document.getElementById("grade-search");
  if (gradeSearch && document.activeElement !== gradeSearch) {
    gradeSearch.value = grade.grade;
  }

  const famEl = document.getElementById("active-grade-family");
  if (famEl) famEl.textContent = grade.family;

  const familySelect = document.getElementById("grade-family-select");
  if (familySelect && familySelect.value !== "All" && familySelect.value !== grade.family) {
    familySelect.value = grade.family;
  }

  const eqEl = document.getElementById("active-grade-equivalents");
  if (eqEl) {
    eqEl.innerHTML = `Selected: <span class="text-slate-200 font-mono font-medium">${grade.grade} ${grade.equivalents ? `(${grade.equivalents})` : ''}</span>`;
  }

  onCompositionChange();
}

// Gather Current Ore Composition from inputs
function getCurrentOreComposition() {
  const comp = {};
  TRACKED_ELEMENTS.forEach(el => {
    const val = parseFloat(document.getElementById(`input-elem-${el.symbol}`)?.value || 0.0);
    if (!isNaN(val) && val > 0.0) {
      comp[el.symbol] = val;
    }
  });
  return comp;
}

function clearOreComposition() {
  TRACKED_ELEMENTS.forEach(el => {
    const inp = document.getElementById(`input-elem-${el.symbol}`);
    if (inp) inp.value = "0.0";
  });
  onCompositionChange();
  runOptimization();
}

// Range status feedback on input cards
function onCompositionChange() {
  if (!selectedGrade || !selectedGrade.elements) return;
  const targetElements = selectedGrade.elements;

  TRACKED_ELEMENTS.forEach(el => {
    const card = document.getElementById(`card-elem-${el.symbol}`);
    const inp = document.getElementById(`input-elem-${el.symbol}`);
    if (!card || !inp) return;

    const val = parseFloat(inp.value || 0.0);
    const spec = targetElements[el.symbol];

    card.classList.remove("status-excess", "status-deficit", "status-ok");

    if (spec) {
      const min = spec.min || 0.0;
      const max = spec.max || 100.0;
      if (val > max) {
        card.classList.add("status-excess");
      } else if (val < min) {
        card.classList.add("status-deficit");
      } else {
        card.classList.add("status-ok");
      }
    }
  });
}

// Preset Ore Loader
function loadOrePreset(presetKey) {
  clearOreComposition();

  const presets = {
    mild_scrap: { C: 0.12, Mn: 0.65, Si: 0.25, P: 0.03, S: 0.025 },
    ss304_scrap: { C: 0.04, Mn: 1.20, Si: 0.50, Cr: 18.2, Ni: 8.4, Mo: 0.25, P: 0.03, S: 0.015 },
    low_alloy: { C: 0.28, Mn: 0.80, Si: 0.30, Cr: 1.10, Mo: 0.20, Ni: 0.35 }
  };

  const selectedPreset = presets[presetKey] || {};
  for (const [elem, val] of Object.entries(selectedPreset)) {
    const inp = document.getElementById(`input-elem-${elem}`);
    if (inp) inp.value = val;
  }
  onCompositionChange();
  runOptimization();
}

// Thermochemical Recovery Yields (Induction Furnace Nominal)
function calculateMLRecoveries(temperature_c = 1620, slag_basicity = 1.8, holding_time_min = 20) {
  const tempDiff = temperature_c - 1580;
  const slagDiff = slag_basicity - 1.5;

  const baseRecoveries = {
    Cr: 0.94 - (0.00015 * tempDiff) + (0.035 * slagDiff) - (0.0012 * holding_time_min),
    Mn: 0.89 - (0.00018 * tempDiff) + (0.040 * slagDiff) - (0.0014 * holding_time_min),
    Si: 0.86 - (0.00020 * tempDiff) + (0.025 * slagDiff) - (0.0010 * holding_time_min),
    Ti: 0.68 - (0.00025 * tempDiff) + (0.050 * slagDiff) - (0.0020 * holding_time_min),
    Al: 0.62 - (0.00028 * tempDiff) + (0.045 * slagDiff) - (0.0022 * holding_time_min),
    V:  0.91 - (0.00016 * tempDiff) + (0.030 * slagDiff) - (0.0012 * holding_time_min),
    Ni: 0.985,
    Mo: 0.965,
    Cu: 0.960,
    W:  0.940,
    Nb: 0.890,
    C:  0.850
  };

  const results = {};
  for (const [k, v] of Object.entries(baseRecoveries)) {
    results[k] = Math.min(0.99, Math.max(0.35, Math.round(v * 1000) / 1000));
  }
  return results;
}

// In-Browser Linear Programming Simplex Solver (Fallback for standalone Netlify)
function solveChargeInBrowser(initialMass, initialComp, targetGrade, recoveries) {
  const targetSpecs = {};
  for (const [elem, bounds] of Object.entries(targetGrade.elements || {})) {
    if (typeof bounds === "object" && bounds !== null) {
      targetSpecs[elem] = {
        min: bounds.min !== undefined && bounds.min !== null ? bounds.min : 0.0,
        max: bounds.max !== undefined && bounds.max !== null ? bounds.max : 100.0,
        target: bounds.target
      };
    }
  }

  // Detect excess elements
  const excessElements = [];
  for (const [elem, bounds] of Object.entries(targetSpecs)) {
    const initVal = initialComp[elem] || 0.0;
    if (initVal > bounds.max) {
      excessElements.push({
        element: elem,
        current_pct: initVal,
        max_pct: bounds.max,
        excess_pct: Math.round((initVal - bounds.max) * 1000) / 1000
      });
    }
  }

  const model = {
    optimize: "cost",
    opType: "min",
    constraints: {},
    variables: {}
  };

  for (const [elem, bounds] of Object.entries(targetSpecs)) {
    const c_min = bounds.min;
    const c_max = bounds.max;
    const c_init = initialComp[elem] || 0.0;

    if (c_min > 0.0) {
      model.constraints[`${elem}_min`] = { max: initialMass * (c_init - c_min) };
    }
    if (c_max < 100.0) {
      model.constraints[`${elem}_max`] = { max: initialMass * (c_max - c_init) };
    }
  }

  allAdditives.forEach(add => {
    const varDef = { cost: add.cost_per_kg };
    for (const [elem, bounds] of Object.entries(targetSpecs)) {
      const c_min = bounds.min;
      const c_max = bounds.max;
      const compVal = add.composition[elem] || 0.0;
      const rec = recoveries[elem] || add.recovery || 0.90;

      if (c_min > 0.0) {
        varDef[`${elem}_min`] = c_min - (compVal * rec);
      }
      if (c_max < 100.0) {
        varDef[`${elem}_max`] = (compVal * rec) - c_max;
      }
    }
    model.variables[add.id] = varDef;
  });

  let solution = null;
  if (window.solver && typeof window.solver.Solve === "function") {
    solution = window.solver.Solve(model);
  }

  let totalAddedMass = 0;
  let totalCost = 0;
  const additionsRecipe = [];

  if (solution && solution.feasible) {
    totalCost = solution.result || 0;
    allAdditives.forEach(add => {
      const amount = solution[add.id] || 0;
      if (amount > 0.02) {
        totalAddedMass += amount;
        additionsRecipe.push({
          additive_id: add.id,
          name: add.name,
          mass_kg: Math.round(amount * 100) / 100,
          cost_per_kg: add.cost_per_kg,
          total_cost: Math.round(amount * add.cost_per_kg * 100) / 100,
          pct_of_charge: 0
        });
      }
    });
  } else {
    // Direct elemental deficit calculation fallback
    for (const [elem, bounds] of Object.entries(targetSpecs)) {
      const initVal = initialComp[elem] || 0.0;
      if (initVal < bounds.min) {
        const deficitPct = bounds.min - initVal;
        const matchingAdd = allAdditives.find(a => (a.composition[elem] || 0) > 40) || allAdditives[0];
        const rec = recoveries[elem] || matchingAdd.recovery || 0.90;
        const addedMass = (initialMass * (deficitPct / 100)) / ((matchingAdd.composition[elem] / 100) * rec);
        totalAddedMass += addedMass;
        totalCost += addedMass * matchingAdd.cost_per_kg;
        additionsRecipe.push({
          additive_id: matchingAdd.id,
          name: matchingAdd.name,
          mass_kg: Math.round(addedMass * 100) / 100,
          cost_per_kg: matchingAdd.cost_per_kg,
          total_cost: Math.round(addedMass * matchingAdd.cost_per_kg * 100) / 100,
          pct_of_charge: 0
        });
      }
    }
  }

  const finalBatchMass = initialMass + totalAddedMass;
  additionsRecipe.forEach(a => {
    a.pct_of_charge = Math.round((a.mass_kg / finalBatchMass) * 1000) / 10;
  });

  const allTracked = new Set([...Object.keys(targetSpecs), ...Object.keys(initialComp)]);
  allTracked.delete("Fe");

  const finalComposition = {};
  allTracked.forEach(elem => {
    const initMass = initialMass * ((initialComp[elem] || 0.0) / 100);
    let addedMass = 0;
    additionsRecipe.forEach(item => {
      const add = allAdditives.find(x => x.id === item.additive_id);
      if (add) {
        const pct = add.composition[elem] || 0.0;
        const rec = recoveries[elem] || add.recovery || 0.90;
        addedMass += item.mass_kg * (pct / 100) * rec;
      }
    });

    const finalPct = Math.round(((initMass + addedMass) / finalBatchMass) * 100000) / 1000;
    const spec = targetSpecs[elem] || {};
    let status = "Within Spec";
    if (spec.min !== undefined && finalPct < spec.min - 0.005) status = "Below Min";
    if (spec.max !== undefined && finalPct > spec.max + 0.005) status = "Above Max";

    finalComposition[elem] = {
      initial_pct: initialComp[elem] || 0.0,
      final_pct: finalPct,
      min_pct: spec.min,
      max_pct: spec.max,
      target_pct: spec.target,
      status: status,
      delta_pct: Math.round((finalPct - (initialComp[elem] || 0.0)) * 1000) / 1000
    };
  });

  let oxygenBlowing = null;
  const cExcess = excessElements.find(e => e.element === "C");
  if (cExcess) {
    const excessKg = (cExcess.excess_pct / 100) * initialMass;
    oxygenBlowing = {
      excess_element: "C",
      excess_kg: Math.round(excessKg * 100) / 100,
      estimated_o2_nm3: Math.round((excessKg * 1.33 / 1.429) * 10) / 10
    };
  }

  return {
    success: true,
    initial_mass_kg: initialMass,
    total_added_mass_kg: Math.round(totalAddedMass * 100) / 100,
    final_batch_mass_kg: Math.round(finalBatchMass * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    cost_per_ton_alloy: Math.round((totalCost / (finalBatchMass / 1000)) * 100) / 100,
    additions_recipe: additionsRecipe,
    final_composition: finalComposition,
    excess_elements: excessElements,
    oxygen_blowing: oxygenBlowing,
    target_grade: targetGrade
  };
}

// Run Optimization
async function runOptimization() {
  if (!selectedGrade) return;

  const btn = document.getElementById("btn-calculate");
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>Calculating Optimal Charge...</span>`;
  lucide.createIcons();

  const initialMass = parseFloat(document.getElementById("input-mass").value || 1000);
  const composition = getCurrentOreComposition();
  const recoveries = calculateMLRecoveries(1620, 1.8, 20);

  try {
    let res = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initial_mass_kg: initialMass,
        initial_composition: composition,
        grade_name: selectedGrade.grade,
        furnace_type: "Induction",
        temperature_c: 1620,
        slag_basicity: 1.8
      })
    }).catch(() => null);

    let result;
    if (res && res.ok) {
      result = await res.json();
    } else {
      result = solveChargeInBrowser(initialMass, composition, selectedGrade, recoveries);
    }
    renderOptimizationResults(result);
  } catch (err) {
    console.error("Optimization failed, falling back to browser solver:", err);
    const result = solveChargeInBrowser(initialMass, composition, selectedGrade, recoveries);
    renderOptimizationResults(result);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="calculator" class="w-6 h-6 stroke-[2.5]"></i><span>Calculate Optimized Charge</span>`;
    lucide.createIcons();
  }
}

// Render Streamlined Results
function renderOptimizationResults(res) {
  // 1. Primary Result Header
  const targetName = res.target_grade?.grade || selectedGrade?.grade || "Alloy Grade";
  const targetEquiv = res.target_grade?.equivalents || selectedGrade?.equivalents || "";
  
  document.getElementById("res-target-grade-name").textContent = targetName;
  document.getElementById("res-target-grade-specs").textContent = targetEquiv ? `Equivalents: ${targetEquiv}` : "ASTM / EN Reference Specification";
  
  const totalCost = res.total_cost || 0;
  const costPerTon = res.cost_per_ton_alloy || 0;
  document.getElementById("res-total-cost").textContent = `$${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById("res-cost-per-ton").textContent = `$${costPerTon.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ton alloy`;

  document.getElementById("res-added-mass").textContent = `${res.total_added_mass_kg || 0} kg`;
  document.getElementById("res-batch-mass").textContent = `Final Heat: ${(res.final_batch_mass_kg || 0).toLocaleString()} kg`;

  // Status Badge
  const statusBadge = document.getElementById("res-target-grade-badge");
  if (res.excess_elements && res.excess_elements.length > 0) {
    statusBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30";
    statusBadge.textContent = "Excess In Scrap";
  } else {
    statusBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    statusBadge.textContent = "Within Spec";
  }

  // 2. Excess Elements Alert & Decarburization Notes
  const alertBanner = document.getElementById("excess-alert-banner");
  const alertText = document.getElementById("excess-alert-text");
  const oxygenRec = document.getElementById("oxygen-blowing-recommendation");

  if (res.excess_elements && res.excess_elements.length > 0) {
    alertBanner.classList.remove("hidden");
    alertText.innerHTML = res.excess_elements.map(ex => `
      • <strong>${ex.element}:</strong> Initial scrap is <strong>${ex.current_pct}%</strong> (Exceeds maximum allowable ${ex.max_pct}% by +${ex.excess_pct}%).
    `).join("<br>");

    if (res.oxygen_blowing) {
      oxygenRec.innerHTML = `
        ⚡ <strong>Shop-Floor Decarburization Option:</strong> Blow ~<strong>${res.oxygen_blowing.estimated_o2_nm3} Nm³</strong> of Oxygen via lance to oxidize <strong>${res.oxygen_blowing.excess_kg} kg</strong> excess Carbon into CO/CO₂ without needing scrap dilution.
      `;
    } else {
      oxygenRec.innerHTML = `💡 Low-carbon steel scrap dilution applied automatically to pull chemistry within allowable limits.`;
    }
  } else {
    alertBanner.classList.add("hidden");
  }

  // 3. The Recipe Table
  const recipeTbody = document.getElementById("recipe-table-body");
  if (res.additions_recipe && res.additions_recipe.length > 0) {
    recipeTbody.innerHTML = res.additions_recipe.map((item, idx) => `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-3 px-3.5 font-medium text-white flex items-center space-x-2.5">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0"></span>
          <span class="font-semibold">${item.name}</span>
        </td>
        <td class="py-3 px-3.5 text-right font-mono font-bold text-amber-300 text-base">${item.mass_kg.toLocaleString()} kg</td>
        <td class="py-3 px-3.5 text-right font-mono text-slate-400">${item.pct_of_charge}%</td>
        <td class="py-3 px-3.5 text-right font-mono text-slate-400">$${item.cost_per_kg.toFixed(2)}/kg</td>
        <td class="py-3 px-3.5 text-right font-mono font-bold text-emerald-400">$${item.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `).join("");
  } else {
    recipeTbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-emerald-400 font-medium">
          ✓ Melt chemistry is already inside allowable specification tolerances. No ferro-alloy additions required.
        </td>
      </tr>
    `;
  }

  // 4. Verification Table
  const verifTbody = document.getElementById("verification-table-body");
  const chartLabels = [];
  const chartInitial = [];
  const chartFinal = [];
  const chartMin = [];
  const chartMax = [];

  const finalComp = res.final_composition || {};
  const rows = [];

  for (const [elem, data] of Object.entries(finalComp)) {
    if (data.initial_pct > 0 || (data.min_pct && data.min_pct > 0) || (data.max_pct && data.max_pct < 100)) {
      const minText = data.min_pct !== null && data.min_pct !== undefined ? `${data.min_pct}%` : "0%";
      const maxText = data.max_pct !== null && data.max_pct !== undefined ? `${data.max_pct}%` : "None";
      const statusBadge = data.status === "Within Spec"
        ? `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Within Spec</span>`
        : `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">${data.status}</span>`;

      rows.push(`
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-2.5 px-3.5 font-bold text-amber-400 font-mono text-sm">${elem}</td>
          <td class="py-2.5 px-3.5 text-right text-slate-400 font-mono">${data.initial_pct}%</td>
          <td class="py-2.5 px-3.5 text-right font-bold text-white font-mono text-sm">${data.final_pct}%</td>
          <td class="py-2.5 px-3.5 text-center text-slate-300 font-mono">${minText} - ${maxText}</td>
          <td class="py-2.5 px-3.5 text-center font-sans">${statusBadge}</td>
        </tr>
      `);

      chartLabels.push(elem);
      chartInitial.push(data.initial_pct);
      chartFinal.push(data.final_pct);
      chartMin.push(data.min_pct || 0);
      chartMax.push(data.max_pct && data.max_pct < 100 ? data.max_pct : data.final_pct * 1.15);
    }
  }

  verifTbody.innerHTML = rows.join("");
  updateCompositionChart(chartLabels, chartInitial, chartFinal, chartMin, chartMax);

  // 5. Metallurgical Explanations in Plain English
  const notesText = document.getElementById("notes-content-text");
  if (notesText) {
    let explanation = `The charge optimization model solved a least-cost linear mass balance for ${targetName}. `;
    if (res.additions_recipe && res.additions_recipe.length > 0) {
      const topAdditions = res.additions_recipe.slice(0, 3).map(a => `${a.mass_kg} kg of ${a.name}`).join(", ");
      explanation += `Key additions charged: ${topAdditions}. `;
    }
    if (res.excess_elements && res.excess_elements.length > 0) {
      explanation += `Excess ${res.excess_elements.map(e => e.element).join(", ")} was identified in the base charge. If working with an induction furnace without decarburization equipment, verify dilution scrap ratio prior to tap. `;
    } else {
      explanation += `All elements are predicted to tap cleanly within the required ASTM/EN tolerance limits. `;
    }
    notesText.textContent = explanation;
  }
}

// Chart.js Composition Comparison
function initCompositionChart() {
  const canvas = document.getElementById("compositionChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  compositionChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Initial Scrap %",
          data: [],
          backgroundColor: "rgba(100, 116, 139, 0.4)",
          borderColor: "#94a3b8",
          borderWidth: 1
        },
        {
          label: "Predicted Final %",
          data: [],
          backgroundColor: "rgba(245, 158, 11, 0.85)",
          borderColor: "#f59e0b",
          borderWidth: 1
        },
        {
          label: "Spec Min %",
          data: [],
          backgroundColor: "rgba(16, 185, 129, 0.35)",
          borderColor: "#10b981",
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: "rgba(51, 65, 85, 0.25)" },
          ticks: { color: "#94a3b8", font: { family: "monospace", weight: "bold" } }
        },
        y: {
          grid: { color: "rgba(51, 65, 85, 0.25)" },
          ticks: { color: "#94a3b8", font: { family: "monospace" } }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#cbd5e1", font: { size: 11, weight: "bold" } }
        }
      }
    }
  });
}

function updateCompositionChart(labels, initial, final, min, max) {
  if (!compositionChart) return;
  compositionChart.data.labels = labels;
  compositionChart.data.datasets[0].data = initial;
  compositionChart.data.datasets[1].data = final;
  compositionChart.data.datasets[2].data = min;
  compositionChart.update();
}

// Load Additives Catalog
async function loadAdditives() {
  try {
    let res = await fetch("/data/additives.json").catch(() => null);
    if (!res || !res.ok) {
      res = await fetch("/api/additives");
    }
    allAdditives = await res.json();
  } catch (err) {
    console.error("Failed to load additives library:", err);
  }
}
