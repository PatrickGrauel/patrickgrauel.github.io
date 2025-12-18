import { ChartEngine } from './charts.js';

export class SidebarRenderer {
    constructor(selector) {
        this.el = document.querySelector(selector);
    }

    render(data) {
        // 1. Header
        document.getElementById('d-ticker').innerText = data.meta.id || 'N/A'; // Fixed ticker ref
        document.getElementById('d-name').innerText = data.meta.name;
        
        const score = data.moat_score;
        const badge = document.getElementById('d-score');
        badge.innerText = score;
        badge.className = `score-badge ${score > 60 ? 'green' : (score > 40 ? 'yellow' : 'red')}`;

        // 2. Radar Chart
        ChartEngine.renderRadar('#radar-chart', data.groups);

        // 3. Metrics Grid (Overview Tab)
        const grid = document.getElementById('metrics-grid');
        grid.innerHTML = '';
        
        const keyMetrics = [
            { k: 'gross_margin', l: 'Gross Margin', f: '%' },
            { k: 'roe', l: 'ROE', f: '%' },
            { k: 'roic', l: 'ROIC', f: '%' },
            { k: 'debt_to_equity', l: 'Debt/Eq', f: '' },
            { k: 'fcf_margin', l: 'FCF Margin', f: '%' },
            { k: 'revenue_cagr_5y', l: 'Rev CAGR (5y)', f: '%' }
        ];

        keyMetrics.forEach(m => {
            const val = data.metrics[m.k];
            const score = data.scores[m.k] || 50; // Percentile
            if (val === undefined) return;

            const card = document.createElement('div');
            card.className = 'metric-card';
            card.innerHTML = `
                <div class="m-label">${m.l}</div>
                <div class="m-val">${val.toFixed(1)}${m.f}</div>
                <div class="m-bar">
                    <div class="m-fill" style="width:${score}%; background:${this.getColor(score)}"></div>
                </div>
            `;
            grid.appendChild(card);
        });
        
        // 4. Render Timelines (Financials Tab)
        // Clear previous
        document.getElementById('chart-growth').innerHTML = '';
        document.getElementById('chart-fcf').innerHTML = '';
        
        // We pass the full history object
        ChartEngine.renderTimeline('#chart-growth', data.history, 'revenue', 'Total Revenue');
        ChartEngine.renderTimeline('#chart-growth', data.history, 'net_income', 'Net Income');
        ChartEngine.renderTimeline('#chart-fcf', data.history, 'revenue', 'Free Cash Flow'); // Using revenue slot for demo, replace if FCF key exists
    }

    open() {
        this.el.classList.remove('hidden');
    }

    getColor(score) { return score > 50 ? '#00c853' : '#ff3d00'; }
}
