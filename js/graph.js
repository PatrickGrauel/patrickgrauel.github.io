const app = {
    nodes: [], links: [], watchlist: [], viewMode: 'network',
    width: 0, height: 0,
    svg: null, g: null, simulation: null,
    colors: { 'Undervalued': '#00c853', 'Fair': '#ffd600', 'Overvalued': '#ff3d00' },

    init() {
        this.setupSVG();
        this.setupControls();
        this.loadData();
    },

    setupSVG() {
        const el = document.getElementById('graph-container');
        this.width = el.clientWidth;
        this.height = el.clientHeight;
        this.svg = d3.select('#main-svg');
        this.g = this.svg.append('g');
        this.svg.call(d3.zoom().scaleExtent([0.1, 8]).on('zoom', (e) => this.g.attr('transform', e.transform))).on('click', (e) => { if(e.target.tagName==='svg') this.resetFocus(); });
    },

    setupControls() {
        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('view-net').addEventListener('click', () => this.switchLayout('network'));
        document.getElementById('view-heat').addEventListener('click', () => this.switchLayout('heatmap'));
        
        // Tab Switcher
        document.querySelectorAll('.tab').forEach(t => {
            t.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
                document.querySelectorAll('.sidebar-content').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                document.getElementById(t.dataset.target).classList.add('active');
            });
        });

        const wl = document.getElementById('watchlist');
        document.getElementById('btn-watchlist').addEventListener('click', () => wl.classList.toggle('visible'));
        document.getElementById('close-sidebar').addEventListener('click', () => { d3.select('#sidebar').classed('visible', false); this.resetFocus(); });
    },

    loadData() {
        d3.json('data/graph_data.json?v=' + Date.now()).then(data => {
            this.nodes = data.nodes || [];
            this.links = data.links || [];
            this.nodes.forEach(n => { n.x = Math.random()*this.width; n.y = Math.random()*this.height; });
            this.renderGraph();
        });
    },

    renderGraph() {
        this.g.selectAll('*').remove();
        this.simulation = d3.forceSimulation(this.nodes)
            .force('charge', d3.forceManyBody().strength(-150))
            .force('center', d3.forceCenter(this.width/2, this.height/2))
            .force('collide', d3.forceCollide().radius(d => this.getRadius(d)+4))
            .force('link', d3.forceLink(this.links).id(d => d.id).strength(0.2));

        this.linkElements = this.g.append('g').selectAll('line').data(this.links).join('line')
            .attr('stroke', '#30363d').attr('stroke-width', 1).attr('opacity', 0.3);

        this.nodeElements = this.g.append('g').selectAll('g').data(this.nodes).join('g')
            .call(d3.drag().on('start', (e,d)=>{ if(!e.active)this.simulation.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
            .on('drag', (e,d)=>{ d.fx=e.x; d.fy=e.y; }).on('end', (e,d)=>{ if(!e.active)this.simulation.alphaTarget(0); d.fx=null; d.fy=null; }))
            .on('click', (e,d)=>{ e.stopPropagation(); this.selectNode(d); });

        this.nodeElements.append('circle').attr('r', d => this.getRadius(d))
            .attr('fill', d => {
                const s = d.buffettScore;
                return s > 75 ? '#00c853' : (s > 40 ? '#ffd600' : '#ff3d00');
            }).attr('stroke', '#fff').attr('stroke-width', 1.5);

        this.nodeElements.append('text').text(d => d.id).attr('dy', '.35em').attr('text-anchor', 'middle')
            .attr('fill', '#000').style('font-size', '10px').style('font-weight', '800').style('pointer-events', 'none');

        this.simulation.on('tick', () => {
            if(this.viewMode === 'network') {
                this.linkElements.attr('x1', d=>d.source.x).attr('y1', d=>d.source.y).attr('x2', d=>d.target.x).attr('y2', d=>d.target.y);
                this.nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);
            }
        });
    },

    switchLayout(mode) {
        this.viewMode = mode;
        if(mode === 'heatmap') {
            this.simulation.stop();
            this.linkElements.attr('opacity', 0);
            const x = d3.scaleLinear().domain([0, 60]).range([100, this.width-100]).clamp(true);
            const y = d3.scaleLinear().domain([-10, 50]).range([this.height-100, 100]).clamp(true);
            this.nodeElements.transition().duration(1000).attr('transform', d => `translate(${x(d.raw_metrics.pe_ratio||0)}, ${y(d.raw_metrics.roic||0)})`);
        } else {
            this.linkElements.transition().attr('opacity', 0.3);
            this.simulation.alpha(1).restart();
        }
    },

    selectNode(d) {
        const connected = new Set([d.id]);
        this.links.forEach(l => { if(l.source.id===d.id) connected.add(l.target.id); if(l.target.id===d.id) connected.add(l.source.id); });
        this.nodeElements.transition().attr('opacity', n => connected.has(n.id) ? 1 : 0.1);
        this.linkElements.transition().attr('opacity', l => (l.source.id===d.id || l.target.id===d.id) ? 0.6 : 0.05);
        this.showSidebar(d);
    },

    resetFocus() {
        this.nodeElements.transition().attr('opacity', 1);
        this.linkElements.transition().attr('opacity', 0.3);
    },

    showSidebar(d) {
        d3.select('#sidebar').classed('visible', true);
        d3.select('#det-ticker').text(d.id);
        d3.select('#det-name').text(d.name);
        
        // OVERVIEW TAB
        const ov = d3.select('#overview-metrics').html('');
        const m = d.raw_metrics;
        ov.append('div').style('display','grid').style('grid-template-columns','1fr 1fr').style('gap','10px').html(`
            <div class="metric-card"><div class="m-label">PRICE</div><div class="m-val">$${m.current_price}</div></div>
            <div class="metric-card"><div class="m-label">FAIR VALUE</div><div class="m-val" style="color:${m.margin_of_safety>0?'#00c853':'#ff3d00'}">$${m.fair_value}</div></div>
            <div class="metric-card"><div class="m-label">ROIC</div><div class="m-val">${m.roic.toFixed(1)}%</div></div>
            <div class="metric-card"><div class="m-label">ROE</div><div class="m-val">${m.roe.toFixed(1)}%</div></div>
            <div class="metric-card"><div class="m-label">DEBT/EQ</div><div class="m-val">${m.debt_to_equity.toFixed(2)}</div></div>
            <div class="metric-card"><div class="m-label">CAGR (3Y)</div><div class="m-val">${m.revenue_cagr.toFixed(1)}%</div></div>
        `);

        // CHARTS TAB - The requested "Graph metrics against timeline"
        this.renderHistoryChart('#chart-growth', d.history, ['revenue', 'net_income']);
        this.renderHistoryChart('#chart-fcf', d.history, ['fcf']);
    },

    renderHistoryChart(containerId, history, keys) {
        const container = d3.select(containerId);
        container.html(''); // Clear
        
        const w = container.node().clientWidth, h = 250;
        const margin = {top: 20, right: 30, bottom: 30, left: 40};
        const svg = container.append('svg').attr('width', w).attr('height', h)
            .append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        
        // Prepare Data
        // Assumes all keys share the same dates. Use the first key for X axis.
        const data = history[keys[0]]; 
        if(!data || data.length < 2) {
            svg.append('text').text('Insufficient Data').attr('x', w/2).attr('y', h/2).attr('fill', '#666');
            return;
        }

        const x = d3.scalePoint().domain(data.map(d => d.date)).range([0, w - margin.left - margin.right]);
        
        // Find min/max across all requested keys
        let allVals = [];
        keys.forEach(k => { if(history[k]) allVals = allVals.concat(history[k].map(d => d.value)); });
        const y = d3.scaleLinear().domain([Math.min(0, ...allVals), Math.max(...allVals)]).nice().range([h - margin.top - margin.bottom, 0]);

        // Axes
        svg.append('g').attr('transform', `translate(0,${y(0)})`).call(d3.axisBottom(x).tickSize(0).tickPadding(10)).attr('color', '#444');
        svg.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => d/1e9 + 'B')).attr('color', '#444');
        
        // Grid
        svg.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-(w-margin.left-margin.right)).tickFormat(''));

        // Lines
        const colors = ['#0079fd', '#00c853', '#ffd600'];
        keys.forEach((key, i) => {
            if(!history[key]) return;
            const line = d3.line().x(d => x(d.date)).y(d => y(d.value)).curve(d3.curveMonotoneX);
            
            svg.append('path').datum(history[key])
                .attr('fill', 'none').attr('stroke', colors[i]).attr('stroke-width', 2)
                .attr('d', line);
                
            // Legend
            svg.append('text').attr('x', 10 + (i*80)).attr('y', -5)
                .text(key.toUpperCase().replace('_', ' '))
                .attr('fill', colors[i]).style('font-size', '10px').style('font-weight', 'bold');
        });
    },

    getRadius(d) { return Math.max(15, Math.log10(d.marketCap || 1e9) * 4); },
    handleSearch(t) { /* ... */ }
};

document.addEventListener('DOMContentLoaded', () => app.init());
