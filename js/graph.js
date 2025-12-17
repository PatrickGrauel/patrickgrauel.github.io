const app = {
    svg: null,
    g: null,
    simulation: null,
    nodes: [],
    links: [],
    industryColors: {
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
        this.svg = d3.select('#main-svg');
        this.g = this.svg.append('g');
        
        const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', (e) => this.g.attr('transform', e.transform));
        this.svg.call(zoom);
        this.currentZoom = zoom;
        
        this.svg.on('click', (e) => {
            if (e.target.tagName === 'svg') {
                this.resetHighlight();
                d3.select('#sidebar').classed('hidden', true);
            }
        });
    },

    setupControls() {
        // Search
        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value));
        
        // Leaderboard Toggle
        const btn = document.getElementById('btn-leaderboard');
        const lb = document.getElementById('leaderboard');
        btn.addEventListener('click', () => {
            const isVis = lb.classList.toggle('visible');
            btn.classList.toggle('active', isVis);
        });
    },
    
    loadData() {
        d3.json('data/graph_data.json').then(data => {
            this.nodes = data.nodes;
            this.links = data.links || [];
            this.industryAverages = data.industry_averages || {};
            this.renderGraph();
            this.renderLeaderboard();
            this.populateTickerList();
        });
    },
    
    renderGraph() {
        const width = this.svg.node().clientWidth, height = this.svg.node().clientHeight;
        
        this.simulation = d3.forceSimulation(this.nodes)
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width/2, height/2))
            .force('collide', d3.forceCollide().radius(d => this.getNodeRadius(d) + 5))
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(100));

        const link = this.g.append('g').selectAll('line')
            .data(this.links).join('line')
            .attr('stroke', '#30363d').attr('stroke-width', d => Math.max(0.5, (d.value||0)*2)).attr('opacity', 0.6);

        const nodeGroup = this.g.append('g').selectAll('g')
            .data(this.nodes).join('g')
            .call(this.drag(this.simulation))
            .on('click', (e, d) => { e.stopPropagation(); this.showDetails(d); this.highlightNode(d.id); });

        nodeGroup.append('circle')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => this.industryColors[d.sector] || '#555')
            .attr('stroke', '#fff').attr('stroke-width', 1.5).style('cursor', 'pointer');

        nodeGroup.append('text')
            .text(d => d.id).attr('text-anchor', 'middle').attr('dy', '.35em')
            .attr('font-size', d => Math.min(12, this.getNodeRadius(d)/2.5))
            .attr('fill', '#fff').style('pointer-events', 'none').style('font-weight', 'bold');

        this.simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
        });
        this.nodeElements = nodeGroup;
    },

    // --- LEADERBOARD LOGIC ---
    renderLeaderboard() {
        const sorted = [...this.nodes].sort((a,b) => b.buffettScore - a.buffettScore);
        const list = d3.select('#lb-list');
        list.html('');

        sorted.forEach((n, i) => {
            const row = list.append('div').attr('class', 'lb-row')
                .on('click', () => {
                    this.showDetails(n);
                    this.highlightNode(n.id);
                    this.focusOnNode(n);
                });
            
            row.append('div').attr('class', 'lb-rank').text(i + 1);
            const info = row.append('div').attr('class', 'lb-info');
            info.append('span').attr('class', 'lb-ticker').text(n.id);
            info.append('span').attr('class', 'lb-name').text(n.name.substring(0, 20));
            
            const scoreClass = n.buffettScore >= 70 ? '#00c853' : n.buffettScore >= 40 ? '#ffd600' : '#ff3d00';
            row.append('div').attr('class', 'lb-score')
                .style('color', scoreClass)
                .text(n.buffettScore);
        });
    },

    // --- CHARTING LOGIC ---
    renderLineChart(containerId, data, indAvg, label, suffix='%') {
        const container = d3.select(containerId);
        const w = 340, h = 100, margin = {top: 5, right: 10, bottom: 20, left: 30};
        
        container.append('div').attr('class', 'chart-label')
            .html(`<span>${label}</span> <span style="color:var(--accent)">Current: ${data[data.length-1]?.value.toFixed(1)}${suffix}</span>`);

        const svg = container.append('svg').attr('width', w).attr('height', h);
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        
        const innerW = w - margin.left - margin.right;
        const innerH = h - margin.top - margin.bottom;

        // Scales
        const x = d3.scalePoint().domain(data.map(d => d.date)).range([0, innerW]);
        
        // Y Domain: Include stock history AND industry average
        const yMin = Math.min(d3.min(data, d => d.value), indAvg) * 0.9;
        const yMax = Math.max(d3.max(data, d => d.value), indAvg) * 1.1;
        const y = d3.scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

        // Industry Line (Dashed)
        g.append('line')
            .attr('x1', 0).attr('x2', innerW)
            .attr('y1', y(indAvg)).attr('y2', y(indAvg))
            .attr('class', 'line-industry');
        
        // Stock Line
        const line = d3.line().x(d => x(d.date)).y(d => y(d.value));
        g.append('path').datum(data).attr('class', 'line-stock').attr('d', line);

        // Axes
        g.append('g').attr('class', 'axis').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(5));
        g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(4));
        
        // Industry Label
        g.append('text').attr('x', innerW).attr('y', y(indAvg) - 4)
            .attr('text-anchor', 'end').attr('fill', '#8b949e').attr('font-size', '10px')
            .text(`Ind. Avg: ${indAvg.toFixed(1)}${suffix}`);
    },

    showDetails(stock) {
        d3.select('#sidebar').classed('hidden', false);
        d3.select('#det-ticker').text(stock.id);
        d3.select('#det-name').text(stock.name);
        d3.select('#det-sector').text(stock.sector);
        
        const sEl = d3.select('#det-score');
        sEl.text(stock.buffettScore)
           .attr('class', `score-lg ${stock.buffettScore >= 70 ? 'good' : stock.buffettScore >= 40 ? 'mid' : 'bad'}`);

        // 1. Radar
        this.renderRadarChart(stock);

        // 2. Charts
        const charts = d3.select('#charts-container');
        charts.html(''); // Clear previous
        
        const ind = this.industryAverages[stock.industry] || {};
        const hist = stock.history || {};

        if (hist.gross_margin && hist.gross_margin.length > 0) {
            charts.append('div').attr('class', 'chart-container').attr('id', 'chart-gm');
            this.renderLineChart('#chart-gm', hist.gross_margin, ind.gross_margin || 0, 'Gross Margin Trend');
        }
        
        if (hist.net_margin && hist.net_margin.length > 0) {
            charts.append('div').attr('class', 'chart-container').attr('id', 'chart-nm');
            this.renderLineChart('#chart-nm', hist.net_margin, ind.net_margin || 0, 'Net Margin Trend'); // Changed from ind.gross_margin to ind.net_margin
        }

        if (hist.roe && hist.roe.length > 0) {
            charts.append('div').attr('class', 'chart-container').attr('id', 'chart-roe');
            this.renderLineChart('#chart-roe', hist.roe, ind.roe || 0, 'ROE Trend');
        }
    },

    // Utilities
    getNodeRadius(d) { return Math.max(20, Math.log10(d.marketCap || 1e9) * 3); },
    renderRadarChart(stock) { /* Keep previous simple radar logic */ }, // Truncated for brevity, use previous file's logic or simple placeholder
    handleSearch(term) {
        if(!term) { this.resetHighlight(); return; }
        const match = this.nodes.find(n => n.id.includes(term.toUpperCase()));
        if(match) {
            this.highlightNode(match.id);
            this.showDetails(match);
            this.focusOnNode(match);
        }
    },
    focusOnNode(node) {
        const t = d3.zoomIdentity.translate(
            (this.svg.node().clientWidth/2) - node.x, 
            (this.svg.node().clientHeight/2) - node.y
        );
        this.svg.transition().duration(750).call(this.currentZoom.transform, t);
    },
    highlightNode(id) {
        this.nodeElements.attr('opacity', d => d.id === id ? 1 : 0.2);
    },
    resetHighlight() { this.nodeElements.attr('opacity', 1); },
    populateTickerList() { d3.select('#tickers').selectAll('option').data(this.nodes).enter().append('option').attr('value', d => d.id); },
    drag(sim) {
        return d3.drag()
            .on('start', (e) => { if(!e.active) sim.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; })
            .on('drag', (e) => { e.subject.fx = e.x; e.subject.fy = e.y; })
            .on('end', (e) => { if(!e.active) sim.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; });
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
