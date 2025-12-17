name: Update Graph Data (Manual)

on:
  workflow_dispatch: # Manual trigger only
    inputs:
      stock_count:
        description: 'Number of stocks to fetch (20, 60, or 100)'
        required: false
        default: '60'
        type: choice
        options:
          - '20'
          - '60'
          - '100'

jobs:
  update-graph:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
        
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
          cache: 'pip'
          
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r scripts/requirements.txt
          
      - name: Fetch real Yahoo Finance data
        run: |
          echo "Fetching data for ${{ github.event.inputs.stock_count }} stocks..."
          python fetch_real_data.py
        env:
          STOCK_COUNT: ${{ github.event.inputs.stock_count }}
          
      - name: Verify data was generated
        run: |
          if [ -f data/graph_data.json ]; then
            echo "✅ Data file generated successfully"
            echo "File size: $(du -h data/graph_data.json | cut -f1)"
            echo "Stocks analyzed: $(grep -o '"id"' data/graph_data.json | wc -l)"
          else
            echo "❌ Data file not found!"
            exit 1
          fi
          
      - name: Commit and push changes
        run: |
          git config --local user.name "GitHub Action"
          git config --local user.email "action@github.com"
          git add data/graph_data.json
          
          if git diff --staged --quiet; then
            echo "No changes to commit"
          else
            git commit -m "📊 Update stock data - $(date +'%Y-%m-%d %H:%M UTC')"
            git push
            echo "✅ Data updated and pushed to repository"
          fi
