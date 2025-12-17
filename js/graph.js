// Buffett Focus - Stock Network Analyzer
// D3.js Force-Directed Graph Implementation

const app = {
    svg: null,
    g: null,
    simulation: null,
    nodes: [],
    links: [],
    industryColors: {
        'Technology': '#00d4ff',
        'Communication Services': '#ff6b9d',
        'Comm Services': '#ff6b9d',
        'Consumer Cyclical': '#ffa500',
        'Consumer Disc': '#ffa500',
        'Consumer Defensive': '#32cd32',
        'Cons Staples': '#32cd32',
        'Financial Services': '#ffd700',
        'Financials': '#ffd700',
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
        const container = d3.select('#graph-container');
        const width = container.node().clientWidth;
        const height = container.node().clientHeight;
        
        this.svg = d3.select('#main-svg');
        this.g = this.svg.append('g');
        
        // Setup zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });
        
        this.svg.call(zoom);
        this.currentZoom = zoom;
        this.currentTransform = d3.zoomIdentity;
    },
    
    loadData() {
        d3.json('data/graph_data.json')
            .then(data => {
                console.log('Data loaded:', data);
                this.nodes = data.nodes;
                this.links = data.links || [];
                this.industryAverages = data.industry_averages || {};
                this.renderGraph();
                this.populateTickerList();
            })
            .catch(error => {
                console.error('Error loading data:', error);
                alert('Failed to load graph data. Please check the console for details.');
            });
    },
    
    renderGraph() {
        const width = this.svg.node().clientWidth;
        const height = this.svg.node().clientHeight;
        
        // Create force simulation
        this.simulation = d3.forceSimulation(this.nodes)
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => this.getNodeRadius(d) + 5))
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(100));
        
        // Draw links
        const link = this.g.append('g')
            .selectAll('line')
            .data(this.links)
            .join('line')
            .attr('stroke', 'rgba(255,255,255,0.1)')
            .attr('stroke-width', 1);
        
        // Draw nodes
        const node = this.g.append('g')
            .selectAll('circle')
            .data(this.nodes)
            .join('circle')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => this.getNodeColor(d))
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('opacity', 0.9)
            .style('cursor', 'pointer')
            .call(this.drag(this.simulation))
            .on('click', (event, d) => this.showDetails(d))
            .on('mouseover', (event, d) => this.showTooltip(event, d))
            .on('mouseout', () => this.hideTooltip());
        
        // Draw labels
        const label = this.g.append('g')
            .selectAll('text')
            .data(this.nodes)
            .join('text')
            .text(d => d.id)
            .attr('font-size', 11)
            .attr('font-weight', 'bold')
            .attr('fill', '#fff')
            .attr('text-anchor', 'middle')
            .attr('dy', d => this.getNodeRadius(d) + 15)
            .attr('pointer-events', 'none')
            .style('text-shadow', '0 0 3px rgba(0,0,0,0.8)');
        
        // Update positions on tick
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            
            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);
            
            label
                .attr('x', d => d.x)
                .attr('y', d => d.y);
        });
        
        // Store references
        this.nodeElements = node;
        this.labelElements = label;
        this.linkElements = link;
    },
    
    getNodeRadius(d) {
        // Scale based on market cap
        const minRadius = 15;
        const maxRadius = 50;
        const minCap = d3.min(this.nodes, n => n.marketCap);
        const maxCap = d3.max(this.nodes, n => n.marketCap);
        
        const scale = d3.scaleSqrt()
            .domain([minCap, maxCap])
            .range([minRadius, maxRadius]);
        
        return scale(d.marketCap);
    },
    
    getNodeColor(d) {
        const sector = d.sector || 'Technology';
        return this.industryColors[sector] || '#888';
    },
    
    drag(simulation) {
        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }
        
        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }
        
        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }
        
        return d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
    },
    
    showTooltip(event, d) {
        const tooltip = d3.select('#tooltip');
        tooltip
            .style('opacity', 1)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px')
            .html(`
                <strong>${d.id}</strong><br>
                ${d.name}<br>
                Score: ${d.buffettScore}
            `);
    },
    
    hideTooltip() {
        d3.select('#tooltip').style('opacity', 0);
    },
    
    showDetails(stock) {
        // Hide empty state, show details
        d3.select('#state-empty').style('display', 'none');
        d3.select('#state-details').style('display', 'block');
        
        // Populate header
        d3.select('#det-ticker').text(stock.id);
        d3.select('#det-name').text(stock.name);
        d3.select('#det-score')
            .text(stock.buffettScore)
            .attr('class', 'score-lg ' + this.getScoreClass(stock.buffettScore));
        d3.select('#det-sector').text(stock.sector);
        d3.select('#det-industry').text(stock.industry);
        
        // Render radar chart
        this.renderRadarChart(stock);
        
        // Render metrics
        this.renderMetrics(stock);
        
        // Highlight node
        this.highlightNode(stock.id);
    },
    
    getScoreClass(score) {
        if (score >= 70) return 'good';
        if (score >= 40) return 'mid';
        return 'bad';
    },
    
    renderRadarChart(stock) {
        const container = d3.select('#radar-container');
        container.html(''); // Clear previous
        
        const metrics = stock.metrics;
        const radarData = [
            { axis: 'Margins', value: (metrics.gross_margin || 0) / 100 },
            { axis: 'Returns', value: Math.min((metrics.roe || 0) / 100, 1) },
            { axis: 'FCF', value: Math.min((metrics.fcf_margin || 0) / 100, 1) },
            { axis: 'Debt', value: Math.max(0, 1 - (metrics.debt_to_equity || 0) / 3) },
            { axis: 'Efficiency', value: Math.min((metrics.roic || 0) / 100, 1) }
        ];
        
        const width = 180;
        const height = 180;
        const radius = Math.min(width, height) / 2 - 20;
        
        const svg = container.append('svg')
            .attr('width', width)
            .attr('height', height);
        
        const g = svg.append('g')
            .attr('transform', `translate(${width/2},${height/2})`);
        
        // Draw background circles
        const levels = 5;
        for (let i = 1; i <= levels; i++) {
            g.append('circle')
                .attr('r', radius * i / levels)
                .attr('fill', 'none')
                .attr('stroke', 'rgba(255,255,255,0.1)')
                .attr('stroke-width', 1);
        }
        
        // Draw axes
        const angleSlice = Math.PI * 2 / radarData.length;
        radarData.forEach((d, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            
            g.append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', x)
                .attr('y2', y)
                .attr('stroke', 'rgba(255,255,255,0.1)')
                .attr('stroke-width', 1);
            
            g.append('text')
                .attr('x', x * 1.15)
                .attr('y', y * 1.15)
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .attr('font-size', 10)
                .attr('fill', '#8b949e')
                .text(d.axis);
        });
        
        // Draw data polygon
        const radarLine = d3.lineRadial()
            .radius(d => radius * d.value)
            .angle((d, i) => angleSlice * i)
            .curve(d3.curveLinearClosed);
        
        g.append('path')
            .datum(radarData)
            .attr('d', radarLine)
            .attr('fill', '#0079fd')
            .attr('fill-opacity', 0.3)
            .attr('stroke', '#0079fd')
            .attr('stroke-width', 2);
        
        // Draw data points
        radarData.forEach((d, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const x = radius * d.value * Math.cos(angle);
            const y = radius * d.value * Math.sin(angle);
            
            g.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 4)
                .attr('fill', '#0079fd')
                .attr('stroke', '#fff')
                .attr('stroke-width', 2);
        });
    },
    
    renderMetrics(stock) {
        const container = d3.select('#metrics-list');
        container.html(''); // Clear previous
        
        const metrics = stock.metrics;
        const industry = stock.industry;
        const industryAvg = this.industryAverages[industry] || {};
        
        const metricsToShow = [
            { key: 'gross_margin', label: 'Gross Margin', format: d => d.toFixed(1) + '%', avg: industryAvg.gross_margin },
            { key: 'net_margin', label: 'Net Margin', format: d => d.toFixed(1) + '%', avg: industryAvg.net_margin },
            { key: 'roe', label: 'ROE', format: d => d.toFixed(1) + '%', avg: industryAvg.roe },
            { key: 'roic', label: 'ROIC', format: d => d.toFixed(1) + '%', avg: industryAvg.roic },
            { key: 'debt_to_equity', label: 'Debt/Equity', format: d => d.toFixed(2), avg: industryAvg.debt_to_equity, inverse: true },
            { key: 'fcf_margin', label: 'FCF Margin', format: d => d.toFixed(1) + '%', avg: industryAvg.fcf_margin },
            { key: 'pe_ratio', label: 'P/E Ratio', format: d => d.toFixed(1), avg: null },
            { key: 'pb_ratio', label: 'P/B Ratio', format: d => d.toFixed(1), avg: null }
        ];
        
        metricsToShow.forEach(metric => {
            const value = metrics[metric.key];
            if (value === undefined || value === null || isNaN(value)) return;
            
            const card = container.append('div').attr('class', 'metric-card');
            
            const header = card.append('div').attr('class', 'm-header');
            header.append('div').attr('class', 'm-title').text(metric.label);
            
            card.append('div')
                .attr('class', 'm-value')
                .text(metric.format(value));
            
            // Comparison bar if industry average exists
            if (metric.avg !== null && metric.avg !== undefined && !isNaN(metric.avg)) {
                const barContainer = card.append('div').attr('class', 'comp-bar-container');
                
                const maxVal = Math.max(value, metric.avg) * 1.2;
                const stockPct = (value / maxVal) * 100;
                const avgPct = (metric.avg / maxVal) * 100;
                
                // Determine color based on comparison
                let barColor = '#0079fd';
                if (metric.inverse) {
                    barColor = value < metric.avg ? '#00c853' : '#ff3d00';
                } else {
                    barColor = value > metric.avg ? '#00c853' : '#ff3d00';
                }
                
                barContainer.append('div')
                    .attr('class', 'comp-bar')
                    .style('width', stockPct + '%')
                    .style('background', barColor);
                
                barContainer.append('div')
                    .attr('class', 'comp-marker')
                    .style('left', avgPct + '%');
                
                const labels = card.append('div').attr('class', 'comp-label');
                labels.append('span').text('Stock');
                labels.append('span').text('Ind. Avg');
            }
        });
    },
    
    highlightNode(ticker) {
        this.nodeElements
            .attr('opacity', d => d.id === ticker ? 1 : 0.3)
            .attr('stroke-width', d => d.id === ticker ? 4 : 2);
        
        this.labelElements
            .attr('opacity', d => d.id === ticker ? 1 : 0.3);
    },
    
    setupSearch() {
        const searchInput = d3.select('#search-input');
        
        searchInput.on('input', (event) => {
            const query = event.target.value.toUpperCase();
            if (query.length === 0) {
                this.resetHighlight();
                return;
            }
            
            const match = this.nodes.find(n => n.id === query);
            if (match) {
                this.showDetails(match);
                this.focusOnNode(match);
            }
        });
    },
    
    populateTickerList() {
        const datalist = d3.select('#tickers');
        this.nodes.forEach(node => {
            datalist.append('option').attr('value', node.id);
        });
    },
    
    resetHighlight() {
        this.nodeElements.attr('opacity', 0.9).attr('stroke-width', 2);
        this.labelElements.attr('opacity', 1);
    },
    
    focusOnNode(node) {
        const width = this.svg.node().clientWidth;
        const height = this.svg.node().clientHeight;
        
        const scale = 1.5;
        const x = -node.x * scale + width / 2;
        const y = -node.y * scale + height / 2;
        
        this.svg.transition()
            .duration(750)
            .call(this.currentZoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    },
    
    zoomIn() {
        this.svg.transition().duration(300).call(this.currentZoom.scaleBy, 1.3);
    },
    
    zoomOut() {
        this.svg.transition().duration(300).call(this.currentZoom.scaleBy, 0.7);
    },
    
    resetZoom() {
        this.svg.transition().duration(500).call(this.currentZoom.transform, d3.zoomIdentity);
    },
    
    toggleSidebar() {
        d3.select('#sidebar').classed('hidden', function() {
            return !d3.select(this).classed('hidden');
        });
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
