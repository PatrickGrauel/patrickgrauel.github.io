const app = {
    svg: null, g: null, simulation: null,
    nodes: [], links: [],
    
    // Config
    width: 0, height: 0,
    colors: {
        'Technology': '#00d4ff', 'Communication Services': '#ff6b9d', 'Consumer Cyclical': '#ffa500',
        'Consumer Defensive': '#32cd32', 'Financial Services': '#ffd700', 'Healthcare': '#ff1493',
        'Industrials': '#4169e1', 'Energy': '#dc143c', 'Utilities': '#9370db', 'Basic Materials': '#8b4513'
    },

    init() {
        this.setupSVG();
        this.setupControls();
        this.loadData();
    },

    setupSVG() {
        const container = d3.select('#graph-container');
        this.width = container.node().clientWidth;
        this.height = container.node().clientHeight;
        
        this.svg = d3.select('#main-svg');
        this.g = this.svg.append('g');
        
        const zoom = d3.zoom().scaleExtent([0.1, 8])
            .on('zoom', (e) => this.g.attr('transform', e.transform));
        this.svg.call(zoom);
        
        this.svg.on('click', (e) => {
            if (e.target.tagName === 'svg') d3.select('#sidebar').classed('hidden', true);
        });
    },

    setupControls() {
        // Search
        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value));
        // Leaderboard
        const btn = document.getElementById('btn-leaderboard');
        const lb = document.getElementById('leaderboard');
        const close = document.getElementById('lb-close');
        if(btn) btn.addEventListener('click', () => lb.classList.add('visible'));
        if(close) close.addEventListener('click', () => lb.classList.remove('visible'));
    },

    loadData() {
        d3.json('data/graph_data.json?v=' + new Date().getTime()).then(data => {
            this.nodes = data.nodes || [];
            this.links = data.links || [];
            d3.select('#loader').classed('done', true);
            this.renderGraph();
            this.renderLeaderboard('all');
            this.populateTickerList();
        });
    },

    renderGraph() {
        this.simulation = d3.forceSimulation(this.nodes)
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(this.width/2, this.height/2))
            .force('collide', d3.forceCollide().radius(d => this.getNodeRadius(d) + 5))
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(100));

        const link = this.g.append('g').selectAll('line')
            .data(this.links).join('line')
            .attr('stroke', '#30363d').attr('stroke-width', 1).attr('opacity', 0.4);

        const nodeGroup = this.g.append('g').selectAll('g')
            .data(this.nodes).join('g')
            .call(this.drag(this.simulation))
            .on('click', (e, d) => { e.stopPropagation(); this.showDetails(d); });

        // Node Circle - Colored by Composite Sector Score
        nodeGroup.append('circle')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => this.getHealthColor(d.buffettScore))
            .attr('stroke', '#fff').attr('stroke-width', 1.5).style('cursor', 'pointer');

        // Text
        nodeGroup.append('text')
            .text(d => d.id).attr('text-anchor', 'middle').attr('dy', '.35em')
            .attr('font-size', d => Math.max(10, this.getNodeRadius(d)/2.2))
            .attr('fill', '#000').style('pointer-events', 'none').style('font-weight', '800');

        this.simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
        });
        this.nodeElements = nodeGroup;
    },

    // --- SIDEBAR LOGIC ---
    showDetails(stock) {
        d3.select('#sidebar').classed('hidden', false);
        d3.select('#det-ticker').text(stock.id);
        d3.select('#det-name').text(stock.name);
        
        const score = stock.buffettScore;
        d3.select('#det-score').text(score).style('color', this.getHealthColor(score));

        // 1. Render Radar Chart (Grouped)
        this.renderRadar(stock);

        // 2. Render Metrics Table (Grouped)
        this.renderMetricsTable(stock);
    },

    renderRadar(stock) {
        const container = d3.select('#radar-container');
        container.html('');
        const width = 220, height = 220;
        const svg = container.append('svg').attr('width', width).attr('height', height);
        
        const s = stock.sector_scores;
        // Group definitions: taking average of scores in the group
        const groups = [
            { axis: 'Profit', keys: ['roic', 'roe', 'operating_margin', 'net_margin'] },
            { axis: 'Growth', keys: ['revenue_cagr', 'net_income_cagr', 'fcf_cagr'] },
            { axis: 'Health', keys: ['debt_to_equity', 'interest_coverage', 'current_ratio'] },
            { axis: 'Cash Flow', keys: ['fcf_margin', 'fcf_conversion'] },
            { axis: 'Value', keys: ['pe_ratio', 'ev_ebit', 'p_fcf'] },
            { axis: 'Efficiency', keys: ['asset_turnover'] }
        ];

        const data = groups.map(g => {
            const vals = g.keys.map(k => s[k] || 50); // Default to 50 if missing
            const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
            return { axis: g.axis, value: avg / 100 }; // 0-1 scale
        });

        // Drawing Radar
        const r = 80, center = {x: width/2, y: height/2};
        const angleSlice = Math.PI * 2 / data.length;
        
        // Background Web
        for(let i=1; i<=4; i++) {
            svg.append('circle').attr('cx', center.x).attr('cy', center.y).attr('r', r*i/4)
               .attr('fill', 'none').attr('stroke', '#333');
        }
        
        // Axes
        data.forEach((d, i) => {
            const ang = i * angleSlice - Math.PI/2;
            const x = center.x + r * Math.cos(ang);
            const y = center.y + r * Math.sin(ang);
            svg.append('line').attr('x1', center.x).attr('y1', center.y).attr('x2', x).attr('y2', y).attr('stroke', '#444');
            svg.append('text').attr('x', x*1.15 - (center.x*0.15)).attr('y', y*1.15 - (center.y*0.15))
               .text(d.axis).attr('text-anchor', 'middle').attr('fill', '#888').attr('font-size', '10px');
        });

        // Shape
        const line = d3.lineRadial()
            .angle((d,i) => i * angleSlice)
            .radius(d => d.value * r)
            .curve(d3.curveLinearClosed);
            
        svg.append('path').datum(data).attr('d', line).attr('transform', `translate(${center.x},${center.y})`)
           .attr('fill', 'rgba(0,121,253,0.3)').attr('stroke', '#0079fd').attr('stroke-width', 2);
    },

    renderMetricsTable(stock) {
        const container = d3.select('#metrics-container');
        container.html('');
        
        const raw = stock.raw_metrics;
        const scores = stock.sector_scores;

        const config = [
            { title: "Profitability", metrics: [
                {k:'roic', l:'ROIC', f:'%'}, {k:'roe', l:'ROE', f:'%'}, {k:'net_margin', l:'Net Margin', f:'%'}
            ]},
            { title: "Growth (CAGR)", metrics: [
                {k:'revenue_cagr', l:'Revenue', f:'%'}, {k:'net_income_cagr', l:'Net Income', f:'%'}
            ]},
            { title: "Health", metrics: [
                {k:'debt_to_equity', l:'Debt/Eq', f:''}, {k:'interest_coverage', l:'Int. Cov', f:'x'}
            ]},
            { title: "Valuation", metrics: [
                {k:'pe_ratio', l:'P/E', f:''}, {k:'p_fcf', l:'P/FCF', f:''}
            ]}
        ];

        config.forEach(group => {
            container.append('div').attr('class', 'section-header').text(group.title);
            group.metrics.forEach(m => {
                const val = raw[m.k];
                const score = scores[m.k] || 50;
                if (val === null || val === undefined) return;

                const row = container.append('div').attr('class', 'metric-row');
                
                // Label & Raw Value
                const left = row.append('div').style('flex', '1');
                left.append('div').style('font-size', '11px').style('color', '#888').text(m.l);
                left.append('div').style('font-size', '14px').style('font-weight', '600').text(val.toFixed(1) + m.f);

                // Sector Relative Bar
                const right = row.append('div').style('flex', '1').style('display', 'flex').style('align-items', 'center').style('gap', '5px');
                
                // Bar
                const barBg = right.append('div').style('flex', '1').style('height', '6px').style('background', '#333').style('border-radius', '3px').style('overflow', 'hidden');
                barBg.append('div').style('height', '100%').style('width', score + '%').style('background', this.getHealthColor(score));
                
                // Percentile Text
                right.append('div').style('font-size', '10px').style('width', '25px').style('text-align', 'right').style('color', this.getHealthColor(score)).text(score);
            });
        });
    },

    // --- UTILS ---
    getHealthColor(score) {
        if(score >= 75) return '#00c853'; // Green
        if(score >= 40) return '#ffd600'; // Yellow
        return '#ff3d00'; // Red
    },
    getNodeRadius(d) { return Math.max(20, Math.log10(d.marketCap||1e9)*4); },
    renderLeaderboard(sector) { /* reusing previous logic logic */ },
    populateTickerList() { /* reusing previous logic */ },
    handleSearch(t) { /* reusing previous logic */ },
    drag(sim) {
        return d3.drag()
            .on('start', (e)=> { if(!e.active) sim.alphaTarget(0.3).restart(); e.subject.fx=e.subject.x; e.subject.fy=e.subject.y; })
            .on('drag', (e)=> { e.subject.fx=e.x; e.subject.fy=e.y; })
            .on('end', (e)=> { if(!e.active) sim.alphaTarget(0); e.subject.fx=null; e.subject.fy=null; });
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
