import yfinance as yf
import json
import sys

print("=" * 70)
print("DIAGNOSTIC SCRIPT - Testing Yahoo Finance Access")
print("=" * 70)

# Test 1: Basic import
print("\n[TEST 1] Testing imports...")
try:
    import pandas as pd
    import numpy as np
    print("✅ All imports successful")
except Exception as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)

# Test 2: Yahoo Finance connection
print("\n[TEST 2] Testing Yahoo Finance API...")
try:
    stock = yf.Ticker("AAPL")
    print("✅ yfinance.Ticker() works")
except Exception as e:
    print(f"❌ Failed to create Ticker: {e}")
    sys.exit(1)

# Test 3: Get basic info
print("\n[TEST 3] Fetching stock info...")
try:
    info = stock.info
    print(f"✅ Got info object with {len(info)} keys")
    print(f"   Keys preview: {list(info.keys())[:10]}")
except Exception as e:
    print(f"❌ Failed to get info: {e}")
    sys.exit(1)

# Test 4: Check market cap
print("\n[TEST 4] Checking market cap...")
market_cap = info.get('marketCap', None)
if market_cap and market_cap > 0:
    print(f"✅ Market cap: ${market_cap/1e9:.1f}B")
else:
    print(f"❌ Market cap not available or zero: {market_cap}")
    print(f"   Available keys in info: {list(info.keys())}")

# Test 5: Get financial statements
print("\n[TEST 5] Fetching financial statements...")
try:
    financials = stock.financials
    balance = stock.balance_sheet
    cashflow = stock.cashflow
    
    print(f"✅ Financials: {financials.shape if not financials.empty else 'EMPTY'}")
    print(f"✅ Balance Sheet: {balance.shape if not balance.empty else 'EMPTY'}")
    print(f"✅ Cash Flow: {cashflow.shape if not cashflow.empty else 'EMPTY'}")
    
    if financials.empty:
        print("⚠️  WARNING: Financials are empty!")
    else:
        print(f"   Years available: {len(financials.columns)}")
        print(f"   Columns: {financials.columns.tolist()[:3]}")
        print(f"   Rows: {financials.index.tolist()[:5]}")
        
except Exception as e:
    print(f"❌ Failed to get financials: {e}")

# Test 6: Get price history
print("\n[TEST 6] Fetching price history...")
try:
    hist = stock.history(period="1mo")
    print(f"✅ History: {hist.shape if not hist.empty else 'EMPTY'}")
    if not hist.empty:
        print(f"   Days of data: {len(hist)}")
        print(f"   Latest close: ${hist['Close'].iloc[-1]:.2f}")
except Exception as e:
    print(f"❌ Failed to get history: {e}")

# Test 7: Try multiple stocks
print("\n[TEST 7] Testing multiple stocks...")
test_tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "META"]
success_count = 0

for ticker in test_tickers:
    try:
        s = yf.Ticker(ticker)
        i = s.info
        mc = i.get('marketCap', 0)
        if mc > 0:
            print(f"✅ {ticker}: ${mc/1e9:.1f}B")
            success_count += 1
        else:
            print(f"❌ {ticker}: No market cap")
    except Exception as e:
        print(f"❌ {ticker}: {str(e)[:50]}")

print(f"\n   Success rate: {success_count}/{len(test_tickers)}")

# Final diagnosis
print("\n" + "=" * 70)
print("DIAGNOSIS:")
print("=" * 70)

if success_count == 0:
    print("❌ CRITICAL: Cannot fetch ANY stock data")
    print("\nPossible causes:")
    print("1. Yahoo Finance API is completely blocked")
    print("2. Network/firewall blocking external requests")
    print("3. Yahoo Finance is down globally")
    print("\nSolutions:")
    print("→ Run this script locally (not on GitHub Actions)")
    print("→ Check if https://finance.yahoo.com is accessible")
    print("→ Try using a VPN or proxy")
elif success_count < len(test_tickers):
    print(f"⚠️  PARTIAL: Only {success_count}/{len(test_tickers)} stocks working")
    print("\nThis is actually normal - some stocks might be temporarily unavailable")
    print("Your script should work with reduced stock count")
else:
    print("✅ GOOD: Yahoo Finance is fully accessible!")
    print("\nIf your main script still fails, the issue is likely:")
    print("1. Script configuration (wrong file paths)")
    print("2. Data processing logic error")
    print("3. Timeout issues with large stock lists")

print("=" * 70)

# Save a test data file
print("\n[TEST 8] Creating test data file...")
try:
    test_data = {
        "nodes": [
            {
                "id": "AAPL",
                "name": info.get('shortName', 'Apple Inc.'),
                "marketCap": market_cap or 0,
                "test": True
            }
        ],
        "links": [],
        "metadata": {
            "test_run": True,
            "success_count": success_count
        }
    }
    
    import os
    os.makedirs("data", exist_ok=True)
    
    with open("data/diagnostic_test.json", "w") as f:
        json.dump(test_data, f, indent=2)
    
    print("✅ Test file created: data/diagnostic_test.json")
    print(f"   File size: {os.path.getsize('data/diagnostic_test.json')} bytes")
    
except Exception as e:
    print(f"❌ Failed to create test file: {e}")

print("\n" + "=" * 70)
print("Diagnostic complete! Check output above for issues.")
print("=" * 70)
