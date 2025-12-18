import pandas as pd
import numpy as np

def safe_div(a, b):
    """Safe division that handles div-by-zero and NaNs"""
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a / b if b != 0 else 0
    
    # If Pandas Series
    result = a / b
    return result.replace([np.inf, -np.inf], 0).fillna(0)

def get_series(df, key, years=5):
    """Extracts a metric for the last N years (Oldest -> Newest)"""
    try:
        # yfinance columns are usually dates descending (Newest -> Oldest)
        # We take top N, then reverse to get chronological order
        return df.loc[key].iloc[:years].iloc[::-1].tolist()
    except KeyError:
        return [0] * years

def compute_buffett_metrics(raw_data):
    """
    Input: Dictionary from fetcher.py
    Output: Enriched dictionary with calculated metrics (TTM and History)
    """
    info = raw_data['info']
    inc = raw_data['income']
    bal = raw_data['balance']
    cf = raw_data['cashflow']
    
    # --- 1. PREPARE LATEST VALUES (TTM/MRQ) ---
    # Try to use TTM from info if available, else use most recent annual
    
    def get_latest(df, key):
        try: return df.loc[key].iloc[0]
        except: return 0

    rev = get_latest(inc, 'Total Revenue')
    net_income = get_latest(inc, 'Net Income')
    op_income = get_latest(inc, 'Operating Income')
    gross_profit = get_latest(inc, 'Gross Profit')
    
    equity = get_latest(bal, 'Stockholders Equity')
    total_debt = get_latest(bal, 'Total Debt')
    cash = get_latest(bal, 'Cash And Cash Equivalents')
    assets = get_latest(bal, 'Total Assets')
    
    fcf = get_latest(cf, 'Free Cash Flow')
    capex = abs(get_latest(cf, 'Capital Expenditure'))
    op_cash = get_latest(cf, 'Operating Cash Flow')
    
    # --- 2. COMPUTE METRICS ---
    m = {}
    
    # A. Pricing Power
    m['gross_margin'] = safe_div(gross_profit, rev) * 100
    m['net_margin'] = safe_div(net_income, rev) * 100
    m['operating_margin'] = safe_div(op_income, rev) * 100
    
    # B. Returns
    m['roe'] = safe_div(net_income, equity) * 100
    m['roa'] = safe_div(net_income, assets) * 100
    # ROIC Approx: NOPAT / (Equity + Debt)
    nopat = op_income * 0.79 # 21% tax assumption
    m['roic'] = safe_div(nopat, (equity + total_debt)) * 100
    
    # C. Financial Health
    m['debt_to_equity'] = safe_div(total_debt, equity)
    interest = get_latest(inc, 'Interest Expense')
    # Use absolute value for interest expense
    m['interest_coverage'] = safe_div(op_income, abs(interest)) if interest else 100
    
    # D. Capital & Efficiency
    m['fcf_margin'] = safe_div(fcf, rev) * 100
    m['capex_intensity'] = safe_div(capex, op_cash) * 100
    m['asset_turnover'] = safe_div(rev, assets)
    
    # E. Valuation
    m['pe_ratio'] = info.get('trailingPE', 0)
    m['fcf_yield'] = safe_div(fcf, info.get('marketCap', 1)) * 100
    
    # --- 3. GROWTH (CAGR) ---
    rev_hist = get_series(inc, 'Total Revenue')
    net_hist = get_series(inc, 'Net Income')
    
    def cagr(series):
        if len(series) < 4 or series[0] <= 0 or series[-1] <= 0: return 0
        return ((series[-1] / series[0]) ** (1/(len(series)-1)) - 1) * 100

    m['revenue_cagr_5y'] = cagr(rev_hist)
    m['net_income_cagr_5y'] = cagr(net_hist)

    # --- 4. SANITIZE ---
    # Ensure no NaNs or Infs leak to JSON
    for k, v in m.items():
        if not np.isfinite(v): m[k] = 0.0
        else: m[k] = float(v)

    # --- 5. HISTORY (For Sparklines) ---
    # Return last 5 years of key metrics
    history = {
        'revenue': [float(x) for x in rev_hist],
        'net_income': [float(x) for x in net_hist],
        'dates': [str(d.year) for d in inc.columns[:5][::-1]]
    }

    return m, history
