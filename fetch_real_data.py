import yfinance as yf
import json
import os
import pandas as pd
import numpy as np
from datetime import datetime
import time
- name: Test Yahoo Finance Access
  run: |
    python -c "import yfinance as yf; stock = yf.Ticker('AAPL'); print(stock.info.get('marketCap', 'NO DATA'))"
# Predefined ticker lists (no Wikipedia scraping needed)
SP500_TOP = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "BRK-B", "LLY", "AVGO", "TSLA",
    "JPM", "V", "UNH", "XOM", "WMT", "MA", "JNJ", "PG", "ORCL", "HD",
    "COST", "NFLX", "BAC", "ABBV", "CRM", "CVX", "MRK", "KO", "PEP", "AMD",
    "ADBE", "TMO", "ACN", "MCD", "CSCO", "ABT", "DIS", "WFC", "DHR", "VZ",
    "INTC", "CMCSA", "QCOM", "TXN", "PM", "CAT", "NEE", "IBM", "AMGN", "UNP",
    "HON", "LOW", "RTX", "NKE", "GE", "SPGI", "BA", "LMT", "SBUX", "T",
    "BLK", "AXP", "BKNG", "DE", "PLD", "SYK", "GILD", "MDLZ", "ADI", "MMC",
    "ADP", "VRTX", "CI", "AMT", "REGN", "ISRG", "TJX", "PFE", "CVS", "ZTS"
]

DAX_STOCKS = [
    "SAP", "SIE.DE", "ALV.DE", "DTE.DE", "BMW.DE", "VOW3.DE", "AIR.DE", "BAS.DE", 
    "MUV2.DE", "ADS.DE", "1COV.DE", "DAI.DE", "DB1.DE", "HEI.DE", "RWE.DE"
]

