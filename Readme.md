# MoatMap 🏰

A visualized network of the stock market, scored by Warren Buffett's principles (Moats, ROI, Stability).

## Architecture
- **No Backend:** Fully static site hosted on GitHub Pages.
- **Data Pipeline:** Python scripts (`scripts/`) run via GitHub Actions daily to fetch data from Yahoo Finance, calculate metrics, and generate JSON files.
- **Frontend:** Vanilla JS + D3.js. Loads a lightweight `universe.json` first, then lazy-loads heavy ticker data on click.

## How to Run Locally

1. **Install Python Deps:**
   ```bash
   pip install -r requirements.txt
