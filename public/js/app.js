import { DataManager } from './data.js';

const App = {
    async init() {
        const network = await DataManager.loadNetwork();
        this.renderGraph(network);
        
        // Search
        document.getElementById('search').addEventListener('input', (e) => {
            // Implement search highlighting
        });
        
        // Filter
        document.getElementById('score-filter').addEventListener('input', (e) => {
            document.getElementById('score-val').textContent = e.target.value;
            // Implement filter
        });
    },

    renderGraph(data) {
        const svg = d3.select('#network-svg');
        const width = document.getElementById('viz').clientWidth;
        const height = document.getElementById('viz').clientHeight;
        
        svg.attr('width', width).attr('height', height);
        
        const simulation = d3.forceSimulation(data.nodes)
            .force('link', d3.forceLink(data.links).id(d => d.id).strength(0.1))
            .force('charge', d3.forceManyBody().strength(-100))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(d => Math.log(d.mc || 1e9) * 2));

        const link = svg.append('g').selectAll('line')
            .data(data.links).join('line')
            .attr('stroke', '#333').attr('stroke-width', 1);

        const node = svg.append('g').selectAll('circle')
            .data(data.nodes).join('circle')
            .attr('r', d => Math.log(d.mc || 1e9) * 1.5)
            .attr('fill', d => d.sc > 60 ? '#00c853' : (d.sc > 40 ? '#ffd600' : '#ff3d00'))
            .attr('stroke', '#fff').attr('stroke-width', 1)
            .on('click', (e, d) => this.loadDetail(d));

        simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            node.attr('cx', d => d.x).attr('cy', d => d.y);
        });
    },

    async loadDetail(node) {
        const data = await DataManager.loadTicker(node.id);
        
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('detail-view').classList.remove('hidden');
        
        document.getElementById('d-ticker').textContent = data.meta.name;
        document.getElementById('d-score').textContent = data.moat_score;
        document.getElementById('d-score').className = `score-badge ${data.moat_score > 60 ? 'green' : (data.moat_score > 40 ? 'yellow' : 'red')}`;
        
        // Render Metric Grid
        const grid = document.getElementById('metrics-grid');
        grid.innerHTML = '';
        
        const metricsToShow = ['gross_margin', 'roe', 'roic', 'debt_to_equity'];
        metricsToShow.forEach(k => {
            const val = data.metrics[k];
            const score = data.scores[k];
            if(val === undefined) return;
            
            const card = document.createElement('div');
            card.className = 'metric-card';
            card.innerHTML = `
                <div class="m-label">${k.replace('_', ' ')}</div>
                <div class="m-val">${val.toFixed(1)}%</div>
                <div class="m-bar"><div class="m-fill" style="width:${score}%; background:${score>50?'#00c853':'#ff3d00'}"></div></div>
            `;
            grid.appendChild(card);
        });
    }
};

App.init();
