import yfinance as yf
import json
import os
import pandas as pd
import numpy as np
from datetime import datetime
import time
import sys

# Predefined ticker lists
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

def test_connection():
    """Test if we can connect to Yahoo Finance"""
    print("\n🔍 Testing Yahoo Finance connection...")
    try:
        test_stock = yf.Ticker("AAPL")
        info = test_stock.info
        if 'marketCap' in info and info['marketCap'] > 0:
            print("✅ Connection successful!")
            print(f"   Test: AAPL market cap = ${info['marketCap']/1e9:.1f}B")
            return True
        else:
            print("⚠️  Connection established but data incomplete")
            return False
    except Exception as e:
        print(f"❌ Connection failed: {str(e)[:100]}")
        return False

def calculate_buffett_metrics(stock, symbol):
    """Calculate comprehensive Buffett metrics"""
    try:
        info = stock.info
        
        # Get financial statements
        try:
            income_stmt = stock.financials
            balance_sheet = stock.balance_sheet
            cash_flow = stock.cashflow
        except Exception as e:
            print(f"    → Failed to get statements: {str(e)[:50]}")
            return None
        
        if income_stmt.empty or balance_sheet.empty:
            print(f"    → Empty financial statements")
            return None
        
        metrics = {}
        historical = {
            'gross_margin': [],
            'net_margin': [],
            'roe': [],
            'debt_to_equity': []
        }
        
        # Process historical data
        years = min(5, len(income_stmt.columns))
        
        for i in range(years):
            try:
                revenue = income_stmt.iloc[:, i].get('Total Revenue', 0)
                if revenue == 0:
                    revenue = income_stmt.iloc[:, i].get('Total Revenues', 0)
                
                gross_profit = income_stmt.iloc[:, i].get('Gross Profit', 0)
                net_income = income_stmt.iloc[:, i].get('Net Income', 0)
                
                total_equity = balance_sheet.iloc[:, i].get('Stockholders Equity', 1)
                if total_equity == 0:
                    total_equity = balance_sheet.iloc[:, i].get('Total Stockholder Equity', 1)
                
                total_debt = balance_sheet.iloc[:, i].get('Total Debt', 0)
                
                if revenue > 0:
                    gm = (gross_profit / revenue) * 100
                    nm = (net_income / revenue) * 100
                    if -100 < gm < 100:
                        historical['gross_margin'].append({
                            "date": str(income_stmt.columns[i].year),
                            "value": round(gm, 1)
                        })
                    if -100 < nm < 100:
                        historical['net_margin'].append({
                            "date": str(income_stmt.columns[i].year),
                            "value": round(nm, 1)
                        })
                
                if total_equity > 0:
                    roe = (net_income / total_equity) * 100
                    if -200 < roe < 500:
                        historical['roe'].append({
                            "date": str(income_stmt.columns[i].year),
                            "value": round(roe, 1)
                        })
                    
                    de = total_debt / total_equity
                    if de >= 0 and de < 10:
                        historical['debt_to_equity'].append({
                            "date": str(balance_sheet.columns[i].year),
                            "value": round(de, 2)
                        })
                    
            except:
                continue
        
        # Reverse historical lists so they are chronological (oldest -> newest)
        for key in historical:
            historical[key].reverse()

        # Current year metrics
        revenue = income_stmt.iloc[:, 0].get('Total Revenue', 0)
        if revenue == 0:
            revenue = income_stmt.iloc[:, 0].get('Total Revenues', 0)
            
        gross_profit = income_stmt.iloc[:, 0].get('Gross Profit', 0)
        net_income = income_stmt.iloc[:, 0].get('Net Income', 0)
        operating_income = income_stmt.iloc[:, 0].get('Operating Income', 0)
        sga = income_stmt.iloc[:, 0].get('Selling General Administrative', 0)
        
        total_assets = balance_sheet.iloc[:, 0].get('Total Assets', 1)
        total_equity = balance_sheet.iloc[:, 0].get('Stockholders Equity', 1)
        if total_equity == 0:
            total_equity = balance_sheet.iloc[:, 0].get('Total Stockholder Equity', 1)
            
        total_debt = balance_sheet.iloc[:, 0].get('Total Debt', 0)
        current_assets = balance_sheet.iloc[:, 0].get('Current Assets', 0)
        current_liabilities = balance_sheet.iloc[:, 0].get('Current Liabilities', 1)
        
        free_cash_flow = cash_flow.iloc[:, 0].get('Free Cash Flow', 0)
        capex = abs(cash_flow.iloc[:, 0].get('Capital Expenditure', 0))
        
        # Calculate metrics
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
        metrics['retained_earnings'] = balance_sheet.iloc[:, 0].get('Retained Earnings', 0)
        
        metrics['pe_ratio'] = info.get('trailingPE', 0) or 0
        metrics['pb_ratio'] = info.get('priceToBook', 0) or 0
        
        # Calculate Buffett Score
        score = 0
        if metrics['gross_margin'] > 40: score += 10
        if metrics['net_margin'] > 15: score += 10
        if metrics['sga_ratio'] > 0 and metrics['sga_ratio'] < 30: score += 10
        if metrics['roe'] > 15: score += 10
        if metrics['roic'] > 12: score += 10
        if metrics['roa'] > 7: score += 5
        if metrics['debt_to_equity'] < 0.5: 
            score += 15
        elif metrics['debt_to_equity'] < 1.0: 
            score += 10
        if metrics['current_ratio'] > 1.5: score += 5
        if metrics['fcf_margin'] > 15: score += 10
        if metrics['capex_ratio'] > 0 and metrics['capex_ratio'] < 5: score += 5
        
        if len(historical['gross_margin']) >= 3:
            # Check stability (max - min variance < 10%)
            vals = [x['value'] for x in historical['gross_margin']]
            if max(vals) - min(vals) < 10: 
                score += 5
                
        metrics['buffett_score'] = min(score, 100)
        
        return {
            'metrics': metrics,
            'historical': historical
        }
        
    except Exception as e:
        print(f"    → Error: {str(e)[:60]}")
        return None

