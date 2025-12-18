import pandas as pd
import numpy as np

def score_universe(tickers_data):
    """
    Input: Dict of { ticker: { metrics: {...}, meta: {...} } }
    Output: Same dict, enriched with 'scores' and 'moat_score'
    """
    
    # 1. Convert to DataFrame for easy ranking
    records = []
    for t, d in tickers_data.items():
        row = d['metrics'].copy()
        row['id'] = t
        row['sector'] = d['meta']['sector']
        records.append(row)
    
    df = pd.DataFrame(records)
    if df.empty: return tickers_data

    # 2. Define Metric Direction (True = Higher is Better)
    metric_config = {
        'gross_margin': True, 'net_margin': True, 'operating_margin': True,
        'roe': True, 'roic': True, 'roa': True,
        'debt_to_equity': False, 'interest_coverage': True,
        'fcf_margin': True, 'capex_intensity': False, # Lower capex is better (usually)
        'revenue_cagr_5y': True
    }

    # 3. Calculate Percentiles per Sector
    scored_df = df.copy()
    
    # We need at least a few companies to rank against. 
    # If sector is small, rank against Global Universe as fallback.
    global_ranks = {}
    
    for col, higher_is_better in metric_config.items():
        # Global Rank (Backup)
        scored_df[f'{col}_score'] = df[col].rank(pct=True, ascending=higher_is_better) * 100
    
    # Sector Rank (Primary)
    # Apply transformation per group
    for col, higher_is_better in metric_config.items():
        # Logic: Calculate percentile within group. 
        # fillna(50) assumes average if data missing.
        scored_df[f'{col}_sector_score'] = df.groupby('sector')[col].rank(pct=True, ascending=higher_is_better) * 100
        
    # Fill NaN sector scores with global scores (fallback for unique sectors)
    for col in metric_config.keys():
        sec_col = f'{col}_sector_score'
        glob_col = f'{col}_score'
        scored_df[sec_col] = scored_df[sec_col].fillna(scored_df[glob_col]).fillna(50)

    # 4. Composite Moat Score
    # Weighted Average of key pillars
    scored_df['moat_score'] = (
        scored_df['roic_sector_score'] * 0.25 +
        scored_df['gross_margin_sector_score'] * 0.20 +
        scored_df['fcf_margin_sector_score'] * 0.15 +
        scored_df['debt_to_equity_sector_score'] * 0.15 +
        scored_df['revenue_cagr_5y_sector_score'] * 0.15 +
        scored_df['roe_sector_score'] * 0.10
    ).astype(int)

    # 5. Inject back into data dict
    for index, row in scored_df.iterrows():
        ticker = row['id']
        if ticker in tickers_data:
            tickers_data[ticker]['scores'] = {
                k: round(row[f'{k}_sector_score']) 
                for k in metric_config.keys()
            }
            tickers_data[ticker]['moat_score'] = int(row['moat_score'])
            
            # Create Category Groups for Radar Chart
            tickers_data[ticker]['groups'] = {
                'Pricing': int(row['gross_margin_sector_score']),
                'Efficiency': int(row['roic_sector_score']),
                'Health': int(row['debt_to_equity_sector_score']),
                'Growth': int(row['revenue_cagr_5y_sector_score']),
                'Cash': int(row['fcf_margin_sector_score'])
            }

    return tickers_data
