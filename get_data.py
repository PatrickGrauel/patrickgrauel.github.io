import yfinance as yf
import json
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def get_sp500_tickers():
    try:
        table = pd.read_html('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies')
        df = table[0]
        return df['Symbol'].tolist()
    except Exception as e:
        print(f"Error fetching S&P 500: {e}")
        return []

def get_dax_tickers():
    try:
        table = pd.read_html('https://en.wikipedia.org/wiki/DAX')
        df = table[3]
        tickers = []
        for symbol in df['Ticker']:
            if not symbol.endswith('.DE'):
                tickers.append(f"{symbol}.DE")
            else:
                tickers.append(symbol)
        return tickers
    except Exception as e:
        print(f"Error fetching DAX: {e}")
        return ["SAP.DE", "SIE.DE", "ALV.DE", "DTE.DE", "BMW.DE", "VOW3.DE"]

def calculate_buffett_metrics(stock, symbol):
    """Calculate comprehensive Buffett metrics from Old School Value"""
    try:
        info = stock.info
        
        # Get financial statements
        try:
            income_stmt = stock.financials
            balance_sheet = stock.balance_sheet
            cash_flow = stock.cashflow
        except:
            return None
        
        metrics = {}
        historical = {
            'gross_margin': [],
            'net_margin': [],
            'roe': [],
            'roic': [],
            'debt_to_equity': []
        }
        
        # Process last 5 years of data if available
        years = min(5, len(income_stmt.columns))
        
        for i in range(years):
            try:
                # Income statement metrics
                revenue = income_stmt.iloc[:, i].get('Total Revenue', 0)
                gross_profit = income_stmt.iloc[:, i].get('Gross Profit', 0)
                net_income = income_stmt.iloc[:, i].get('Net Income', 0)
                operating_income = income_stmt.iloc[:, i].get('Operating Income', 0)
                
                # Balance sheet metrics
                total_assets = balance_sheet.iloc[:, i].get('Total Assets', 0)
                total_equity = balance_sheet.iloc[:, i].get('Stockholders Equity', 0)
                total_debt = balance_sheet.iloc[:, i].get('Total Debt', 0)
                current_assets = balance_sheet.iloc[:, i].get('Current Assets', 0)
                current_liabilities = balance_sheet.iloc[:, i].get('Current Liabilities', 0)
                
                # Cash flow metrics
                free_cash_flow = cash_flow.iloc[:, i].get('Free Cash Flow', 0)
                
                # Calculate ratios
                if revenue > 0:
                    gm = gross_profit / revenue
                    nm = net_income / revenue
                    historical['gross_margin'].append(round(gm * 100, 1))
                    historical['net_margin'].append(round(nm * 100, 1))
                
                if total_equity > 0:
                    roe = net_income / total_equity
                    historical['roe'].append(round(roe * 100, 1))
                
                if (total_equity + total_debt) > 0:
                    roic = operating_income / (total_equity + total_debt)
                    historical['roic'].append(round(roic * 100, 1))
                
                if total_equity > 0:
                    de = total_debt / total_equity
                    historical['debt_to_equity'].append(round(de, 2))
                    
            except Exception as e:
                continue
        
        # Current year metrics (most recent)
        if len(income_stmt.columns) > 0:
            revenue = income_stmt.iloc[:, 0].get('Total Revenue', 0)
            gross_profit = income_stmt.iloc[:, 0].get('Gross Profit', 0)
            net_income = income_stmt.iloc[:, 0].get('Net Income', 0)
            operating_income = income_stmt.iloc[:, 0].get('Operating Income', 0)
            sga = income_stmt.iloc[:, 0].get('Selling General Administrative', 0)
            
            total_assets = balance_sheet.iloc[:, 0].get('Total Assets', 0)
            total_equity = balance_sheet.iloc[:, 0].get('Stockholders Equity', 0)
            total_debt = balance_sheet.iloc[:, 0].get('Total Debt', 0)
            current_assets = balance_sheet.iloc[:, 0].get('Current Assets', 0)
            current_liabilities = balance_sheet.iloc[:, 0].get('Current Liabilities', 0)
            retained_earnings = balance_sheet.iloc[:, 0].get('Retained Earnings', 0)
            
            free_cash_flow = cash_flow.iloc[:, 0].get('Free Cash Flow', 0)
            capex = abs(cash_flow.iloc[:, 0].get('Capital Expenditure', 0))
            
            # 1. MARGINS (Buffett loves high margins)
            metrics['gross_margin'] = round((gross_profit / revenue * 100) if revenue > 0 else 0, 1)
            metrics['net_margin'] = round((net_income / revenue * 100) if revenue > 0 else 0, 1)
            metrics['operating_margin'] = round((operating_income / revenue * 100) if revenue > 0 else 0, 1)
            
            # 2. SG&A RATIO (Buffett: "Companies with low SG&A are moats")
            metrics['sga_ratio'] = round((sga / gross_profit * 100) if gross_profit > 0 else 0, 1)
            
            # 3. RETURNS (Buffett's key metrics)
            metrics['roe'] = round((net_income / total_equity * 100) if total_equity > 0 else 0, 1)
            metrics['roa'] = round((net_income / total_assets * 100) if total_assets > 0 else 0, 1)
            metrics['roic'] = round((operating_income / (total_equity + total_debt) * 100) if (total_equity + total_debt) > 0 else 0, 1)
            
            # 4. DEBT METRICS
            metrics['debt_to_equity'] = round((total_debt / total_equity) if total_equity > 0 else 0, 2)
            metrics['interest_coverage'] = info.get('interestCoverage', 0)
            
            # 5. LIQUIDITY
            metrics['current_ratio'] = round((current_assets / current_liabilities) if current_liabilities > 0 else 0, 2)
            
            # 6. CASH FLOW QUALITY
            metrics['fcf_margin'] = round((free_cash_flow / revenue * 100) if revenue > 0 else 0, 1)
            metrics['capex_ratio'] = round((capex / revenue * 100) if revenue > 0 else 0, 1)
            
            # 7. RETAINED EARNINGS (Buffett: "A business that has been profitable for many years")
            metrics['retained_earnings'] = retained_earnings
            
            # 8. VALUATION
            metrics['pe_ratio'] = info.get('trailingPE', 0)
            metrics['pb_ratio'] = info.get('priceToBook', 0)
            
            # BUFFETT SCORE (0-100)
            score = 0
            
            # Margins (30 points)
            if metrics['gross_margin'] > 40: score += 10
            if metrics['net_margin'] > 15: score += 10
            if metrics['sga_ratio'] < 30: score += 10
            
            # Returns (25 points)
            if metrics['roe'] > 15: score += 10
            if metrics['roic'] > 12: score += 10
            if metrics['roa'] > 7: score += 5
            
            # Debt (20 points)
            if metrics['debt_to_equity'] < 0.5: score += 15
            elif metrics['debt_to_equity'] < 1.0: score += 10
            if metrics['current_ratio'] > 1.5: score += 5
            
            # Cash Flow (15 points)
            if metrics['fcf_margin'] > 15: score += 10
            if metrics['capex_ratio'] < 5: score += 5
            
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
        print(f"Error calculating metrics for {symbol}: {e}")
        return None

