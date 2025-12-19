import yfinance as yf
import pandas as pd

# The test subject
TICKER = "AAPL" 

def audit_data():
    print(f"🕵️ AUDITING YAHOO FINANCE DATA FOR: {TICKER}\n")
    
    try:
        stock = yf.Ticker(TICKER)
        
        # Fetch the 3 Statements
        inc = stock.financials
        bal = stock.balance_sheet
        cf = stock.cashflow
        
        if inc.empty: 
            print("❌ CRITICAL FAIL: Could not fetch Financials.")
            return

        # Helper to check if a row exists
        def check(df, label, exact_names):
            # Yahoo's keys can be "Total Revenue" or "TotalRevenue" depending on version
            # We search loosely
            found = False
            found_name = ""
            for name in exact_names:
                matches = [k for k in df.index if name.lower() == k.lower()]
                if matches:
                    found = True
                    found_name = matches[0]
                    break
            
            if found:
                val = df.loc[found_name].iloc[0] # Latest year
                # Format large numbers
                val_str = f"{val:,.0f}" if isinstance(val, (int, float)) else str(val)
                print(f"   ✅ {label:20} : Found ({val_str})")
                return True
            else:
                print(f"   ❌ {label:20} : MISSING")
                return False

        # --- 1. INCOME STATEMENT AUDIT ---
        print("--- [1] Income Statement (Margins & Efficiency) ---")
        check(inc, "Revenue", ["Total Revenue", "Operating Revenue"])
        check(inc, "Gross Profit", ["Gross Profit"])
        check(inc, "SG&A Expense", ["Selling General And Administration"])
        check(inc, "Depreciation", ["Reconciled Depreciation", "Depreciation And Amortization In Income Statement"])
        check(inc, "Operating Income", ["Operating Income", "Operating Profit"])
        check(inc, "Interest Expense", ["Interest Expense", "Interest Expense Non Operating"])
        check(inc, "Net Income", ["Net Income", "Net Income Common Stockholders"])
        check(inc, "EPS", ["Basic EPS"])

        # --- 2. BALANCE SHEET AUDIT ---
        print("\n--- [2] Balance Sheet (The Fortress) ---")
        check(bal, "Cash", ["Cash And Cash Equivalents"])
        check(bal, "Net Receivables", ["Net Receivables", "Accounts Receivable"])
        check(bal, "Inventory", ["Inventory"])
        check(bal, "Total Assets", ["Total Assets"])
        check(bal, "Goodwill", ["Goodwill", "Goodwill And Other Intangible Assets"])
        check(bal, "Short Term Debt", ["Current Debt", "Short Long Term Debt"])
        check(bal, "Long Term Debt", ["Long Term Debt"])
        check(bal, "Total Liabilities", ["Total Liabilities Net Minority Interest", "Total Liabilities"])
        check(bal, "Total Equity", ["Stockholders Equity", "Total Equity Gross Minority Interest"])
        check(bal, "Retained Earnings", ["Retained Earnings"])
        check(bal, "Treasury Stock", ["Treasury Stock", "Treasury Shares Number"])

        # --- 3. CASH FLOW AUDIT ---
        print("\n--- [3] Cash Flow (Reality Check) ---")
        check(cf, "CapEx", ["Capital Expenditure", "Capital Expenditure Reported"])
        check(cf, "Buybacks", ["Repurchase Of Capital Stock", "Common Stock Repurchased"])
        check(cf, "Free Cash Flow", ["Free Cash Flow"]) 

    except Exception as e:
        print(f"\n❌ SCRIPT CRASHED: {e}")

if __name__ == "__main__":
    audit_data()
