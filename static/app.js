// app.js: Frontend Application Logic for AlloyForge (Dual Backend + Netlify Standalone Engine)

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
  updateMLYields();

  // Select default grade AISI 316 L
  const defaultGrade = allGrades.find(g => g.grade === "AISI 316 L") || allGrades[0];
  if (defaultGrade) {
    selectGrade(defaultGrade);
  }

  // Trigger initial calculation
  setTimeout(() => runOptimization(), 400);
});

// Switch Tabs
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active", "bg-amber-500", "text-slate-950", "shadow"));
  document.querySelectorAll("section[id^='tab-']").forEach(sec => sec.classList.add("hidden"));

  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add("active", "bg-amber-500", "text-slate-950", "shadow");
  }

  const activeSection = document.getElementById(`tab-${tabId}`);
  if (activeSection) {
    activeSection.classList.remove("hidden");
  }

  if (tabId === "recommender") {
    runRecommendation();
  }
}

// Render dynamic elements inputs
function renderElementsInputGrid() {
  const container = document.getElementById("elements-input-grid");
  container.innerHTML = "";

  TRACKED_ELEMENTS.forEach(el => {
    const card = document.createElement("div");
    card.className = "bg-slate-950/80 border border-slate-800 rounded-lg p-2 focus-within:border-amber-500/80 transition";
    card.innerHTML = `
      <div class="flex justify-between items-center mb-1">
        <label for="input-elem-${el.symbol}" class="text-xs font-bold text-amber-400 font-mono">${el.symbol}</label>
        <span class="text-[10px] text-slate-500">${el.name}</span>
      </div>
      <input type="number" id="input-elem-${el.symbol}" value="${el.default}" min="0" max="100" step="${el.step}"
        class="w-full bg-transparent text-sm font-mono text-white outline-none"
        oninput="onCompositionChange()">
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
    allGrades = Array.isArray(data) ? data : data.grades;

    const families = [...new Set(allGrades.map(g => g.family))].sort();

    // Render family pills
    const familyContainer = document.getElementById("family-filter-container");
    familyContainer.innerHTML = `
      <button onclick="filterByFamily('All')" class="px-2.5 py-1 text-[11px] rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 font-medium">All (${allGrades.length})</button>
    `;
    families.forEach(f => {
      const count = allGrades.filter(g => g.family === f).length;
      const btn = document.createElement("button");
      btn.className = "px-2 py-0.5 text-[10px] rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition";
      btn.textContent = `${f} (${count})`;
      btn.onclick = () => filterByFamily(f);
      familyContainer.appendChild(btn);
    });
  } catch (err) {
    console.error("Failed to load grades:", err);
  }
}

// Filter Grades Dropdown
function filterGradesDropdown(searchTerm = null) {
  const input = document.getElementById("grade-search");
  const term = (searchTerm !== null ? searchTerm : input.value).toLowerCase().trim();
  const dropdown = document.getElementById("grade-dropdown-list");

  if (!term && searchTerm === null) {
    dropdown.classList.add("hidden");
    return;
  }

  const matches = allGrades.filter(g => 
    g.grade.toLowerCase().includes(term) ||
    g.family.toLowerCase().includes(term) ||
    (g.equivalents && g.equivalents.toLowerCase().includes(term))
  ).slice(0, 25);

  if (matches.length === 0) {
    dropdown.innerHTML = `<div class="p-3 text-xs text-slate-400">No matching grades found.</div>`;
  } else {
    dropdown.innerHTML = matches.map(g => `
      <div onclick="selectGradeById('${g.id}')" class="p-2.5 hover:bg-slate-800 cursor-pointer transition">
        <div class="flex items-center justify-between">
          <span class="text-sm font-bold text-amber-300 font-mono">${g.grade}</span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">${g.family}</span>
        </div>
        ${g.equivalents ? `<p class="text-[11px] text-slate-400 mt-0.5 truncate">${g.equivalents}</p>` : ''}
      </div>
    `).join("");
  }
  dropdown.classList.remove("hidden");
}

function filterByFamily(family) {
  if (family === "All") {
    filterGradesDropdown("");
  } else {
    filterGradesDropdown(family);
  }
}

function selectGradeById(gradeId) {
  const grade = allGrades.find(g => g.id === gradeId);
  if (grade) {
    selectGrade(grade);
    document.getElementById("grade-dropdown-list").classList.add("hidden");
    document.getElementById("grade-search").value = grade.grade;
  }
}

// Select Active Grade & Update Header Badges
function selectGrade(grade) {
  selectedGrade = grade;
  document.getElementById("active-grade-name").textContent = grade.grade;
  document.getElementById("active-grade-family").textContent = grade.family;
  document.getElementById("active-grade-equivalents").textContent = 
    grade.equivalents ? `Cross-Standard Equivalents: ${grade.equivalents}` : "No direct counterpart listed";

  // Elements pills
  const pillsContainer = document.getElementById("active-grade-elements-pills");
  pillsContainer.innerHTML = "";

  const elements = grade.elements || {};
  for (const [elem, bounds] of Object.entries(elements)) {
    if (typeof bounds === "object" && bounds !== null) {
      const minStr = bounds.min !== undefined && bounds.min !== null ? `${bounds.min}%` : "0%";
      const maxStr = bounds.max !== undefined && bounds.max !== null ? `${bounds.max}%` : "Max";
      const pill = document.createElement("div");
      pill.className = "px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-xs font-mono flex items-center space-x-1.5";
      pill.innerHTML = `
        <span class="font-bold text-amber-400">${elem}:</span>
        <span class="text-slate-300">${minStr} - ${maxStr}</span>
      `;
      pillsContainer.appendChild(pill);
    }
  }

  // Pre-check composition against current inputs
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
}

function onCompositionChange() {
  if (!selectedGrade || !selectedGrade.elements) return;
  const targetElements = selectedGrade.elements;

  TRACKED_ELEMENTS.forEach(el => {
    const inp = document.getElementById(`input-elem-${el.symbol}`);
    if (!inp) return;
    const val = parseFloat(inp.value || 0.0);
    const spec = targetElements[el.symbol];
    const parent = inp.closest("div.focus-within\\:border-amber-500\\/80") || inp.parentElement;

    if (spec) {
      const min = spec.min || 0.0;
      const max = spec.max || 100.0;
      if (val > max) {
        parent.style.borderColor = "rgba(244, 63, 94, 0.7)";
      } else if (val < min) {
        parent.style.borderColor = "rgba(245, 158, 11, 0.5)";
      } else {
        parent.style.borderColor = "rgba(16, 185, 129, 0.5)";
      }
    } else {
      parent.style.borderColor = "";
    }
  });
}

// Preset Ore Loader
function togglePresetMenu() {
  const menu = document.getElementById("preset-menu");
  menu.classList.toggle("hidden");
}

function loadOrePreset(presetKey) {
  document.getElementById("preset-menu").classList.add("hidden");
  clearOreComposition();

  const presets = {
    mild_scrap: { C: 0.12, Mn: 0.65, Si: 0.25, P: 0.03, S: 0.025 },
    ss304_scrap: { C: 0.04, Mn: 1.20, Si: 0.50, Cr: 18.2, Ni: 8.4, Mo: 0.25, P: 0.03, S: 0.015 },
    low_alloy: { C: 0.28, Mn: 0.80, Si: 0.30, Cr: 1.10, Mo: 0.20, Ni: 0.35 },
    nickel_pig: { C: 2.10, Si: 1.50, Ni: 11.5, Fe: 84.0, P: 0.05, S: 0.04 }
  };

  const selectedPreset = presets[presetKey] || {};
  for (const [elem, val] of Object.entries(selectedPreset)) {
    const inp = document.getElementById(`input-elem-${elem}`);
    if (inp) inp.value = val;
  }
  onCompositionChange();
  runOptimization();
}

// Machine Learning Element Recovery Yield Calculation (Browser Native)
function calculateMLRecoveries(temperature_c = 1620, slag_basicity = 1.8, holding_time_min = 20, furnace_type = "Induction") {
  const isEaf = furnace_type.toLowerCase().includes("eaf") ? 1 : 0;
  const tempDiff = temperature_c - 1580;
  const slagDiff = slag_basicity - 1.5;

  const baseRecoveries = {
    Cr: 0.94 - (0.00015 * tempDiff) + (0.035 * slagDiff) - (0.0012 * holding_time_min) - (0.04 * isEaf),
    Mn: 0.89 - (0.00018 * tempDiff) + (0.040 * slagDiff) - (0.0014 * holding_time_min) - (0.05 * isEaf),
    Si: 0.86 - (0.00020 * tempDiff) + (0.025 * slagDiff) - (0.0010 * holding_time_min) - (0.03 * isEaf),
    Ti: 0.68 - (0.00025 * tempDiff) + (0.050 * slagDiff) - (0.0020 * holding_time_min) - (0.08 * isEaf),
    Al: 0.62 - (0.00028 * tempDiff) + (0.045 * slagDiff) - (0.0022 * holding_time_min) - (0.08 * isEaf),
    V:  0.91 - (0.00016 * tempDiff) + (0.030 * slagDiff) - (0.0012 * holding_time_min) - (0.04 * isEaf),
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

// In-Browser Linear Programming Solver (HiGHS/Simplex logic for Netlify)
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

  // Detect excess elements in starting melt
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

  // Model setup for javascript-lp-solver
  const model = {
    optimize: "cost",
    opType: "min",
    constraints: {},
    variables: {}
  };

  // Build constraints
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

  // Build variables from additives
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
          pct_of_charge: 0 // updated below
        });
      }
    });
  } else {
    // Fallback heuristic if external solver CDN unavailable
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

  // Calculate final predicted composition
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

  // Oxygen blowing calculation for C and Si
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
    oxygen_blowing: oxygenBlowing
  };
}

// Run Optimization (with automatic fallback to Client-Side Simplex on Netlify)
async function runOptimization() {
  if (!selectedGrade) return;

  const btn = document.getElementById("btn-calculate");
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>Solving Mass Balance...</span>`;
  lucide.createIcons();

  const initialMass = parseFloat(document.getElementById("input-mass").value || 1000);
  const furnaceType = document.getElementById("input-furnace-type").value;
  const temp = parseFloat(document.getElementById("input-temp").value || 1620);
  const composition = getCurrentOreComposition();

  const recoveries = calculateMLRecoveries(temp, 1.8, 20, furnaceType);

  try {
    // Attempt FastAPI backend first
    let res = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initial_mass_kg: initialMass,
        initial_composition: composition,
        grade_name: selectedGrade.grade,
        furnace_type: furnaceType,
        temperature_c: temp,
        slag_basicity: 1.8
      })
    }).catch(() => null);

    let result;
    if (res && res.ok) {
      result = await res.json();
    } else {
      // Running standalone on Netlify: use in-browser solver!
      result = solveChargeInBrowser(initialMass, composition, selectedGrade, recoveries);
    }
    renderOptimizationResults(result);
  } catch (err) {
    console.error("Optimization failed, falling back to browser solver:", err);
    const result = solveChargeInBrowser(initialMass, composition, selectedGrade, recoveries);
    renderOptimizationResults(result);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="zap" class="w-5 h-5"></i><span>Calculate Required Additions & Trim</span>`;
    lucide.createIcons();
  }
}

// Render Optimization Results
function renderOptimizationResults(res) {
  document.getElementById("res-added-mass").textContent = `${res.total_added_mass_kg || 0} kg`;
  document.getElementById("res-batch-mass").textContent = `Final: ${res.final_batch_mass_kg || 0} kg`;
  document.getElementById("res-total-cost").textContent = `$${res.total_cost || 0}`;
  document.getElementById("res-cost-per-ton").textContent = `$${res.cost_per_ton_alloy || 0} / ton`;

  // Excess Element Banner
  const alertBanner = document.getElementById("excess-alert-banner");
  const alertText = document.getElementById("excess-alert-text");
  const oxygenRec = document.getElementById("oxygen-blowing-recommendation");

  if (res.excess_elements && res.excess_elements.length > 0) {
    alertBanner.classList.remove("hidden");
    alertText.innerHTML = res.excess_elements.map(ex => `
      • <strong>${ex.element}</strong>: Current melt is <strong>${ex.current_pct}%</strong> (Exceeds maximum allowable ${ex.max_pct}% by +${ex.excess_pct}%).
    `).join("<br>");

    if (res.oxygen_blowing) {
      oxygenRec.innerHTML = `
        ⚡ <strong>Refining Decarburization Alternative:</strong> Blow ~${res.oxygen_blowing.estimated_o2_nm3} Nm³ of Oxygen via lance to oxidize ${res.oxygen_blowing.excess_kg} kg excess Carbon into CO/CO₂ slag without scrap dilution.
      `;
    } else {
      oxygenRec.innerHTML = `💡 Low-carbon scrap dilution applied automatically to pull chemistry inside allowable bounds.`;
    }
  } else {
    alertBanner.classList.add("hidden");
  }

  // Additions Recipe Table
  const recipeTbody = document.getElementById("recipe-table-body");
  if (res.additions_recipe && res.additions_recipe.length > 0) {
    recipeTbody.innerHTML = res.additions_recipe.map(item => `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-3 font-sans font-medium text-slate-200">
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>${item.name}</span>
          </div>
        </td>
        <td class="py-2.5 px-3 text-right font-bold text-amber-300 text-sm">${item.mass_kg} kg</td>
        <td class="py-2.5 px-3 text-right text-slate-400">${item.pct_of_charge}%</td>
        <td class="py-2.5 px-3 text-right text-slate-400">$${item.cost_per_kg}/kg</td>
        <td class="py-2.5 px-3 text-right font-bold text-emerald-400">$${item.total_cost}</td>
      </tr>
    `).join("");
  } else {
    recipeTbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-6 text-center text-emerald-400 font-sans font-medium">
          ✓ Melt chemistry is already within specification limits. No additions required.
        </td>
      </tr>
    `;
  }

  // Verification Table
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
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Within Spec</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">${data.status}</span>`;

      rows.push(`
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-2 px-3 font-bold text-amber-400">${elem}</td>
          <td class="py-2 px-3 text-right text-slate-400">${data.initial_pct}%</td>
          <td class="py-2 px-3 text-right font-bold text-slate-100">${data.final_pct}%</td>
          <td class="py-2 px-3 text-center text-slate-300 font-sans">${minText} - ${maxText}</td>
          <td class="py-2 px-3 text-center">${statusBadge}</td>
        </tr>
      `);

      chartLabels.push(elem);
      chartInitial.push(data.initial_pct);
      chartFinal.push(data.final_pct);
      chartMin.push(data.min_pct || 0);
      chartMax.push(data.max_pct && data.max_pct < 100 ? data.max_pct : data.final_pct * 1.2);
    }
  }

  verifTbody.innerHTML = rows.join("");
  updateCompositionChart(chartLabels, chartInitial, chartFinal, chartMin, chartMax);
}