# Main execution
print("=" * 60)
print("BUFFETT STOCK ANALYZER - Enhanced Version")
print("=" * 60)

print("\n[1/4] Building Watchlist...")
sp500 = get_sp500_tickers()
dax = get_dax_tickers()

# Combine (use top 100 for testing, remove limit for full run)
tickers = sp500[:80] + dax[:20]
print(f"Targeting {len(tickers)} stocks")

nodes = []
price_data = {}

print("\n[2/4] Fetching Financial Data...")
for i, symbol in enumerate(tickers):
    try:
        yahoo_symbol = symbol.replace('.', '-') if ".DE" not in symbol else symbol
        stock = yf.Ticker(yahoo_symbol)
        info = stock.info
        
        if 'marketCap' not in info or info['marketCap'] == 0:
            continue
        
        result = calculate_buffett_metrics(stock, symbol)
        if not result:
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
        hist = stock.history(period="5y")
        if not hist.empty:
            price_data[symbol] = hist["Close"]
        
        if (i + 1) % 10 == 0:
            print(f"  Progress: {i+1}/{len(tickers)} stocks processed")
            
    except Exception as e:
        print(f"  Skipping {symbol}: {str(e)[:50]}")
        continue

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
            
            if val > threshold:
                links.append({
                    "source": t1,
                    "target": t2,
                    "value": round(val, 2)
                })

print(f"  Generated {len(links)} connections between {len(nodes)} nodes")

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
        "total_links": len(links)
    }
}

os.makedirs("data", exist_ok=True)
with open("data/graph_data.json", "w") as f:
    json.dump(output, f, indent=2)

print("\n" + "=" * 60)
print("✓ DATA PIPELINE COMPLETE")
print(f"  → {len(nodes)} stocks analyzed")
print(f"  → {len(links)} correlations mapped")
print(f"  → Saved to: data/graph_data.json")
print("=" * 60)
