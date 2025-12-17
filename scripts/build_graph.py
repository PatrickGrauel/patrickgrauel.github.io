import yfinance as yf
import pandas as pd
import numpy as np
import json
import os
import time
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# EXPANDED TARGET LIST (Test with these, then swap for full S&P 500)
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "BRK-B", "JNJ", "V", "PG", "KO", "PEP", 
    "COST", "MCD", "NVDA", "TSLA", "XOM", "META", "LLY", "AVGO", "JPM", "UNH",
    "DIS", "NKE", "INTC", "AMD", "NFLX", "ADBE", "CRM", "CMCSA", "VZ", "T",
    "BMW.DE", "SIE.DE", "SAP", "OR.PA", "MC.PA" # Added some EU stocks for industry variety
]

def get_buffett_deep_dive(ticker):
    try:
        stock = yf.Ticker(ticker)
        
        # 1. Fetch Financials (Income, Balance, Cashflow)
        inc = stock.financials.T.sort_index()
        bal = stock.balance_sheet.T.sort_index()
        cash = stock.cashflow.T.sort_index()
        info = stock.info
        
        if inc.empty or bal.empty: return None

        # Helper: Safe Extraction
        def get_val(df, key, default=0):
            try:
                # Try exact match first
                if key in df: return float(df[key].iloc[-1])
                # Try "fuzzy" match or fallback
                return default
            except: return default

        # --- RAW DATA MINING (The "Every Metric" Requirement) ---
        revenue = get_val(inc, 'Total Revenue')
        gross_profit = get_val(inc, 'Gross Profit')
        op_income = get_val(inc, 'Operating Income')
        net_income = get_val(inc, 'Net Income')
        sga = get_val(inc, 'Selling General And Administration')
        rd = get_val(inc, 'Research And Development')
        depreciation = get_val(cash, 'Depreciation And Amortization') # Often better in CF stmt
        interest = abs(get_val(inc, 'Interest Expense'))
        
        cash_equiv = get_val(bal, 'Cash And Cash Equivalents')
        total_debt = get_val(bal, 'Total Debt')
        equity = get_val(bal, 'Stockholders Equity')
        # Treasury Stock is often hidden in Equity as negative value, or explicit field
        treasury_stock = get_val(bal, 'Treasury Stock') 
        
        capex = abs(get_val(cash, 'Capital Expenditure'))
        fcf = info.get('freeCashflow', 0) or (get_val(cash, 'Free Cash Flow', 0))
        shares = info.get('sharesOutstanding', 1)
        
        # --- CALCULATE THE 20 METRICS ---
        
        # 1. Margins
        gross_margin = (gross_profit / revenue) if revenue > 0 else 0
        op_margin = (op_income / revenue) if revenue > 0 else 0
        net_margin = (net_income / revenue) if revenue > 0 else 0
        
        # 2. Efficiency (Buffett Red Flags)
        sga_margin = (sga / gross_profit) if gross_profit > 0 else 0 # <30% is good
        rd_margin = (rd / gross_profit) if gross_profit > 0 else 0 # High R&D threatens moat
        dep_margin = (depreciation / gross_profit) if gross_profit > 0 else 0 # <10% is good
        
        # 3. Solvency
        interest_coverage = (op_income / interest) if interest > 0 else 100
        debt_to_equity = (total_debt / equity) if equity > 0 else 10
        debt_payoff_years = (total_debt / net_income) if net_income > 0 else 10
        
        # 4. Capital Allocation
        capex_ratio = (capex / net_income) if net_income > 0 else 1
        fcf_yield = (fcf / info.get('marketCap', 1)) if info.get('marketCap') else 0
        
        # 5. ROIC (Quality)
        invested_capital = equity + total_debt
        roic = (op_income / invested_capital) if invested_capital > 0 else 0

        # --- SCORING (Aggregated for Radar) ---
        # We still need the scores for the "Pillars"
        score_quality = 0
        if roic > 0.15: score_quality += 50
        if gross_margin > 0.40: score_quality += 50
        
        score_strength = 0
        if interest_coverage > 5: score_strength += 50
        if debt_to_equity < 0.8: score_strength += 50
        
        score_moat = 0
        if sga_margin < 0.30: score_moat += 40
        if dep_margin < 0.10: score_moat += 30
        if net_margin > 0.20: score_moat += 30
        
        score_mgmt = 0
        if capex_ratio < 0.50: score_mgmt += 50
        if treasury_stock != 0: score_mgmt += 50 # Presence of buybacks
        
        score_value = min(fcf_yield * 1000, 100) # 10% yield = 100 score
        
        final_score = (score_quality + score_strength + score_moat + score_mgmt + score_value) / 5

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "buffettScore": round(final_score),
            "owner_earnings": fcf,
            # AGGREGATED PILLARS (For Radar)
            "pillars": {
                "Quality": round(score_quality),
                "Strength": round(score_strength),
                "Moat": round(score_moat),
                "Management": round(score_mgmt),
                "Value": round(score_value)
            },
            # RAW DATA (The "Every Metric" List)
            "raw": {
                "Gross Margin": f"{gross_margin:.1%}",
                "SG&A / GP": f"{sga_margin:.1%}",
                "R&D / GP": f"{rd_margin:.1%}",
                "Depr / GP": f"{dep_margin:.1%}",
                "Net Margin": f"{net_margin:.1%}",
                "Int. Coverage": f"{interest_coverage:.1f}x",
                "Debt/Equity": f"{debt_to_equity:.2f}",
                "Debt Payoff": f"{debt_payoff_years:.1f} yrs",
                "CapEx/Earnings": f"{capex_ratio:.1%}",
                "ROIC": f"{roic:.1%}",
                "FCF Yield": f"{fcf_yield:.1%}",
                "Buybacks": "Yes" if treasury_stock != 0 else "No"
            },
            # NUMERIC METRICS (For sorting/clustering)
            "metrics": {
                "gross_margin": gross_margin,
                "debt_to_equity": debt_to_equity,
                "roic": roic,
                "fcf_yield": fcf_yield
            }
        }

    except Exception as e:
        print(f"⚠️ Error {ticker}: {e}")
        return None

def build_similarity_links(df):
    features = pd.DataFrame(df['pillars'].tolist())
    scaler = MinMaxScaler()
    features_norm = scaler.fit_transform(features)
    sim_matrix = cosine_similarity(features_norm)
    
    links = []
    for i in range(len(df)):
        similar_indices = sim_matrix[i].argsort()[-4:-1]
        for neighbor_idx in similar_indices:
            sim_score = sim_matrix[i][neighbor_idx]
            if sim_score > 0.80: 
                links.append({
                    "source": df.iloc[i]['id'],
                    "target": df.iloc[neighbor_idx]['id'],
                    "similarity": round(float(sim_score), 3)
                })
    return links

if __name__ == "__main__":
    print(f"🚀 Running Buffett Deep Dive...")
    data = []
    for t in tqdm(TICKERS):
        res = get_buffett_deep_dive(t)
        if res: data.append(res)
        time.sleep(0.1)
        
    df = pd.DataFrame(data)
    links = build_similarity_links(df)
    
    output = {"nodes": df.to_dict(orient='records'), "links": links}
    
    os.makedirs('data', exist_ok=True)
    with open('data/graph_data.json', 'w') as f:
        json.dump(output, f, indent=2)
    print("✅ Done.")
