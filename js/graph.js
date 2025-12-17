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
        
        // Leaderboard UI
        const btn = document.getElementById('btn-leaderboard');
        const close = document.getElementById('lb-close');
        const lb = document.getElementById('leaderboard');
        
        btn.addEventListener('click', () => lb.classList.add('visible'));
        close.addEventListener('click', () => lb.classList.remove('visible'));
    },
    
    loadData() {
        d3.json('data/graph_data.json')
            .then(data => {
                this.nodes = data.nodes;
                this.links = data.links || [];
                this.industryAverages = data.industry_averages || {};
                
                // Hide Loader
                d3.select('#loader').classed('done', true);

                this.renderGraph();
                this.setupLeaderboardFilters();
                this.renderLeaderboard('all');
                this.populateTickerList();
            })
            .catch(err => {
                console.error("Data Load Error:", err);
                d3.select('#loader').html('<div style="color:red">Failed to load data.<br>Check console.</div>');
            });
    },
    
    renderGraph() {
        const width = this.svg.node().clientWidth, height = this.svg.node().clientHeight;
        
        // RELAXED FORCES to fix "Disconnected" look
        this.simulation = d3.forceSimulation(this.nodes)
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width/2, height/2))
            .force('collide', d3.forceCollide().radius(d => this.getNodeRadius(d) + 8))
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(120).strength(0.3));

        const link = this.g.append('g').selectAll('line')
            .data(this.links).join('line')
            .attr('stroke', '#30363d').attr('stroke-width', 1).attr('opacity', 0.4);

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
    setupLeaderboardFilters() {
        const sectors = [...new Set(this.nodes.map(n => n.sector))].sort();
        const container = d3.select('#lb-filters');
        
        sectors.forEach(s => {
            container.append('button').attr('class', 'filter-btn')
                .text(s).on('click', function() {
                    d3.selectAll('.filter-btn').classed('active', false);
                    d3.select(this).classed('active', true);
                    app.renderLeaderboard(s);
                });
        });
        
        // "All" button logic handled in HTML default, but need click handler re-bind if you want
        d3.select('.filter-btn[data-sector="all"]').on('click', function() {
            d3.selectAll('.filter-btn').classed('active', false);
            d3.select(this).classed('active', true);
            app.renderLeaderboard('all');
        });
    },

    renderLeaderboard(sectorFilter) {
        let filtered = this.nodes;
        if(sectorFilter !== 'all') {
            filtered = this.nodes.filter(n => n.sector === sectorFilter);
        }
        const sorted = filtered.sort((a,b) => b.buffettScore - a.buffettScore);
        
        const list = d3.select('#lb-list');
        list.html('');

        if(sorted.length === 0) {
            list.html('<div style="padding:20px; text-align:center; color:#666">No stocks found in this sector</div>');
            return;
        }

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
            info.append('span').attr('class', 'lb-name').text(n.name.substring(0, 25));
            
            const scoreClass = n.buffettScore >= 70 ? '#00c853' : n.buffettScore >= 40 ? '#ffd600' : '#ff3d00';
            row.append('div').attr('class', 'lb-score')
                .style('color', scoreClass)
                .text(n.buffettScore);
        });
    },

    // --- DETAILS & CHARTING ---
    showDetails(stock) {
        d3.select('#sidebar').classed('hidden', false);
        d3.select('#det-ticker').text(stock.id);
        d3.select('#det-name').text(stock.name);
        d3.select('#det-sector').text(stock.sector);
        
        const sEl = d3.select('#det-score');
        sEl.text(stock.buffettScore)
           .attr('class', `score-lg ${stock.buffettScore >= 70 ? 'good' : stock.buffettScore >= 40 ? 'mid' : 'bad'}`);

        this.renderRadarChart(stock);
        
        // RENDER METRICS BLOCKS + CHARTS
        const container = d3.select('#metrics-container');
        container.html('');
        
        const ind = this.industryAverages[stock.industry] || {};
        const hist = stock.history || {};

        // Helper to create a block
        const addBlock = (label, key, suffix='%', histKey=null) => {
            const val = stock.metrics[key];
            if(val === undefined) return;

            const block = container.append('div').attr('class', 'metric-block');
            
            // 1. Text Value
            const head = block.append('div').attr('class', 'mb-head');
            head.append('span').text(label);
            head.append('span').text(`Avg: ${(ind[key]||0).toFixed(1)}${suffix}`);
            
            block.append('div').attr('class', 'mb-val').text(`${val.toFixed(1)}${suffix}`);

            // 2. Chart (if history exists)
            if(histKey && hist[histKey] && hist[histKey].length > 0) {
                const chartDiv = block.append('div').attr('class', 'mini-chart');
                // Use a unique ID for the chart div
                const chartId = `chart-${key}-${stock.id}`;
                chartDiv.attr('id', chartId);
                
                this.renderLineChart(`#${chartId}`, hist[histKey], ind[key]||0);
            }
        };

        addBlock('Gross Margin', 'gross_margin', '%', 'gross_margin');
        addBlock('Net Margin', 'net_margin', '%', 'net_margin');
        addBlock('ROE', 'roe', '%', 'roe');
        addBlock('Debt/Equity', 'debt_to_equity', '');
        addBlock('P/E Ratio', 'pe_ratio', '');
    },

    renderLineChart(containerId, data, indAvg) {
        const container = d3.select(containerId);
        const w = container.node().clientWidth, h = 80;
        const margin = {top: 5, right: 0, bottom: 5, left: 0};
        
        const svg = container.append('svg').attr('width', w).attr('height', h);
        
        // X Scale
        const x = d3.scalePoint().domain(data.map(d => d.date)).range([0, w]);
        
        // Y Scale (Include Industry Avg in domain)
        const vals = data.map(d => d.value);
        const yMin = Math.min(...vals, indAvg) * 0.9;
        const yMax = Math.max(...vals, indAvg) * 1.1;
        const y = d3.scaleLinear().domain([yMin, yMax]).range([h, 0]);

        // Industry Line
        svg.append('line')
            .attr('x1', 0).attr('x2', w)
            .attr('y1', y(indAvg)).attr('y2', y(indAvg))
            .attr('class', 'line-industry');

        // Stock Line
        const line = d3.line().x(d => x(d.date)).y(d => y(d.value)).curve(d3.curveMonotoneX);
        svg.append('path').datum(data).attr('class', 'line-stock').attr('d', line);
        
        // Add Dots
        svg.selectAll('circle').data(data).enter().append('circle')
            .attr('cx', d => x(d.date)).attr('cy', d => y(d.value))
            .attr('r', 2).attr('fill', '#0079fd');
    },

    // Utilities
    getNodeRadius(d) { return Math.max(20, Math.log10(d.marketCap || 1e9) * 3); },
    renderRadarChart(stock) {
         // Re-using the simple radar logic
         const container = d3.select('#radar-container');
         container.html('');
         const width = 200, height = 200;
         const svg = container.append('svg').attr('width', width).attr('height', height);
         const m = stock.metrics;
         const data = [
             {axis: "Margins", value: Math.min(1, m.gross_margin / 60)},
             {axis: "Returns", value: Math.min(1, m.roe / 30)},
             {axis: "Safety", value: Math.min(1, 1 / (m.debt_to_equity + 0.1))},
             {axis: "Cash", value: Math.min(1, m.fcf_margin / 25)},
             {axis: "Eff", value: Math.min(1, m.roic / 20)}
         ];
         const r = 80; const center = {x: width/2, y: height/2}; const angleSlice = (Math.PI*2)/data.length;
         for(let level=1; level<=4; level++) {
             svg.append('circle').attr('cx', center.x).attr('cy', center.y).attr('r', r*(level/4)).attr('fill', 'none').attr('stroke', '#30363d');
         }
         const linePath = d3.line().x((d,i)=>center.x+(r*d.value*Math.cos(angleSlice*i-Math.PI/2))).y((d,i)=>center.y+(r*d.value*Math.sin(angleSlice*i-Math.PI/2)));
         const pathData = [...data, data[0]];
         svg.append('path').datum(pathData).attr('d', linePath).attr('fill', 'rgba(0,121,253,0.3)').attr('stroke', '#0079fd').attr('stroke-width', 2);
    },
    handleSearch(term) {
        if(!term) { this.resetHighlight(); return; }
        const match = this.nodes.find(n => n.id.includes(term.toUpperCase()));
        if(match) { this.highlightNode(match.id); this.showDetails(match); this.focusOnNode(match); }
    },
    focusOnNode(node) {
        const t = d3.zoomIdentity.translate((this.svg.node().clientWidth/2)-node.x, (this.svg.node().clientHeight/2)-node.y);
        this.svg.transition().duration(750).call(this.currentZoom.transform, t);
    },
    highlightNode(id) { this.nodeElements.attr('opacity', d => d.id === id ? 1 : 0.1); },
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
