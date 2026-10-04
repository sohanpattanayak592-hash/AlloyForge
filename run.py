"""
run.py: Single-click launcher for AlloyForge Web Dashboard.
Starts the server and automatically opens the user's default web browser.
"""

import sys
import webbrowser
import threading
import time
import uvicorn
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))


def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:8000")


if __name__ == "__main__":
    print("=" * 70)
    print("  AlloyForge - Intelligent Foundry Charge & Alloying Optimizer")
    print("  Serving 351 Steel & Alloy Grades Database")
    print("=" * 70)
    print("\nStarting local server on http://localhost:8000 ...")

    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=False)
