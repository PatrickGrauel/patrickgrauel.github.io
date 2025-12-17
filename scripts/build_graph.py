import yfinance as yf
import pandas as pd
import numpy as np
import json
import os
import time
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# EXPANDED LIST (30 Tickers for testing)
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "BRK-B", "JNJ", "V", "PG", "KO", "PEP", 
    "COST", "MCD", "NVDA", "TSLA", "XOM", "META", "LLY", "AVGO", "JPM", "UNH",
    "DIS", "NKE", "INTC", "AMD", "NFLX", "ADBE", "CRM", "CMCSA", "VZ", "T"
]

def get_buffett_analysis(ticker):
    """
    Extracts deep 'Old School Value' metrics:
    - SG&A Efficiency (<30% is best)
    - CapEx Intensity (<25% is best)
    - Interest Coverage (Interest < 15% of Op Income)
    """
    try:
        stock = yf.Ticker(ticker)
        
        # 1. Fetch Financials
        inc = stock.financials.T.sort_index()     # Income Statement
        bal = stock.balance_sheet.T.sort_index()  # Balance Sheet
        cash = stock.cashflow.T.sort_index()      # Cash Flow
        
        if inc.empty or bal.empty or cash.empty:
            return None

        # Helper to get latest value or 0
        def get_latest(df, key):
            if key in df:
                val = df[key].iloc[-1]
                return 0 if pd.isna(val) else float(val)
            return 0

        # --- EXTRACT METRICS (Latest Year) ---
        revenue = get_latest(inc, 'Total Revenue')
        gross_profit = get_latest(inc, 'Gross Profit')
        op_income = get_latest(inc, 'Operating Income')
        net_income = get_latest(inc, 'Net Income')
        
        sga = get_latest(inc, 'Selling General And Administration')
        interest = get_latest(inc, 'Interest Expense')
        
        # Note: CapEx is usually negative in cashflow, so we flip it
        capex = abs(get_latest(cash, 'Capital Expenditure'))
        
        total_debt = get_latest(bal, 'Total Debt')
        equity = get_latest(bal, 'Stockholders Equity')

        # --- CALCULATE RATIOS ---
        
        # 1. Gross Margin (>40% = Moat)
        gm = (gross_profit / revenue) if revenue > 0 else 0
        
        # 2. SG&A Efficiency (<30% of Gross Profit is fantastic)
        sga_ratio = (sga / gross_profit) if gross_profit > 0 else 1.0
        
        # 3. CapEx Intensity (<25% of Net Income = Moat)
        capex_ratio = (capex / net_income) if net_income > 0 else 1.0
        
        # 4. Interest Coverage (Interest < 15% of Op Income)
        # Some companies report interest as negative numbers, some positive. use abs().
        interest_ratio = (abs(interest) / op_income) if op_income > 0 else 0.5
        
        # 5. Debt Payoff Years (Total Debt / Net Income < 3 years is great)
        debt_payoff_years = (total_debt / net_income) if net_income > 0 else 10.0

        # 6. Debt to Equity (< 0.8 is great)
        de_ratio = (total_debt / equity) if equity > 0 else 10.0

        # --- SCORING (The "Report Card") ---
        score = 0
        
        # Gross Margin
        if gm > 0.40: score += 20
        elif gm > 0.20: score += 10
        
        # SG&A (Lower is better)
        if sga_ratio < 0.30: score += 20
        elif sga_ratio < 0.50: score += 10
        elif sga_ratio > 0.80: score -= 10
        
        # CapEx (Lower is better)
        if capex_ratio < 0.25: score += 20
        elif capex_ratio < 0.50: score += 10
        
        # Interest Coverage
        if interest_ratio < 0.15: score += 10
        
        # Debt Payoff
        if debt_payoff_years < 3.0: score += 15
        elif debt_payoff_years < 5.0: score += 5
        
        # Debt/Equity
        if de_ratio < 0.8: score += 15

        # Final Cap
        score = min(max(round(score), 0), 100)
        
        info = stock.info
        
        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "buffettScore": score,
            "owner_earnings": info.get('freeCashflow', 0) or 0,
            # DETAILED METRICS FOR FRONTEND
            "metrics": {
                "gm": gm,
                "sga_ratio": sga_ratio,
                "capex_ratio": capex_ratio,
                "interest_ratio": interest_ratio,
                "debt_years": debt_payoff_years,
                "de_ratio": de_ratio
            }
        }

    except Exception as e:
        print(f"⚠️ Error fetching {ticker}: {e}")
        return None

def build_similarity_links(df):
    # Cluster by Fundamental DNA (Margins, CapEx, Debt Structure)
    # We flatten the metrics dict into the main df for clustering
    metrics_df = pd.json_normalize(df['metrics'])
    
    # Normalize
    scaler = MinMaxScaler()
    features_norm = scaler.fit_transform(metrics_df.fillna(0))
    sim_matrix = cosine_similarity(features_norm)
    
    links = []
    for i in range(len(df)):
        # Connect to top 3 most similar peers
        similar_indices = sim_matrix[i].argsort()[-4:-1]
        for neighbor_idx in similar_indices:
            sim_score = sim_matrix[i][neighbor_idx]
            if sim_score > 0.75: 
                links.append({
                    "source": df.iloc[i]['id'],
                    "target": df.iloc[neighbor_idx]['id'],
                    "similarity": round(float(sim_score), 3)
                })
    return links

if __name__ == "__main__":
    print(f"🚀 Analyzing {len(TICKERS)} companies using Old School Value rules...")
    
    data = []
    for t in tqdm(TICKERS):
        res = get_buffett_analysis(t)
        if res: 
            data.append(res)
        time.sleep(0.25) # Be nice to API
        
    if not data:
        print("❌ No data fetched.")
        exit(1)

    df = pd.DataFrame(data)
    print("🕸️ Building Network...")
    links = build_similarity_links(df)
    
    output = {
        "nodes": df.to_dict(orient='records'),
        "links": links
    }
    
    os.makedirs('data', exist_ok=True)
    with open('data/graph_data.json', 'w') as f:
        json.dump(output, f, indent=2)
        
    print(f"✅ Data generated: {len(df)} nodes, {len(links)} links.")
