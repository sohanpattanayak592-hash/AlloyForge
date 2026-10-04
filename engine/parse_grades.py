"""
parse_grades.py: Robust parser for steel and alloy grades tables.
Parses markdown tables into a standardized JSON database with normalized elemental ranges:
- Min bound
- Max bound
- Midpoint target
"""

import json
import re
from pathlib import Path


def parse_range(val_str: str):
    """
    Parse strings like:
    '16.0-18.0' -> (16.0, 18.0, 17.0)
    '≤0.08' or '<=0.08' -> (0.0, 0.08, 0.04)
    '≥0.15' or '>=0.15' -> (0.15, None, 0.20)
    '0.1' -> (0.1, 0.1, 0.1)
    '' or '-' -> (0.0, 0.0, 0.0)
    """
    if not val_str:
        return None
    val = val_str.strip().replace(" ", "").replace("·", ".")
    if not val or val == "—" or val == "-":
        return None

    # Handle <= or ≤
    if val.startswith("≤") or val.startswith("<="):
        num_str = val.lstrip("≤<=")
        try:
            m = float(num_str)
            return {"min": 0.0, "max": m, "target": round(m / 2, 4)}
        except ValueError:
            return None

    # Handle >= or ≥
    if val.startswith("≥") or val.startswith(">="):
        num_str = val.lstrip("≥>=")
        try:
            m = float(num_str)
            # typical target is slightly above min
            return {"min": m, "max": None, "target": round(m * 1.15, 4)}
        except ValueError:
            return None

    # Handle range '16.0-18.0' or '16.0 - 18.0'
    if "-" in val and not val.startswith("-"):
        parts = val.split("-")
        if len(parts) == 2:
            try:
                mn = float(parts[0])
                mx = float(parts[1])
                return {"min": mn, "max": mx, "target": round((mn + mx) / 2, 4)}
            except ValueError:
                pass

    # Handle single nominal value
    try:
        single = float(val)
        return {"min": single, "max": single, "target": single}
    except ValueError:
        return None


def parse_other_elements(other_str: str):
    """
    Parses 'S ≤0.03 · P ≤0.06 · Cu 2.0-4.0' into individual element bounds.
    """
    if not other_str:
        return {}
    res = {}
    tokens = [t.strip() for t in other_str.replace("·", ";").replace(",", ";").split(";")]
    for token in tokens:
        if not token:
            continue
        # Pattern like: [Element Symbol] [Comparison or Range or Number]
        # e.g. "S ≤0.03", "Cu 2.0-4.0", "Nb+Ta 0.15-0.45", "Ti minimum 5xC"
        m = re.match(r"^([A-Za-z\+\/]+)\s*([≤≥<>=]?\s*[\d\.\-]+.*)$", token)
        if m:
            elem = m.group(1).strip()
            val_part = m.group(2).strip()
            parsed = parse_range(val_part)
            if parsed:
                res[elem] = parsed
            else:
                res[elem] = {"raw": val_part}
        else:
            res[token] = {"raw": token}
    return res


def parse_source_file(src_path: Path):
    with open(src_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    grades = []
    current_family = "Unknown"
    headers = []
    in_table = False

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith("## "):
            current_family = line.lstrip("## ").strip()
            in_table = False
            continue

        if "|" in line:
            cols = [c.strip() for c in line.split("|")[1:-1]]
            if not cols:
                continue

            # Check if this is a header row
            if "Grade" in cols:
                headers = cols
                in_table = True
                continue

            # Check if separator row
            if all(set(c) <= set("-: ") for c in cols if c):
                continue

            if in_table and headers:
                row_dict = {}
                for h, val in zip(headers, cols):
                    row_dict[h] = val

                grade_name = row_dict.get("Grade", "").strip()
                if not grade_name:
                    continue

                equivalents = row_dict.get("Equivalents", "").strip()
                notes = row_dict.get("Notes", "").strip()
                other_raw = row_dict.get("Other elements", "").strip()

                elements = {}

                # Map column header to element symbol
                for col_name, val in row_dict.items():
                    if "%" in col_name:
                        elem_sym = col_name.replace("%", "").strip()
                        elem_range = parse_range(val)
                        if elem_range:
                            elements[elem_sym] = elem_range

                # Merge other elements
                other_parsed = parse_other_elements(other_raw)
                for k, v in other_parsed.items():
                    if "min" in v:
                        elements[k] = v

                grade_entry = {
                    "id": f"{re.sub(r'[^a-zA-Z0-9]', '_', grade_name).lower()}_{current_family.lower()[:3]}",
                    "grade": grade_name,
                    "family": current_family,
                    "equivalents": equivalents,
                    "elements": elements,
                    "other_raw": other_raw,
                    "notes": notes,
                }
                grades.append(grade_entry)

    return grades


if __name__ == "__main__":
    src = Path(__file__).resolve().parent.parent / "data" / "raw_grades_source.md"
    out = Path(__file__).resolve().parent.parent / "data" / "grades.json"

    parsed = parse_source_file(src)
    print(f"Parsed {len(parsed)} grades across all families.")

    with open(out, "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2, ensure_ascii=False)

    print(f"Successfully saved structured database to {out}")