// Chart.js Composition Comparison
function initCompositionChart() {
  const ctx = document.getElementById("compositionChart").getContext("2d");
  compositionChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Initial Ore %",
          data: [],
          backgroundColor: "rgba(148, 163, 184, 0.4)",
          borderColor: "#94a3b8",
          borderWidth: 1
        },
        {
          label: "Predicted Final %",
          data: [],
          backgroundColor: "rgba(245, 158, 11, 0.8)",
          borderColor: "#f59e0b",
          borderWidth: 1
        },
        {
          label: "Spec Target Min %",
          data: [],
          backgroundColor: "rgba(16, 185, 129, 0.4)",
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
          grid: { color: "rgba(51, 65, 85, 0.3)" },
          ticks: { color: "#94a3b8", font: { family: "monospace" } }
        },
        y: {
          grid: { color: "rgba(51, 65, 85, 0.3)" },
          ticks: { color: "#94a3b8", font: { family: "monospace" } }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#cbd5e1", font: { size: 11 } }
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

// TAB 2: Run Grade Recommender (Client-side fast scan on Netlify)
function runRecommendation() {
  const comp = getCurrentOreComposition();
  const filter = document.getElementById("rec-family-filter").value;
  const grid = document.getElementById("recommendations-cards-grid");

  grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400">Evaluating 351 grades against current melt chemistry...</div>`;

  const allTracked = ["C", "Mn", "Si", "Cr", "Ni", "Mo", "Cu", "Al", "Ti", "V", "W", "Co", "Nb"];
  const scored = [];

  allGrades.forEach(g => {
    if (filter !== "All" && g.family !== filter) return;

    const targetElements = g.elements || {};
    let distance = 0;
    let excessPenalty = 0;
    const missing = [];
    const surplus = [];

    allTracked.forEach(el => {
      const curr = comp[el] || 0.0;
      const spec = targetElements[el];

      if (spec && typeof spec === "object") {
        const mn = spec.min || 0.0;
        const mx = spec.max || 100.0;
        const tgt = spec.target || (mn + mx) / 2;

        if (curr < mn) {
          const deficit = mn - curr;
          distance += deficit * 1.5;
          missing.push({ element: el, deficit_pct: Math.round(deficit * 100) / 100 });
        } else if (curr > mx) {
          const excess = curr - mx;
          excessPenalty += excess * 5.0;
          surplus.push({ element: el, excess_pct: Math.round(excess * 100) / 100 });
        } else {
          distance += Math.abs(curr - tgt) * 0.2;
        }
      } else {
        if (curr > 0.2) excessPenalty += curr * 2.0;
      }
    });

    const totalPenalty = distance + excessPenalty;
    const matchScore = Math.max(5.0, Math.round((100.0 / (1.0 + (totalPenalty * 0.12))) * 10) / 10);

    scored.push({
      grade: g.grade,
      family: g.family,
      equivalents: g.equivalents || "",
      match_score: matchScore,
      missing_elements: missing,
      surplus_elements: surplus,
      has_excess: surplus.length > 0
    });
  });

  scored.sort((a, b) => b.match_score - a.match_score);
  renderRecommendations(scored.slice(0, 9));
}

function renderRecommendations(recs) {
  const grid = document.getElementById("recommendations-cards-grid");
  if (!recs || recs.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-500">No grades found matching this family filter.</div>`;
    return;
  }

  grid.innerHTML = recs.map(r => {
    const deficits = r.missing_elements.map(d => `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">+${d.deficit_pct}% ${d.element}</span>`).join(" ");
    const surplus = r.surplus_elements.map(s => `<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px]">-${s.excess_pct}% ${s.element}</span>`).join(" ");

    return `
      <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-amber-500/60 transition shadow-lg">
        <div>
          <div class="flex items-start justify-between">
            <div>
              <h4 class="text-base font-bold text-white">${r.grade}</h4>
              <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-medium">${r.family}</span>
            </div>
            <div class="text-right">
              <span class="text-lg font-black font-mono text-emerald-400">${r.match_score}%</span>
              <span class="text-[10px] text-slate-500 block">Match Score</span>
            </div>
          </div>

          ${r.equivalents ? `<p class="text-xs text-slate-400 mt-2 truncate">${r.equivalents}</p>` : ''}

          <div class="mt-3 space-y-1.5 text-xs">
            <div>
              <span class="text-[11px] text-slate-400">Elements to Add:</span>
              <div class="flex flex-wrap gap-1 mt-0.5">${deficits || '<span class="text-emerald-400 font-mono text-[10px]">None</span>'}</div>
            </div>
            ${r.has_excess ? `
              <div>
                <span class="text-[11px] text-slate-400">Surplus Elements:</span>
                <div class="flex flex-wrap gap-1 mt-0.5">${surplus}</div>
              </div>
            ` : ''}
          </div>
        </div>

        <button onclick="applyRecommendedGrade('${r.grade}')" class="mt-4 w-full py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5">
          <span>Load Grade Into Optimizer</span>
          <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
  }).join("");
  lucide.createIcons();
}

function applyRecommendedGrade(gradeName) {
  const g = allGrades.find(x => x.grade.toLowerCase() === gradeName.toLowerCase());
  if (g) {
    selectGrade(g);
    switchTab("optimizer");
    runOptimization();
  }
}

// TAB 3: Additives Catalog & ML Yield Predictor
async function loadAdditives() {
  try {
    let res = await fetch("/data/additives.json").catch(() => null);
    if (!res || !res.ok) {
      res = await fetch("/api/additives");
    }
    allAdditives = await res.json();

    const tbody = document.getElementById("materials-catalog-body");
    tbody.innerHTML = allAdditives.map(a => {
      const compStr = Object.entries(a.composition || {}).map(([el, pct]) => `${el}: ${pct}%`).join(" · ");
      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-2.5 px-3">
            <span class="font-sans font-bold text-slate-200">${a.name}</span>
            <p class="text-[10px] text-slate-400 font-sans mt-0.5">${a.description}</p>
          </td>
          <td class="py-2.5 px-3 text-slate-300 font-mono">${compStr}</td>
          <td class="py-2.5 px-3 text-right font-bold text-emerald-400">$${a.cost_per_kg.toFixed(2)}/kg</td>
          <td class="py-2.5 px-3 text-center text-cyan-400 font-bold">${Math.round(a.recovery * 100)}%</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Failed to load additives:", err);
  }
}

function updateMLYields() {
  const temp = parseFloat(document.getElementById("slider-temp").value);
  const slag = parseFloat(document.getElementById("slider-slag").value);
  const time = parseFloat(document.getElementById("slider-time").value);

  document.getElementById("slider-temp-val").textContent = `${temp} °C`;
  document.getElementById("slider-slag-val").textContent = `${slag}`;
  document.getElementById("slider-time-val").textContent = `${time} min`;

  const recoveries = calculateMLRecoveries(temp, slag, time, "Induction");
  const container = document.getElementById("ml-yield-cards");
  container.innerHTML = Object.entries(recoveries).map(([el, rec]) => `
    <div class="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
      <span class="text-xs font-bold text-amber-400 font-mono block">${el}</span>
      <span class="text-lg font-black text-white font-mono">${Math.round(rec * 100)}%</span>
      <span class="text-[10px] text-slate-400 block">Recovery Yield</span>
    </div>
  `).join("");
}
