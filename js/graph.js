const app = {
    svg: null, g: null, simulation: null,
    nodes: [], links: [], industryColors: {},
    
    // Config
    colors: {
        'Technology': '#00d4ff', 'Communication Services': '#ff6b9d', 'Consumer Cyclical': '#ffa500',
        'Consumer Defensive': '#32cd32', 'Financial Services': '#ffd700', 'Healthcare': '#ff1493',
        'Industrials': '#4169e1', 'Energy': '#dc143c', 'Utilities': '#9370db', 'Basic Materials': '#8b4513',
        'Real Estate': '#00b894'
    },
    
    init() {
        this.industryColors = this.colors;
        this.setupSVG();
        this.setupControls();
        this.loadData();
    },
    
    setupSVG() {
        this.svg = d3.select('#main-svg');
        this.g = this.svg.append('g');
        
        // Zoom behavior
        const zoom = d3.zoom().scaleExtent([0.1, 8])
            .on('zoom', (e) => this.g.attr('transform', e.transform));
        this.svg.call(zoom);
        this.currentZoom = zoom;
        
        // Click bg to close sidebar
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
        
        // Leaderboard
        const btn = document.getElementById('btn-leaderboard');
        const close = document.getElementById('lb-close');
        const lb = document.getElementById('leaderboard');
        
        btn.addEventListener('click', () => lb.classList.add('visible'));
        close.addEventListener('click', () => lb.classList.remove('visible'));
    },
    
    loadData() {
        // Add timestamp to prevent caching
        d3.json('data/graph_data.json?v=' + new Date().getTime())
            .then(data => {
                this.nodes = data.nodes;
                this.links = data.links || [];
                this.industryAverages = data.industry_averages || {};
                
                d3.select('#loader').classed('done', true);
                this.renderGraph();
                this.setupLeaderboardFilters();
                this.renderLeaderboard('all');
                this.populateTickerList();
            })
            .catch(err => {
                console.error(err);
                d3.select('#loader').html('<div style="color:#ff3d00">Data Load Error<br>Check Console</div>');
            });
    },
    
    renderGraph() {
        const width = this.svg.node().clientWidth, height = this.svg.node().clientHeight;
        
        // STRONGER GRAVITY to fix disconnected look
        this.simulation = d3.forceSimulation(this.nodes)
            .force('charge', d3.forceManyBody().strength(-120)) // Less repulsion
            .force('center', d3.forceCenter(width/2, height/2))
            .force('collide', d3.forceCollide().radius(d => this.getNodeRadius(d) + 4).iterations(2))
            .force('x', d3.forceX(width/2).strength(0.08)) // Pull to center X
            .force('y', d3.forceY(height/2).strength(0.08)) // Pull to center Y
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(80).strength(0.4)); // Tighter links

        const link = this.g.append('g').selectAll('line')
            .data(this.links).join('line')
            .attr('stroke', '#30363d').attr('stroke-width', 1).attr('opacity', 0.3);

        const nodeGroup = this.g.append('g').selectAll('g')
            .data(this.nodes).join('g')
            .call(this.drag(this.simulation))
            .on('click', (e, d) => { e.stopPropagation(); this.showDetails(d); this.highlightNode(d.id); });

        // Outer glow for high scores
        nodeGroup.filter(d => d.buffettScore >= 70).append('circle')
            .attr('r', d => this.getNodeRadius(d) + 3)
            .attr('fill', 'none').attr('stroke', '#00c853').attr('stroke-width', 1).attr('opacity', 0.5);

        nodeGroup.append('circle')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => this.industryColors[d.sector] || '#555')
            .attr('stroke', '#fff').attr('stroke-width', 1.5).style('cursor', 'pointer');

        nodeGroup.append('text')
            .text(d => d.id).attr('text-anchor', 'middle').attr('dy', '.35em')
            .attr('font-size', d => Math.min(11, this.getNodeRadius(d)/2))
            .attr('fill', '#fff').style('pointer-events', 'none').style('font-weight', '700');

        this.simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
        });
        this.nodeElements = nodeGroup;
    },

    // --- LEADERBOARD ---
    setupLeaderboardFilters() {
        const sectors = [...new Set(this.nodes.map(n => n.sector))].filter(Boolean).sort();
        const container = d3.select('#lb-filters');
        
        sectors.forEach(s => {
            container.append('button').attr('class', 'filter-btn')
                .text(s).on('click', function() {
                    d3.selectAll('.filter-btn').classed('active', false);
                    d3.select(this).classed('active', true);
                    app.renderLeaderboard(s);
                });
        });
        
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
        const hist = stock.history || {};

        // Helper: Robust block renderer
        const addBlock = (label, key, suffix='%', histKey=null) => {
            // Get value safely
            const val = stock.metrics ? stock.metrics[key] : undefined;
            
            const block = container.append('div').attr('class', 'metric-block');
            
            // Header
            const head = block.append('div').attr('class', 'mb-head');
            head.append('span').text(label);
            
            const avgVal = ind[key];
            if(avgVal !== undefined) {
                head.append('span').text(`Ind: ${avgVal.toFixed(1)}${suffix}`);
            }

            // Value (Handle missing data)
            const displayVal = (val !== undefined && val !== null) ? `${val.toFixed(1)}${suffix}` : '--';
            block.append('div').attr('class', 'mb-val').text(displayVal);

            // Chart (Only if history exists AND has >1 point)
            if(histKey && hist[histKey] && hist[histKey].length > 1) {
                const chartDiv = block.append('div').attr('class', 'mini-chart');
                const chartId = `chart-${key}-${stock.id}`;
                chartDiv.attr('id', chartId);
                this.renderSparkline(`#${chartId}`, hist[histKey], avgVal || 0);
            }
        };

        addBlock('Gross Margin', 'gross_margin', '%', 'gross_margin');
        addBlock('Net Margin', 'net_margin', '%', 'net_margin');
        addBlock('ROE', 'roe', '%', 'roe');
        addBlock('Debt / Equity', 'debt_to_equity', '');
        addBlock('FCF Yield', 'fcf_margin', '%');
    },

    renderSparkline(containerId, data, indAvg) {
        const container = d3.select(containerId);
        const w = container.node().clientWidth, h = 60;
        const svg = container.append('svg').attr('width', w).attr('height', h);
        
        // Parse dates if they are strings "2023"
        const parseDate = (d) => parseInt(d);
        
        // Scales
        const x = d3.scalePoint()
            .domain(data.map(d => d.date))
            .range([0, w]).padding(0.1);
            
        const vals = data.map(d => d.value);
        if(indAvg) vals.push(indAvg);
        
        const yMin = Math.min(...vals) * 0.95;
        const yMax = Math.max(...vals) * 1.05;
        const y = d3.scaleLinear().domain([yMin, yMax]).range([h, 2]);

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
            
        svg.append('path').datum(data)
            .attr('d', area).attr('class', 'chart-bg');

        // Line
        const line = d3.line()
            .x(d => x(d.date))
            .y(d => y(d.value))
            .curve(d3.curveMonotoneX);
            
        svg.append('path').datum(data)
            .attr('d', line).attr('class', 'line-stock');
            
        // Dots
        svg.selectAll('circle').data(data).enter().append('circle')
            .attr('cx', d => x(d.date)).attr('cy', d => y(d.value))
            .attr('r', 2.5).attr('fill', '#0079fd').attr('stroke', '#161b22').attr('stroke-width', 1);
    },

    // Utils
    getNodeRadius(d) { return Math.max(18, Math.log10(d.marketCap || 1e9) * 3); },
    handleSearch(term) {
        if(!term) { this.resetHighlight(); return; }
        const match = this.nodes.find(n => n.id.includes(term.toUpperCase()));
        if(match) { this.highlightNode(match.id); this.showDetails(match); this.focusOnNode(match); }
    },
    focusOnNode(node) {
        const t = d3.zoomIdentity.translate((this.svg.node().clientWidth/2)-node.x, (this.svg.node().clientHeight/2)-node.y);
        this.svg.transition().duration(750).call(this.currentZoom.transform, t);
    },
    highlightNode(id) { this.nodeElements.attr('opacity', d => d.id === id ? 1 : 0.15); },
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
