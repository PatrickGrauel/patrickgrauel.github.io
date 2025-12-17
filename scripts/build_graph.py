import yfinance as yf
import pandas as pd
import numpy as np
import json
import os
import time
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# EXPANDED TARGET LIST
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "BRK-B", "JNJ", "V", "PG", "KO", "PEP", 
    "COST", "MCD", "NVDA", "TSLA", "XOM", "META", "LLY", "AVGO", "JPM", "UNH",
    "DIS", "NKE", "INTC", "AMD", "NFLX", "ADBE", "CRM", "CMCSA", "VZ", "T",
    "BMW.DE", "SIE.DE", "SAP", "OR.PA", "MC.PA"
]

def get_data(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Fetch Financials
        inc = stock.financials.T.sort_index()
        bal = stock.balance_sheet.T.sort_index()
        cash = stock.cashflow.T.sort_index()
        
        if inc.empty or bal.empty: return None

        # --- DATA MINING ---
        def get_val(df, key, default=0):
            try: return float(df[key].iloc[-1]) if key in df else default
            except: return default

        revenue = get_val(inc, 'Total Revenue')
        gross_profit = get_val(inc, 'Gross Profit')
        op_income = get_val(inc, 'Operating Income')
        net_income = get_val(inc, 'Net Income')
        total_debt = get_val(bal, 'Total Debt')
        equity = get_val(bal, 'Stockholders Equity')
        fcf = get_val(cash, 'Free Cash Flow')
        
        # METRICS (Raw)
        gross_margin = (gross_profit / revenue) if revenue > 0 else 0
        net_margin = (net_income / revenue) if revenue > 0 else 0
        debt_equity = (total_debt / equity) if equity > 0 else 0
        roic = (op_income / (equity + total_debt)) if (equity + total_debt) > 0 else 0
        fcf_yield = (fcf / info.get('marketCap', 1)) if info.get('marketCap') else 0

        # --- SCORING ---
        score = 0
        if gross_margin > 0.40: score += 30
        elif gross_margin > 0.20: score += 15
        if debt_equity < 0.8: score += 30
        if roic > 0.15: score += 20
        if fcf_yield > 0.05: score += 20
        score = min(score, 100)

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "industry": info.get('industry', 'Unknown'),
            "buffettScore": int(score),
            "owner_earnings": fcf,
            # METRICS FOR FRONTEND
            "metrics": {
                "gross_margin": gross_margin,
                "debt_to_equity": debt_equity,
                "roic": roic,
                "fcf_yield": fcf_yield
            },
            # FULL RAW DATA FOR SIDEBAR (Display Strings)
            "raw": {
                "Gross Margin": f"{gross_margin:.1%}",
                "Net Margin": f"{net_margin:.1%}",
                "Debt/Equity": f"{debt_equity:.2f}",
                "ROIC": f"{roic:.1%}",
                "FCF Yield": f"{fcf_yield:.1%}",
                "P/E Ratio": f"{info.get('trailingPE', 0):.1f}",
                "Div Yield": f"{info.get('dividendYield', 0)*100:.1f}%" if info.get('dividendYield') else "0%"
            },
            "pillars": { "Quality": score, "Value": int(fcf_yield*1000), "Moat": int(gross_margin*100) }
        }

    except Exception as e:
        print(f"⚠️ {ticker}: {e}")
        return None

def build_graph(df):
    # 1. CALCULATE INDUSTRY AVERAGES
    sector_avgs = df.groupby('sector')['metrics'].apply(lambda x: pd.DataFrame(x.tolist()).mean()).to_dict('index')

    # 2. INJECT AVERAGES
    def inject_avg(row):
        sec = row['sector']
        if sec in sector_avgs:
            row['sector_avg'] = sector_avgs[sec]
        else:
            row['sector_avg'] = row['metrics']
        return row
    
    df = df.apply(inject_avg, axis=1)

    # 3. BUILD LINKS
    features = pd.DataFrame(df['metrics'].tolist()).fillna(0)
    scaler = MinMaxScaler()
    sim_matrix = cosine_similarity(scaler.fit_transform(features))
    
    links = []
    for i in range(len(df)):
        for idx in sim_matrix[i].argsort()[-4:-1]:
            if sim_matrix[i][idx] > 0.8:
                links.append({
                    "source": df.iloc[i]['id'],
                    "target": df.iloc[idx]['id']
                })
    return links

if __name__ == "__main__":
    print("Fetching data...")
    data = [get_data(t) for t in tqdm(TICKERS) if get_data(t)]
    
    if not data:
        print("❌ No data found.")
        exit(1)
        
    df = pd.DataFrame(data)
    links = build_graph(df)
    
    # --- CRITICAL FIX: ENSURE FOLDER EXISTS & USE CORRECT PATH ---
    os.makedirs('data', exist_ok=True)
    with open('data/graph_data.json', 'w') as f:
        json.dump({"nodes": df.to_dict(orient='records'), "links": links}, f)
        
    print(f"✅ Success! Saved {len(df)} nodes to data/graph_data.json")
