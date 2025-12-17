// ============================================
// BUFFETT FOCUS - GRAPH VISUALIZATION
// Fixed: Centered graph + Histogram metrics
// ============================================

const app = {
    svg: null,
    g: null,
    zoom: null,
    simulation: null,
    nodes: [],
    links: [],
    width: 0,
    height: 0,
    selectedNode: null,

    // Sector benchmarks (medians) - will be computed from data
    sectorBenchmarks: {},

    init() {
        this.setupSVG();
        this.loadData();
    },

    setupSVG() {
        const container = document.getElementById('graph-container');
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        this.svg = d3.select('#main-svg')
            .attr('width', this.width)
            .attr('height', this.height);

        // Create a group for zoom/pan transformations
        this.g = this.svg.append('g');

        // Setup zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(this.zoom);

        // Center the view initially
        const initialTransform = d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(0.8);
        this.svg.call(this.zoom.transform, initialTransform);

        // Handle resize
        window.addEventListener('resize', () => this.handleResize());
    },

    handleResize() {
        const container = document.getElementById('graph-container');
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        this.svg
            .attr('width', this.width)
            .attr('height', this.height);

        if (this.simulation) {
            this.simulation.force('center', d3.forceCenter(0, 0));
            this.simulation.alpha(0.3).restart();
        }
    },

    async loadData() {
        try {
            const response = await fetch('stocks/data.json');
            const data = await response.json();
            this.nodes = data.nodes;
            this.links = data.links;

            // Compute sector benchmarks
            this.computeSectorBenchmarks();

            // Setup search
            this.setupSearch();

            // Render the graph
            this.renderGraph();
        } catch (err) {
            console.error('Error loading data:', err);
            // Show demo data if file not found
            this.loadDemoData();
        }
    },

    loadDemoData() {
        // Demo data for testing
        this.nodes = [
            { id: 'GOOGL', sector: 'Communication Services', industry: 'Internet Content & Information', marketCap: 2000000000000, buffettScore: 4, metrics: { grossMargin: 0.582, profitMargin: 0.286, debtToEquity: 0.08, roa: 0.321 } },
            { id: 'AAPL', sector: 'Technology', industry: 'Consumer Electronics', marketCap: 3000000000000, buffettScore: 5, metrics: { grossMargin: 0.45, profitMargin: 0.25, debtToEquity: 1.5, roa: 0.28 } },
            { id: 'MSFT', sector: 'Technology', industry: 'Software', marketCap: 2800000000000, buffettScore: 5, metrics: { grossMargin: 0.69, profitMargin: 0.35, debtToEquity: 0.35, roa: 0.19 } },
            { id: 'AMZN', sector: 'Consumer Discretionary', industry: 'Internet Retail', marketCap: 1500000000000, buffettScore: 3, metrics: { grossMargin: 0.44, profitMargin: 0.06, debtToEquity: 0.8, roa: 0.07 } },
            { id: 'META', sector: 'Communication Services', industry: 'Internet Content & Information', marketCap: 1200000000000, buffettScore: 4, metrics: { grossMargin: 0.81, profitMargin: 0.29, debtToEquity: 0.12, roa: 0.18 } },
            { id: 'NVDA', sector: 'Technology', industry: 'Semiconductors', marketCap: 1100000000000, buffettScore: 4, metrics: { grossMargin: 0.72, profitMargin: 0.55, debtToEquity: 0.41, roa: 0.45 } },
            { id: 'JPM', sector: 'Financials', industry: 'Banks', marketCap: 500000000000, buffettScore: 3, metrics: { grossMargin: 0.58, profitMargin: 0.33, debtToEquity: 1.2, roa: 0.01 } },
            { id: 'V', sector: 'Financials', industry: 'Credit Services', marketCap: 550000000000, buffettScore: 5, metrics: { grossMargin: 0.80, profitMargin: 0.52, debtToEquity: 0.52, roa: 0.15 } },
            { id: 'JNJ', sector: 'Healthcare', industry: 'Pharmaceuticals', marketCap: 400000000000, buffettScore: 4, metrics: { grossMargin: 0.68, profitMargin: 0.20, debtToEquity: 0.44, roa: 0.10 } },
            { id: 'WMT', sector: 'Consumer Staples', industry: 'Retail', marketCap: 450000000000, buffettScore: 3, metrics: { grossMargin: 0.25, profitMargin: 0.02, debtToEquity: 0.72, roa: 0.06 } },
        ];

        this.links = [
            { source: 'GOOGL', target: 'META', value: 0.85 },
            { source: 'AAPL', target: 'MSFT', value: 0.78 },
            { source: 'MSFT', target: 'NVDA', value: 0.72 },
            { source: 'AAPL', target: 'NVDA', value: 0.68 },
            { source: 'JPM', target: 'V', value: 0.65 },
            { source: 'GOOGL', target: 'MSFT', value: 0.70 },
            { source: 'AMZN', target: 'AAPL', value: 0.66 },
        ];

        this.computeSectorBenchmarks();
        this.setupSearch();
        this.renderGraph();
    },

    computeSectorBenchmarks() {
        // Group nodes by sector
        const sectorGroups = {};
        this.nodes.forEach(node => {
            const sector = node.sector || 'Unknown';
            if (!sectorGroups[sector]) {
                sectorGroups[sector] = [];
            }
            sectorGroups[sector].push(node);
        });

        // Compute median for each metric per sector
        const metrics = ['grossMargin', 'profitMargin', 'debtToEquity', 'roa', 'revenueGrowth'];
        
        Object.keys(sectorGroups).forEach(sector => {
            this.sectorBenchmarks[sector] = {};
            metrics.forEach(metric => {
                const values = sectorGroups[sector]
                    .map(n => n.metrics?.[metric])
                    .filter(v => v !== undefined && v !== null && !isNaN(v))
                    .sort((a, b) => a - b);
                
                if (values.length > 0) {
                    const mid = Math.floor(values.length / 2);
                    this.sectorBenchmarks[sector][metric] = values.length % 2 !== 0
                        ? values[mid]
                        : (values[mid - 1] + values[mid]) / 2;
                }
            });
        });
    },

    setupSearch() {
        const datalist = document.getElementById('tickers');
        datalist.innerHTML = '';
        this.nodes.forEach(node => {
            const option = document.createElement('option');
            option.value = node.id;
            datalist.appendChild(option);
        });

        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('change', (e) => {
            const ticker = e.target.value.toUpperCase();
            const node = this.nodes.find(n => n.id.toUpperCase() === ticker);
            if (node) {
                this.selectNode(node);
                // Center on selected node
                this.centerOnNode(node);
            }
        });
    },

    getScoreColor(score) {
        if (score >= 4) return '#00c853'; // Green - Wide Moat
        if (score >= 2) return '#ffd700'; // Yellow - Narrow
        return '#ff3d00'; // Red - None
    },

    renderGraph() {
        const tooltip = d3.select('#tooltip');

        // Create force simulation CENTERED AT ORIGIN (0,0)
        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(100).strength(0.5))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(0, 0)) // Center at origin
            .force('collision', d3.forceCollide().radius(30));

        // Draw links
        const link = this.g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(this.links)
            .enter()
            .append('line')
            .attr('stroke', '#333')
            .attr('stroke-opacity', 0.4)
            .attr('stroke-width', d => Math.max(1, d.value * 2));

        // Draw nodes
        const node = this.g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(this.nodes)
            .enter()
            .append('g')
            .attr('class', 'node')
            .style('cursor', 'pointer')
            .call(d3.drag()
                .on('start', (event, d) => this.dragStarted(event, d))
                .on('drag', (event, d) => this.dragged(event, d))
                .on('end', (event, d) => this.dragEnded(event, d)));

        // Node circles
        node.append('circle')
            .attr('r', d => Math.max(8, Math.sqrt(d.marketCap / 1e10)))
            .attr('fill', d => this.getScoreColor(d.buffettScore))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.9);

        // Node labels
        node.append('text')
            .text(d => d.id)
            .attr('dy', d => -Math.max(10, Math.sqrt(d.marketCap / 1e10)) - 4)
            .attr('text-anchor', 'middle')
            .attr('fill', '#aaa')
            .attr('font-size', '10px')
            .attr('font-weight', '600');

        // Interactions
        node.on('mouseover', (event, d) => {
            tooltip
                .style('opacity', 1)
                .html(`<strong>${d.id}</strong><br>${d.sector}<br>Score: ${d.buffettScore}/5`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', () => {
            tooltip.style('opacity', 0);
        })
        .on('click', (event, d) => {
            this.selectNode(d);
        });

        // Update positions on tick
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });
    },

    selectNode(node) {
        this.selectedNode = node;

        // Update UI
        document.getElementById('state-empty').style.display = 'none';
        document.getElementById('state-details').style.display = 'block';

        // Header
        document.getElementById('det-ticker').textContent = node.id;
        document.getElementById('det-name').textContent = node.name || node.sector;
        document.getElementById('det-sector').textContent = node.sector || '--';
        document.getElementById('det-industry').textContent = node.industry || '--';

        const scoreEl = document.getElementById('det-score');
        scoreEl.textContent = node.buffettScore;
        scoreEl.className = 'score-lg ' + (node.buffettScore >= 4 ? 'good' : node.buffettScore >= 2 ? 'mid' : 'bad');

        // Render Radar Chart
        this.renderRadar(node);

        // Render Metric Cards with Histograms
        this.renderMetrics(node);
    },

    renderRadar(node) {
        const container = document.getElementById('radar-container');
        container.innerHTML = '';

        const width = 200;
        const height = 200;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = 70;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        // Radar axes
        const axes = ['Quality', 'Value', 'Moat'];
        const angleSlice = (Math.PI * 2) / axes.length;

        // Draw axis lines and labels
        axes.forEach((axis, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);

            svg.append('line')
                .attr('x1', centerX)
                .attr('y1', centerY)
                .attr('x2', x)
                .attr('y2', y)
                .attr('stroke', '#333')
                .attr('stroke-dasharray', '3,3');

            svg.append('text')
                .attr('x', centerX + (radius + 20) * Math.cos(angle))
                .attr('y', centerY + (radius + 20) * Math.sin(angle))
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('fill', '#888')
                .attr('font-size', '11px')
                .text(axis);
        });

        // Draw concentric circles
        [0.33, 0.66, 1].forEach(level => {
            svg.append('circle')
                .attr('cx', centerX)
                .attr('cy', centerY)
                .attr('r', radius * level)
                .attr('fill', 'none')
                .attr('stroke', '#333')
                .attr('stroke-dasharray', '2,2');
        });

        // Compute radar values from metrics
        const m = node.metrics || {};
        const quality = Math.min(1, ((m.grossMargin || 0) + (m.profitMargin || 0)) / 1.2);
        const value = Math.min(1, 1 - Math.min(1, (m.debtToEquity || 0) / 2));
        const moat = Math.min(1, (m.roa || 0) * 3 + (m.revenueGrowth || 0));

        const values = [quality, value, moat];

        // Draw radar polygon
        const points = values.map((v, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            return [
                centerX + radius * v * Math.cos(angle),
                centerY + radius * v * Math.sin(angle)
            ];
        });

        svg.append('polygon')
            .attr('points', points.map(p => p.join(',')).join(' '))
            .attr('fill', 'rgba(0, 121, 253, 0.3)')
            .attr('stroke', '#0079fd')
            .attr('stroke-width', 2);

        // Draw points
        points.forEach(p => {
            svg.append('circle')
                .attr('cx', p[0])
                .attr('cy', p[1])
                .attr('r', 4)
                .attr('fill', '#0079fd');
        });
    },

    renderMetrics(node) {
        const container = document.getElementById('metrics-list');
        container.innerHTML = '';

        const metrics = node.metrics || {};
        const sector = node.sector || 'Unknown';
        const benchmarks = this.sectorBenchmarks[sector] || {};

        const metricConfig = [
            { key: 'grossMargin', label: 'GROSS MARGIN', format: 'percent', higherBetter: true, benchmark: 0.40 },
            { key: 'profitMargin', label: 'NET MARGIN', format: 'percent', higherBetter: true, benchmark: 0.10 },
            { key: 'debtToEquity', label: 'DEBT/EQUITY', format: 'ratio', higherBetter: false, benchmark: 0.50 },
            { key: 'roa', label: 'ROIC', format: 'percent', higherBetter: true, benchmark: 0.15 },
        ];

        metricConfig.forEach(config => {
            const value = metrics[config.key];
            if (value === undefined) return;

            const sectorAvg = benchmarks[config.key];
            const card = document.createElement('div');
            card.className = 'metric-card';

            // Format value
            let displayValue;
            if (config.format === 'percent') {
                displayValue = (value * 100).toFixed(1) + '%';
            } else {
                displayValue = value.toFixed(2);
            }

            // Determine color based on benchmark
            let valueColor = '#fff';
            if (config.higherBetter) {
                valueColor = value >= config.benchmark ? '#00c853' : value >= config.benchmark * 0.5 ? '#ffd700' : '#ff3d00';
            } else {
                valueColor = value <= config.benchmark ? '#00c853' : value <= config.benchmark * 2 ? '#ffd700' : '#ff3d00';
            }

            // Calculate bar widths for histogram
            const maxVal = config.higherBetter 
                ? Math.max(value, sectorAvg || 0, config.benchmark) * 1.2
                : Math.max(value, sectorAvg || 0, config.benchmark * 2) * 1.2;
            
            const stockBarWidth = Math.min(100, (value / maxVal) * 100);
            const sectorBarWidth = sectorAvg ? Math.min(100, (sectorAvg / maxVal) * 100) : 0;
            const benchmarkPos = Math.min(100, (config.benchmark / maxVal) * 100);

            card.innerHTML = `
                <div class="m-header">
                    <span class="m-title">${config.label}</span>
                    <span class="m-value" style="color: ${valueColor}">${displayValue}</span>
                </div>
                <div style="margin-top: 12px;">
                    <!-- Stock Value Bar -->
                    <div style="display: flex; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 9px; color: #888; width: 50px;">Stock</span>
                        <div style="flex: 1; height: 8px; background: #222; border-radius: 4px; position: relative; overflow: hidden;">
                            <div style="height: 100%; width: ${stockBarWidth}%; background: ${valueColor}; border-radius: 4px;"></div>
                        </div>
                    </div>
                    <!-- Sector Average Bar -->
                    <div style="display: flex; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 9px; color: #888; width: 50px;">Sector</span>
                        <div style="flex: 1; height: 8px; background: #222; border-radius: 4px; position: relative; overflow: hidden;">
                            <div style="height: 100%; width: ${sectorBarWidth}%; background: #666; border-radius: 4px;"></div>
                        </div>
                    </div>
                    <!-- Benchmark indicator -->
                    <div style="position: relative; height: 12px; margin-left: 50px;">
                        <div style="position: absolute; left: ${benchmarkPos}%; top: 0; transform: translateX(-50%);">
                            <div style="width: 1px; height: 8px; background: #0079fd;"></div>
                            <span style="font-size: 8px; color: #0079fd; position: absolute; top: 8px; left: 50%; transform: translateX(-50%); white-space: nowrap;">
                                ${config.higherBetter ? '▲' : '▼'} Buffett
                            </span>
                        </div>
                    </div>
                </div>
                <div class="comp-label" style="margin-top: 8px;">
                    <span>Sector avg: ${sectorAvg ? (config.format === 'percent' ? (sectorAvg * 100).toFixed(1) + '%' : sectorAvg.toFixed(2)) : 'N/A'}</span>
                    <span>Benchmark: ${config.format === 'percent' ? (config.benchmark * 100).toFixed(0) + '%' : config.benchmark.toFixed(2)}</span>
                </div>
            `;

            container.appendChild(card);
        });
    },

    centerOnNode(node) {
        const transform = d3.zoomIdentity
            .translate(this.width / 2 - node.x * 0.8, this.height / 2 - node.y * 0.8)
            .scale(0.8);
        
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    },

    // Drag handlers
    dragStarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    },

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    },

    dragEnded(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    },

    // Zoom controls
    zoomIn() {
        this.svg.transition().call(this.zoom.scaleBy, 1.3);
    },

    zoomOut() {
        this.svg.transition().call(this.zoom.scaleBy, 0.7);
    },

    resetZoom() {
        const transform = d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(0.8);
        this.svg.transition().duration(500).call(this.zoom.transform, transform);
    },

    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('hidden');
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => app.init());