# Main execution
print("=" * 70)
print("BUFFETT STOCK ANALYZER - Yahoo Finance Real-Time Data")
print("=" * 70)

# Test connection first
if not test_connection():
    print("\n⚠️  WARNING: Yahoo Finance connection issues detected")
    print("Script will continue but may have limited results...")
    time.sleep(2)

print("\n[1/4] Building Watchlist...")
tickers = SP500_TOP[:60] + DAX_STOCKS[:15]
print(f"Target: {len(tickers)} stocks")

nodes = []
price_data = {}
failed_tickers = []

print("\n[2/4] Fetching Financial Data from Yahoo Finance...")
print("=" * 70)

for i, symbol in enumerate(tickers):
    try:
        # Progress indicator
        progress = f"[{i+1}/{len(tickers)}]"
        print(f"\n{progress} Processing {symbol}...", end="")
        sys.stdout.flush()
        
        # Rate limiting
        if i > 0 and i % 10 == 0:
            time.sleep(1)
        
        stock = yf.Ticker(symbol)
        info = stock.info
        
        # Check if valid
        if 'marketCap' not in info or info.get('marketCap', 0) == 0:
            print(" ❌ No market cap")
            failed_tickers.append(symbol)
            continue
        
        result = calculate_buffett_metrics(stock, symbol)
        if not result:
            print(" ❌ No financial data")
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
        print(f" ✅ Score: {node['buffettScore']}/100")
        
        # Fetch price history for correlations
        try:
            hist = stock.history(period="5y")
            if not hist.empty and len(hist) > 100:
                price_data[symbol] = hist["Close"]
        except:
            pass
            
    except Exception as e:
        print(f" ❌ Error: {str(e)[:40]}")
        failed_tickers.append(symbol)
        continue

print("\n" + "=" * 70)
print(f"✅ Successfully fetched: {len(nodes)} stocks")
print(f"❌ Failed: {len(failed_tickers)} stocks")

if len(nodes) == 0:
    print("\n" + "!" * 70)
    print("ERROR: No data could be fetched!")
    print("!" * 70)
    sys.exit(1)

print(f"\n[3/4] Building Correlation Network...")
if len(price_data) > 1:
    df_prices = pd.DataFrame(price_data)
    df_prices = df_prices.dropna(axis=1, thresh=len(df_prices)*0.8)
    
    if len(df_prices.columns) > 1:
        corr_matrix = df_prices.corr()
        
        links = []
        tickers_list = df_prices.columns.tolist()
        threshold = 0.70
        
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
    else:
        links = []
        print("  ⚠️  Not enough price data for correlations")
else:
    links = []
    print("  ⚠️  No price data available for correlations")

# Calculate industry statistics
print(f"\n[4/4] Calculating Industry Benchmarks...")
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

industry_averages = {}
for industry, stats in industry_stats.items():
    industry_averages[industry] = {
        'gross_margin': round(np.mean(stats['gross_margin']), 1) if stats['gross_margin'] else 0,
        'net_margin': round(np.mean(stats['net_margin']), 1) if stats['net_margin'] else 0,
        'roe': round(np.mean(stats['roe']), 1) if stats['roe'] else 0,
        'debt_to_equity': round(np.mean(stats['debt_to_equity']), 2) if stats['debt_to_equity'] else 0
    }

print(f"  ✓ Calculated averages for {len(industry_averages)} industries")

# === CRITICAL FIX: SANITIZE DATA ===
def sanitize_data(obj):
    """Recursively replace NaN/Infinity with None (null) for valid JSON"""
    if isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    elif isinstance(obj, dict):
        return {k: sanitize_data(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_data(v) for v in obj]
    return obj

# Save data
print(f"\n[5/5] Saving Data...")
output = {
    "nodes": nodes,
    "links": links,
    "industry_averages": industry_averages,
    "metadata": {
        "generated": datetime.now().isoformat(),
        "total_stocks": len(nodes),
        "total_links": len(links),
        "failed_tickers": failed_tickers,
        "target_count": len(tickers)
    }
}

# Apply sanitization before saving
clean_output = sanitize_data(output)

os.makedirs("data", exist_ok=True)
output_path = "data/graph_data.json"

with open(output_path, "w") as f:
    # ensure_ascii=False fixes potential encoding issues with symbols
    json.dump(clean_output, f, indent=2, ensure_ascii=False)

file_size = os.path.getsize(output_path)
print(f"  ✓ Saved to: {output_path}")
print(f"  ✓ File size: {file_size/1024:.1f} KB")

print("\n" + "=" * 70)
print("📊 SUMMARY")
print("=" * 70)
print(f"  Stocks analyzed:    {len(nodes)}")
print(f"  Correlations found: {len(links)}")
print(f"  Industries covered: {len(industry_averages)}")
print(f"  Failed tickers:     {len(failed_tickers)}")
print("=" * 70)

if len(nodes) > 0:
    print("\n🏆 TOP 10 BUFFETT SCORES:")
    top_stocks = sorted(nodes, key=lambda x: x['buffettScore'], reverse=True)[:10]
    for i, stock in enumerate(top_stocks, 1):
        print(f"  {i:2d}. {stock['id']:8s} {stock['buffettScore']:3d}/100  {stock['name'][:45]}")
    
    print(f"\n✅ SUCCESS! Data saved to {output_path}")
else:
    print("\n⚠️  WARNING: No stocks were successfully fetched!")
    sys.exit(1)