def calculate_buffett_metrics(stock, symbol):
    """Calculate comprehensive Buffett metrics from financial statements"""
    try:
        info = stock.info
        
        # Get financial statements with error handling
        try:
            income_stmt = stock.financials
            balance_sheet = stock.balance_sheet
            cash_flow = stock.cashflow
        except:
            return None
        
        if income_stmt.empty or balance_sheet.empty:
            return None
        
        metrics = {}
        historical = {
            'gross_margin': [],
            'net_margin': [],
            'roe': [],
            'debt_to_equity': []
        }
        
        # Process up to 5 years of historical data
        years = min(5, len(income_stmt.columns))
        
        for i in range(years):
            try:
                # Income statement items
                revenue = income_stmt.iloc[:, i].get('Total Revenue', 0)
                if revenue == 0:
                    revenue = income_stmt.iloc[:, i].get('Total Revenues', 0)
                
                gross_profit = income_stmt.iloc[:, i].get('Gross Profit', 0)
                net_income = income_stmt.iloc[:, i].get('Net Income', 0)
                operating_income = income_stmt.iloc[:, i].get('Operating Income', 0)
                
                # Balance sheet items
                total_assets = balance_sheet.iloc[:, i].get('Total Assets', 1)
                total_equity = balance_sheet.iloc[:, i].get('Stockholders Equity', 1)
                if total_equity == 0:
                    total_equity = balance_sheet.iloc[:, i].get('Total Stockholder Equity', 1)
                
                total_debt = balance_sheet.iloc[:, i].get('Total Debt', 0)
                if total_debt == 0:
                    total_debt = balance_sheet.iloc[:, i].get('Long Term Debt', 0)
                
                # Calculate ratios for historical tracking
                if revenue > 0:
                    gm = (gross_profit / revenue) * 100
                    nm = (net_income / revenue) * 100
                    if -100 < gm < 100:  # Sanity check
                        historical['gross_margin'].append(round(gm, 1))
                    if -100 < nm < 100:
                        historical['net_margin'].append(round(nm, 1))
                
                if total_equity > 0:
                    roe = (net_income / total_equity) * 100
                    if -200 < roe < 500:  # Sanity check
                        historical['roe'].append(round(roe, 1))
                
                if total_equity > 0:
                    de = total_debt / total_equity
                    if de >= 0 and de < 10:  # Sanity check
                        historical['debt_to_equity'].append(round(de, 2))
                    
            except Exception as e:
                continue
        
        # Current year metrics (most recent = index 0)
        if len(income_stmt.columns) == 0:
            return None
            
        # Get most recent data
        revenue = income_stmt.iloc[:, 0].get('Total Revenue', 0)
        if revenue == 0:
            revenue = income_stmt.iloc[:, 0].get('Total Revenues', 0)
            
        gross_profit = income_stmt.iloc[:, 0].get('Gross Profit', 0)
        net_income = income_stmt.iloc[:, 0].get('Net Income', 0)
        operating_income = income_stmt.iloc[:, 0].get('Operating Income', 0)
        sga = income_stmt.iloc[:, 0].get('Selling General Administrative', 0)
        if sga == 0:
            sga = income_stmt.iloc[:, 0].get('Selling And Marketing Expenses', 0)
        
        total_assets = balance_sheet.iloc[:, 0].get('Total Assets', 1)
        total_equity = balance_sheet.iloc[:, 0].get('Stockholders Equity', 1)
        if total_equity == 0:
            total_equity = balance_sheet.iloc[:, 0].get('Total Stockholder Equity', 1)
            
        total_debt = balance_sheet.iloc[:, 0].get('Total Debt', 0)
        if total_debt == 0:
            total_debt = balance_sheet.iloc[:, 0].get('Long Term Debt', 0)
            
        current_assets = balance_sheet.iloc[:, 0].get('Current Assets', 0)
        current_liabilities = balance_sheet.iloc[:, 0].get('Current Liabilities', 1)
        retained_earnings = balance_sheet.iloc[:, 0].get('Retained Earnings', 0)
        
        free_cash_flow = cash_flow.iloc[:, 0].get('Free Cash Flow', 0)
        capex = abs(cash_flow.iloc[:, 0].get('Capital Expenditure', 0))
        if capex == 0:
            capex = abs(cash_flow.iloc[:, 0].get('Capital Expenditures', 0))
        
        # Calculate all metrics with safety checks
        metrics['gross_margin'] = round((gross_profit / revenue * 100) if revenue > 0 else 0, 1)
        metrics['net_margin'] = round((net_income / revenue * 100) if revenue > 0 else 0, 1)
        metrics['operating_margin'] = round((operating_income / revenue * 100) if revenue > 0 else 0, 1)
        metrics['sga_ratio'] = round((sga / gross_profit * 100) if gross_profit > 0 else 0, 1)
        
        metrics['roe'] = round((net_income / total_equity * 100) if total_equity > 0 else 0, 1)
        metrics['roa'] = round((net_income / total_assets * 100) if total_assets > 0 else 0, 1)
        metrics['roic'] = round((operating_income / (total_equity + total_debt) * 100) if (total_equity + total_debt) > 0 else 0, 1)
        
        metrics['debt_to_equity'] = round((total_debt / total_equity) if total_equity > 0 else 0, 2)
        metrics['interest_coverage'] = info.get('interestCoverage', 0) or 0
        metrics['current_ratio'] = round((current_assets / current_liabilities) if current_liabilities > 0 else 0, 2)
        
        metrics['fcf_margin'] = round((free_cash_flow / revenue * 100) if revenue > 0 else 0, 1)
        metrics['capex_ratio'] = round((capex / revenue * 100) if revenue > 0 else 0, 1)
        metrics['retained_earnings'] = retained_earnings
        
        metrics['pe_ratio'] = info.get('trailingPE', 0) or 0
        metrics['pb_ratio'] = info.get('priceToBook', 0) or 0
        
        # Calculate Buffett Score
        score = 0
        
        # Margins (30 points)
        if metrics['gross_margin'] > 40: score += 10
        if metrics['net_margin'] > 15: score += 10
        if metrics['sga_ratio'] > 0 and metrics['sga_ratio'] < 30: score += 10
        
        # Returns (25 points)
        if metrics['roe'] > 15: score += 10
        if metrics['roic'] > 12: score += 10
        if metrics['roa'] > 7: score += 5
        
        # Debt (20 points)
        if metrics['debt_to_equity'] < 0.5: 
            score += 15
        elif metrics['debt_to_equity'] < 1.0: 
            score += 10
        if metrics['current_ratio'] > 1.5: score += 5
        
        # Cash Flow (15 points)
        if metrics['fcf_margin'] > 15: score += 10
        if metrics['capex_ratio'] > 0 and metrics['capex_ratio'] < 5: score += 5
        
        # Consistency (10 points)
        if len(historical['gross_margin']) >= 3:
            gm_stable = max(historical['gross_margin']) - min(historical['gross_margin']) < 10
            if gm_stable: score += 5
        if len(historical['roe']) >= 3:
            roe_positive = all(x > 0 for x in historical['roe'])
            if roe_positive: score += 5
        
        metrics['buffett_score'] = min(score, 100)
        
        return {
            'metrics': metrics,
            'historical': historical
        }
        
    except Exception as e:
        print(f"  Error calculating metrics for {symbol}: {str(e)[:60]}")
        return None

# Main execution
print("=" * 60)
print("BUFFETT STOCK ANALYZER - Real Yahoo Finance Data")
print("=" * 60)

print("\n[1/4] Building Watchlist...")
# Use hardcoded lists (configurable)
tickers = SP500_TOP[:50] + DAX_STOCKS[:10]  # Start with 60 stocks
print(f"Targeting {len(tickers)} stocks from S&P 500 and DAX")

nodes = []
price_data = {}
failed_tickers = []

print("\n[2/4] Fetching Financial Data from Yahoo Finance...")
print("This may take 5-10 minutes for real-time data...\n")

