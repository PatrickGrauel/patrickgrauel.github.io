const app = {
    svg: null,
    g: null,
    simulation: null,
    nodes: [],
    links: [],
    // Industry Color Palette
    industryColors: {
        'Technology': '#00d4ff', 
        'Communication Services': '#ff6b9d', 
        'Consumer Cyclical': '#ffa500',
        'Consumer Defensive': '#32cd32', 
        'Financial Services': '#ffd700', 
        'Healthcare': '#ff1493',
        'Industrials': '#4169e1', 
        'Energy': '#dc143c', 
        'Utilities': '#9370db', 
        'Basic Materials': '#8b4513',
        'Real Estate': '#00b894'
    },
    
    init() {
        this.setupSVG();
        this.setupControls();
        this.loadData();
    },
    
    setupSVG() {
        this.svg = d3.select('#main-svg');
        this.g = this.svg.append('g');
        
        // Zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 8])
            .on('zoom', (e) => this.g.attr('transform', e.transform));
            
        this.svg.call(zoom);
        this.currentZoom = zoom;
        
        // Click background to close sidebar
        this.svg.on('click', (e) => {
            if (e.target.tagName === 'svg') {
                this.resetHighlight();
                d3.select('#sidebar').classed('hidden', true);
            }
        });
    },

    setupControls() {
        // Search Input
        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value));
        
        // Leaderboard Toggle
        const btn = document.getElementById('btn-leaderboard');
        const close = document.getElementById('lb-close');
        const lb = document.getElementById('leaderboard');
        
        if (btn && lb) {
            btn.addEventListener('click', () => lb.classList.add('visible'));
            if(close) close.addEventListener('click', () => lb.classList.remove('visible'));
        }
    },
    
    loadData() {
        // Add timestamp to prevent caching
        d3.json('data/graph_data.json?v=' + new Date().getTime())
            .then(data => {
                this.nodes = data.nodes || [];
                this.links = data.links || [];
                this.industryAverages = data.industry_averages || {};
                
                // Hide Loader
                d3.select('#loader').classed('done', true);
                
                if (this.nodes.length === 0) {
                    console.error("No nodes found in data");
                    return;
                }

                this.renderGraph();
                this.setupLeaderboardFilters();
                this.renderLeaderboard('all');
                this.populateTickerList();
            })
            .catch(err => {
                console.error("Data Load Error:", err);
                d3.select('#loader').html('<div style="color:#ff3d00; text-align:center">Data Load Error<br>Check Console</div>');
            });
    },
    
    renderGraph() {
        const container = d3.select('#graph-container');
        const width = container.node().clientWidth;
        const height = container.node().clientHeight;
        
        // Force Simulation
        this.simulation = d3.forceSimulation(this.nodes)
            .force('charge', d3.forceManyBody().strength(-120))
            .force('center', d3.forceCenter(width/2, height/2))
            .force('collide', d3.forceCollide().radius(d => this.getNodeRadius(d) + 4).iterations(2))
            .force('x', d3.forceX(width/2).strength(0.08))
            .force('y', d3.forceY(height/2).strength(0.08))
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(80).strength(0.4));

        // Draw Links
        const link = this.g.append('g').selectAll('line')
            .data(this.links).join('line')
            .attr('stroke', '#30363d')
            .attr('stroke-width', 1)
            .attr('opacity', 0.3);

        // Draw Nodes
        const nodeGroup = this.g.append('g').selectAll('g')
            .data(this.nodes).join('g')
            .call(this.drag(this.simulation))
            .on('click', (e, d) => { e.stopPropagation(); this.showDetails(d); this.highlightNode(d.id); });

        // High Score Glow
        nodeGroup.filter(d => d.buffettScore >= 70).append('circle')
            .attr('r', d => this.getNodeRadius(d) + 3)
            .attr('fill', 'none')
            .attr('stroke', '#00c853')
            .attr('stroke-width', 1)
            .attr('opacity', 0.5);

        // Node Circle
        nodeGroup.append('circle')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => this.industryColors[d.sector] || '#555')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .style('cursor', 'pointer');

        // Node Label
        nodeGroup.append('text')
            .text(d => d.id)
            .attr('text-anchor', 'middle')
            .attr('dy', '.35em')
            .attr('font-size', d => Math.min(11, this.getNodeRadius(d)/2))
            .attr('fill', '#fff')
            .style('pointer-events', 'none')
            .style('font-weight', '700');

        // Simulation Tick
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            
            nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
        });
        
        this.nodeElements = nodeGroup;
    },

    // --- LEADERBOARD ---
    setupLeaderboardFilters() {
        const sectors = [...new Set(this.nodes.map(n => n.sector))].filter(Boolean).sort();
        const container = d3.select('#lb-filters');
        container.html(''); // Clear existing
        
        // "All" Button
        container.append('button')
            .attr('class', 'filter-btn active')
            .attr('data-sector', 'all')
            .text('All Sectors')
            .on('click', function() {
                d3.selectAll('.filter-btn').classed('active', false);
                d3.select(this).classed('active', true);
                app.renderLeaderboard('all');
            });
        
        // Sector Buttons
        sectors.forEach(s => {
            container.append('button').attr('class', 'filter-btn')
                .text(s).on('click', function() {
                    d3.selectAll('.filter-btn').classed('active', false);
                    d3.select(this).classed('active', true);
                    app.renderLeaderboard(s);
                });
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
            list.html('<div style="padding:40px; text-align:center; color:#555">No stocks found</div>');
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
            info.append('span').attr('class', 'lb-sector').text(n.name.substring(0, 24));
            
            const scoreClass = n.buffettScore >= 70 ? '#00c853' : n.buffettScore >= 40 ? '#ffd600' : '#ff3d00';
            row.append('div').attr('class', 'lb-score')
                .style('color', scoreClass)
                .text(n.buffettScore);
        });
    },

    // --- SIDEBAR DETAILS ---
    showDetails(stock) {
        d3.select('#sidebar').classed('hidden', false);
        d3.select('#det-ticker').text(stock.id);
        d3.select('#det-name').text(stock.name);
        
        const sEl = d3.select('#det-score');
        sEl.text(stock.buffettScore);
        sEl.attr('class', `score-val ${stock.buffettScore >= 70 ? 'good' : stock.buffettScore >= 40 ? 'mid' : 'bad'}`);

        const container = d3.select('#metrics-container');
        container.html('');
        
        const ind = this.industryAverages[stock.industry] || {};
        const hist = stock.historical || {};

        // Helper: Robust block renderer
        const addBlock = (label, key, suffix='%', histKey=null) => {
            const val = stock.metrics ? stock.metrics[key] : undefined;
            const block = container.append('div').attr('class', 'metric-block');
            
            // Header
            const head = block.append('div').attr('class', 'mb-head');
            head.append('span').text(label);
            
            const avgVal = ind[key];
            if(avgVal !== undefined && avgVal !== null) {
                head.append('span').text(`Ind: ${avgVal.toFixed(1)}${suffix}`);
            }

            // Value
            const displayVal = (val !== undefined && val !== null) ? `${val.toFixed(1)}${suffix}` : '--';
            block.append('div').attr('class', 'mb-val').text(displayVal);

            // Chart
            if(histKey && hist[histKey] && Array.isArray(hist[histKey])) {
                const cleanHist = hist[histKey].filter(d => d.value !== null && d.value !== undefined);
                if (cleanHist.length > 1) {
                    const chartDiv = block.append('div').attr('class', 'mini-chart');
                    const chartId = `chart-${key}-${stock.id.replace('.','-')}`;
                    chartDiv.attr('id', chartId);
                    this.renderSparkline(`#${chartId}`, cleanHist, avgVal || 0);
                }
            }
        };

        addBlock('Gross Margin', 'gross_margin', '%', 'gross_margin');
        addBlock('Net Margin', 'net_margin', '%', 'net_margin');
        addBlock('ROE', 'roe', '%', 'roe');
        addBlock('Debt / Equity', 'debt_to_equity', '', 'debt_to_equity');
    },

    renderSparkline(containerId, data, indAvg) {
        const container = d3.select(containerId);
        container.html(""); // Safety clear
        
        const w = container.node().clientWidth || 280;
        const h = 60;
        const svg = container.append('svg').attr('width', w).attr('height', h);
        
        // 1. FILTER: Remove nulls/NaNs (Critical fix for "Unexpected token N" issues)
        const validData = data.filter(d => d.value !== null && d.value !== undefined && !isNaN(d.value));
        
        if (validData.length < 2) return;

        // 2. SCALES
        const x = d3.scalePoint()
            .domain(validData.map(d => d.date))
            .range([5, w-5]).padding(0.1);
            
        const vals = validData.map(d => d.value);
        if(indAvg) vals.push(indAvg);
        
        // Add minimal padding to Y scale
        const yMin = Math.min(...vals);
        const yMax = Math.max(...vals);
        const yPadding = (yMax - yMin) * 0.1 || 1;
        
        const y = d3.scaleLinear()
            .domain([yMin - yPadding, yMax + yPadding])
            .range([h-5, 5]);

        // 3. DRAW
        // Industry Line
        if(indAvg) {
            svg.append('line')
                .attr('x1', 0).attr('x2', w)
                .attr('y1', y(indAvg)).attr('y2', y(indAvg))
                .attr('class', 'line-industry');
        }

        // Area (Gradient fill)
        const area = d3.area()
            .x(d => x(d.date))
            .y0(h)
            .y1(d => y(d.value))
            .curve(d3.curveMonotoneX);
            
        svg.append('path').datum(validData)
            .attr('d', area).attr('class', 'chart-bg')
            .attr('fill', 'rgba(0,121,253,0.1)');

        // Line
        const line = d3.line()
            .x(d => x(d.date))
            .y(d => y(d.value))
            .curve(d3.curveMonotoneX);
            
        svg.append('path').datum(validData)
            .attr('d', line).attr('class', 'line-stock');
            
        // Dots
        svg.selectAll('circle').data(validData).enter().append('circle')
            .attr('cx', d => x(d.date)).attr('cy', d => y(d.value))
            .attr('r', 3).attr('fill', '#0079fd').attr('stroke', '#161b22').attr('stroke-width', 1.5);
    },

    // Utils
    getNodeRadius(d) { return Math.max(18, Math.log10(d.marketCap || 1e9) * 3); },
    
    handleSearch(term) {
        if(!term) { this.resetHighlight(); return; }
        const match = this.nodes.find(n => n.id.includes(term.toUpperCase()));
        if(match) { this.highlightNode(match.id); this.showDetails(match); this.focusOnNode(match); }
    },
    
    focusOnNode(node) {
        const t = d3.zoomIdentity.translate(
            (this.svg.node().clientWidth/2) - node.x, 
            (this.svg.node().clientHeight/2) - node.y
        );
        this.svg.transition().duration(750).call(this.currentZoom.transform, t);
    },
    
    highlightNode(id) { 
        this.nodeElements.attr('opacity', d => d.id === id ? 1 : 0.15); 
    },
    
    resetHighlight() { 
        this.nodeElements.attr('opacity', 1); 
    },
    
    populateTickerList() { 
        const dl = d3.select('#tickers');
        dl.html('');
        this.nodes.forEach(n => dl.append('option').attr('value', n.id));
    },
    
    drag(sim) {
        return d3.drag()
            .on('start', (e) => { if(!e.active) sim.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; })
            .on('drag', (e) => { e.subject.fx = e.x; e.subject.fy = e.y; })
            .on('end', (e) => { if(!e.active) sim.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; });
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
