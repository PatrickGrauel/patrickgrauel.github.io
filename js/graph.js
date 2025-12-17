const app = {
    svg: null,
    g: null,
    simulation: null,
    nodes: [],
    links: [],
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
        'Basic Materials': '#8b4513'
    },
    
    init() {
        this.setupSVG();
        this.loadData();
        this.setupSearch();
    },
    
    setupSVG() {
        this.svg = d3.select('#main-svg');
        const container = d3.select('#graph-container');
        
        // Group for content
        this.g = this.svg.append('g');
        
        // Zoom Logic
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });
        
        this.svg.call(zoom);
        this.currentZoom = zoom;
        
        // Background click clears selection
        this.svg.on('click', (e) => {
            if (e.target.tagName === 'svg') {
                this.resetHighlight();
                d3.select('#sidebar').classed('hidden', true); // Optional: hide sidebar
            }
        });
    },
    
    loadData() {
        d3.json('data/graph_data.json')
            .then(data => {
                this.nodes = data.nodes;
                this.links = data.links || [];
                this.industryAverages = data.industry_averages || {};
                
                this.renderGraph();
                this.populateTickerList();
            })
            .catch(err => console.error("Data load failed:", err));
    },
    
    renderGraph() {
        const width = this.svg.node().clientWidth;
        const height = this.svg.node().clientHeight;
        
        // SIMULATION SETUP
        this.simulation = d3.forceSimulation(this.nodes)
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(d => this.getNodeRadius(d) + 5))
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(100));

        // DRAW LINKS
        const link = this.g.append('g')
            .selectAll('line')
            .data(this.links)
            .join('line')
            .attr('stroke', '#30363d')
            .attr('stroke-width', d => Math.max(0.5, (d.value || 0) * 2))
            .attr('opacity', 0.6);

        // DRAW NODES
        const nodeGroup = this.g.append('g')
            .selectAll('g')
            .data(this.nodes)
            .join('g')
            .call(this.drag(this.simulation));

        // Node Circles
        nodeGroup.append('circle')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => this.industryColors[d.sector] || '#555')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .style('cursor', 'pointer');

        // Node Labels (Text)
        nodeGroup.append('text')
            .text(d => d.id)
            .attr('text-anchor', 'middle')
            .attr('dy', '.35em')
            .attr('font-size', d => Math.min(12, this.getNodeRadius(d)/2.5))
            .attr('fill', '#fff')
            .style('pointer-events', 'none')
            .style('font-weight', 'bold');

        // EVENTS
        // Note: Using 'click' for mobile/desktop unification
        nodeGroup.on('click', (event, d) => {
            event.stopPropagation(); // Stop background click
            this.showDetails(d);
            this.highlightNode(d.id);
        });

        // HOVER (Desktop only enhancement)
        nodeGroup.on('mouseover', (event, d) => {
            this.showTooltip(event, d);
        }).on('mouseout', () => {
            this.hideTooltip();
        });

        // TICK
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            
            nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        this.nodeElements = nodeGroup; // Save for highlighting
    },
    
    getNodeRadius(d) {
        // Log scale for Market Cap
        const cap = d.marketCap || 1e9;
        return Math.max(20, Math.log10(cap) * 3); 
    },

    showDetails(stock) {
        // Reveal Sidebar
        d3.select('#sidebar').classed('hidden', false);
        d3.select('#state-empty').style('display', 'none');
        d3.select('#state-details').style('display', 'block');

        // Header Data
        d3.select('#det-ticker').text(stock.id);
        d3.select('#det-name').text(stock.name);
        d3.select('#det-sector').text(stock.sector);
        d3.select('#det-industry').text(stock.industry);
        
        const scoreEl = d3.select('#det-score');
        scoreEl.text(stock.buffettScore);
        scoreEl.attr('class', `score-lg ${stock.buffettScore >= 70 ? 'good' : stock.buffettScore >= 40 ? 'mid' : 'bad'}`);

        // Render Sub-components
        this.renderRadarChart(stock);
        this.renderMetrics(stock);
    },

    renderRadarChart(stock) {
        // Simple 5-axis radar
        const container = d3.select('#radar-container');
        container.html(''); // Clear

        const width = 200, height = 200;
        const svg = container.append('svg').attr('width', width).attr('height', height);
        
        // Define Axes based on Normalized Metrics (0-1)
        const m = stock.metrics;
        const data = [
            {axis: "Margins", value: Math.min(1, m.gross_margin / 60)},
            {axis: "Returns", value: Math.min(1, m.roe / 30)},
            {axis: "Safety", value: Math.min(1, 1 / (m.debt_to_equity + 0.1))}, // Inverse debt
            {axis: "Cash", value: Math.min(1, m.fcf_margin / 25)},
            {axis: "Eff", value: Math.min(1, m.roic / 20)}
        ];

        const r = 80;
        const center = {x: width/2, y: height/2};
        const angleSlice = (Math.PI * 2) / data.length;

        // Draw Web
        for(let level=1; level<=4; level++) {
            svg.append('circle')
                .attr('cx', center.x).attr('cy', center.y)
                .attr('r', r * (level/4))
                .attr('fill', 'none').attr('stroke', '#30363d');
        }

        // Draw Path
        const linePath = d3.line()
            .x((d, i) => center.x + (r * d.value * Math.cos(angleSlice*i - Math.PI/2)))
            .y((d, i) => center.y + (r * d.value * Math.sin(angleSlice*i - Math.PI/2)));
        
        // Close the loop
        const pathData = [...data, data[0]]; 
        
        svg.append('path')
            .datum(pathData)
            .attr('d', linePath)
            .attr('fill', 'rgba(0, 121, 253, 0.3)')
            .attr('stroke', '#0079fd')
            .attr('stroke-width', 2);
    },

    renderMetrics(stock) {
        const container = d3.select('#metrics-list');
        container.html(''); // Clear
        
        const ind = this.industryAverages[stock.industry] || {};

        const createCard = (label, key, suffix='', inverse=false) => {
            const val = stock.metrics[key];
            if (val === undefined) return;
            
            const card = container.append('div').attr('class', 'metric-card');
            const head = card.append('div').attr('class', 'm-header');
            head.append('span').text(label);
            
            card.append('div').attr('class', 'm-value').text(val + suffix);

            // Comparison Bar
            if (ind[key]) {
                const avg = ind[key];
                const max = Math.max(val, avg) * 1.2;
                
                // If inverse (e.g. debt), lower is better (Green)
                const isGood = inverse ? val < avg : val > avg;
                const color = isGood ? '#00c853' : '#ff3d00';
                
                const barBox = card.append('div').attr('class', 'comp-bar-container');
                barBox.append('div').attr('class', 'comp-bar')
                    .style('width', `${(val/max)*100}%`)
                    .style('background', color);
                
                // Marker for Industry Avg
                barBox.append('div').attr('class', 'comp-marker')
                    .style('left', `${(avg/max)*100}%`);
            }
        };

        container.append('div').attr('class', 'section-header').text('Profitability');
        createCard('Gross Margin', 'gross_margin', '%');
        createCard('Net Margin', 'net_margin', '%');
        
        container.append('div').attr('class', 'section-header').style('margin-top','15px').text('Health');
        createCard('Debt/Equity', 'debt_to_equity', '', true);
        createCard('ROE', 'roe', '%');
        
        container.append('div').attr('class', 'section-header').style('margin-top','15px').text('Value');
        createCard('FCF Margin', 'fcf_margin', '%');
        createCard('P/E Ratio', 'pe_ratio');
    },

    highlightNode(id) {
        this.resetHighlight();
        this.nodeElements.attr('opacity', d => d.id === id ? 1 : 0.2);
    },

    resetHighlight() {
        this.nodeElements.attr('opacity', 1);
    },

    setupSearch() {
        const input = document.getElementById('search-input');
        input.addEventListener('input', (e) => {
            const term = e.target.value.toUpperCase();
            if (!term) { this.resetHighlight(); return; }

            // Fuzzy Find
            const match = this.nodes.find(n => n.id.includes(term) || n.name.toUpperCase().includes(term));
            
            if (match) {
                this.highlightNode(match.id);
                this.showDetails(match);
                // Center view
                const transform = d3.zoomIdentity.translate(
                    (this.svg.node().clientWidth/2) - match.x, 
                    (this.svg.node().clientHeight/2) - match.y
                );
                this.svg.transition().duration(750).call(this.currentZoom.transform, transform);
            }
        });
    },

    populateTickerList() {
        const dl = d3.select('#tickers');
        this.nodes.forEach(n => dl.append('option').attr('value', n.id));
    },

    showTooltip(e, d) {
        const tt = d3.select('#tooltip');
        tt.style('opacity', 1)
          .style('left', (e.pageX + 15) + 'px')
          .style('top', (e.pageY - 15) + 'px')
          .html(`<strong>${d.id}</strong><br>Score: ${d.buffettScore}`);
    },
    
    hideTooltip() {
        d3.select('#tooltip').style('opacity', 0);
    },

    drag(sim) {
        return d3.drag()
            .on('start', (e) => { if(!e.active) sim.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; })
            .on('drag', (e) => { e.subject.fx = e.x; e.subject.fy = e.y; })
            .on('end', (e) => { if(!e.active) sim.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; });
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