for i, symbol in enumerate(tickers):
    try:
        # Rate limiting to avoid API throttling
        if i > 0 and i % 10 == 0:
            time.sleep(2)
        
        stock = yf.Ticker(symbol)
        info = stock.info
        
        # Skip if no market cap (delisted or invalid)
        if 'marketCap' not in info or info['marketCap'] == 0:
            failed_tickers.append(symbol)
            continue
        
        result = calculate_buffett_metrics(stock, symbol)
        if not result:
            failed_tickers.append(symbol)
            continue
        
        node = {
            "id": symbol,
            "name": info.get('shortName', symbol),
            "sector": info.get("sector", "Unknown"),
            "industry": info.get("industry", "Unknown"),
            "marketCap": info.get("marketCap", 0),
            "buffettScore": result['metrics']['buffett_score'],
            "metrics": result['metrics'],
            "historical": result['historical']
        }
        
        nodes.append(node)
        
        # Fetch 5-year price history for correlations
        try:
            hist = stock.history(period="5y")
            if not hist.empty and len(hist) > 100:  # Need enough data points
                price_data[symbol] = hist["Close"]
        except:
            pass
        
        if (i + 1) % 10 == 0 or i == len(tickers) - 1:
            print(f"  Progress: {i+1}/{len(tickers)} processed | {len(nodes)} successful")
            
    except Exception as e:
        print(f"  Skipping {symbol}: {str(e)[:50]}")
        failed_tickers.append(symbol)
        continue

print(f"\n  ✓ Successfully fetched {len(nodes)} stocks")
print(f"  ✗ Failed: {len(failed_tickers)} stocks")

if len(nodes) == 0:
    print("\n✗ ERROR: No data could be fetched. Please check:")
    print("  1. Internet connection")
    print("  2. Yahoo Finance API status")
    print("  3. Ticker symbols are valid")
    exit(1)

print(f"\n[3/4] Building Correlation Network...")
df_prices = pd.DataFrame(price_data)
df_prices = df_prices.dropna(axis=1, thresh=len(df_prices)*0.8)
corr_matrix = df_prices.corr()

links = []
tickers_list = df_prices.columns.tolist()
threshold = 0.70  # Strong correlations only

for i in range(len(tickers_list)):
    for j in range(i + 1, len(tickers_list)):
        t1 = tickers_list[i]
        t2 = tickers_list[j]
        
        if t1 in corr_matrix.index and t2 in corr_matrix.columns:
            val = corr_matrix.loc[t1, t2]
            
            if not np.isnan(val) and val > threshold:
                links.append({
                    "source": t1,
                    "target": t2,
                    "value": round(val, 2)
                })

print(f"  ✓ Generated {len(links)} connections")

# Calculate industry statistics for benchmarking
industry_stats = {}
for node in nodes:
    industry = node['industry']
    if industry not in industry_stats:
        industry_stats[industry] = {
            'gross_margin': [],
            'net_margin': [],
            'roe': [],
            'debt_to_equity': []
        }
    
    industry_stats[industry]['gross_margin'].append(node['metrics']['gross_margin'])
    industry_stats[industry]['net_margin'].append(node['metrics']['net_margin'])
    industry_stats[industry]['roe'].append(node['metrics']['roe'])
    industry_stats[industry]['debt_to_equity'].append(node['metrics']['debt_to_equity'])

# Calculate averages
industry_averages = {}
for industry, stats in industry_stats.items():
    industry_averages[industry] = {
        'gross_margin': round(np.mean(stats['gross_margin']), 1),
        'net_margin': round(np.mean(stats['net_margin']), 1),
        'roe': round(np.mean(stats['roe']), 1),
        'debt_to_equity': round(np.mean(stats['debt_to_equity']), 2)
    }

print("\n[4/4] Saving Data...")
output = {
    "nodes": nodes,
    "links": links,
    "industry_averages": industry_averages,
    "metadata": {
        "generated": datetime.now().isoformat(),
        "total_stocks": len(nodes),
        "total_links": len(links),
        "failed_tickers": failed_tickers
    }
}

os.makedirs("data", exist_ok=True)
output_path = "data/graph_data.json"

with open(output_path, "w") as f:
    json.dump(output, f, indent=2)

print("\n" + "=" * 60)
print("✓ DATA PIPELINE COMPLETE")
print(f"  → {len(nodes)} stocks analyzed with real Yahoo Finance data")
print(f"  → {len(links)} price correlations mapped")
print(f"  → {len(industry_averages)} industries benchmarked")
print(f"  → Saved to: {output_path}")
print("=" * 60)

# Show top 10 scored stocks
print("\n🏆 TOP 10 BUFFETT SCORES:")
top_stocks = sorted(nodes, key=lambda x: x['buffettScore'], reverse=True)[:10]
for i, stock in enumerate(top_stocks, 1):
    print(f"  {i:2d}. {stock['id']:6s} - {stock['buffettScore']:3d}/100 - {stock['name'][:40]}")
