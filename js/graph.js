// BUFFETT FOCUS - Enhanced Graph Visualization
const app = {
    data: null,
    simulation: null,
    selectedNode: null,
    
    // Industry color palette (distinct, accessible colors)
    industryColors: {
        'Technology': '#00d4ff',
        'Communication Services': '#ff6b9d',
        'Consumer Discretionary': '#ffa500',
        'Consumer Staples': '#32cd32',
        'Financials': '#ffd700',
        'Healthcare': '#ff1493',
        'Industrials': '#4169e1',
        'Energy': '#dc143c',
        'Materials': '#8b4513',
        'Real Estate': '#9370db',
        'Utilities': '#20b2aa',
        'Unknown': '#808080'
    },
    
    init() {
        this.setupGraph();
        this.loadData();
        this.setupSearch();
    },
    
    setupGraph() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.svg = d3.select("#main-svg");
        this.width = width;
        this.height = height;
        
        // Create zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => {
                this.container.attr("transform", event.transform);
            });
        
        this.svg.call(this.zoom);
        
        // Main container
        this.container = this.svg.append("g");
        
        // Layers
        this.linkLayer = this.container.append("g").attr("class", "links");
        this.nodeLayer = this.container.append("g").attr("class", "nodes");
        this.labelLayer = this.container.append("g").attr("class", "labels");
    },
    
    async loadData() {
        try {
            this.data = await d3.json("data/graph_data.json");
            
            // Populate search datalist
            const datalist = d3.select("#tickers");
            this.data.nodes.forEach(node => {
                datalist.append("option").attr("value", node.id);
            });
            
            this.createVisualization();
        } catch (error) {
            console.error("Error loading data:", error);
            alert("Failed to load data. Please ensure graph_data.json exists.");
        }
    },
    
    createVisualization() {
        const { nodes, links } = this.data;
        
        // Size scale based on market cap
        const sizeScale = d3.scaleSqrt()
            .domain([0, d3.max(nodes, d => d.marketCap)])
            .range([6, 35]);
        
        // Create force simulation with tighter clustering
        this.simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links)
                .id(d => d.id)
                .distance(80)  // Tighter connections
                .strength(1.2))
            .force("charge", d3.forceManyBody()
                .strength(-250))  // Stronger repulsion for clarity
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collision", d3.forceCollide()
                .radius(d => sizeScale(d.marketCap) + 5))
            .force("x", d3.forceX(this.width / 2).strength(0.05))
            .force("y", d3.forceY(this.height / 2).strength(0.05));
        
        // Draw links
        this.links = this.linkLayer
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("stroke", "#2a2d3a")
            .attr("stroke-width", d => d.value * 2)
            .attr("stroke-opacity", 0.4);
        
        // Draw nodes
        this.nodes = this.nodeLayer
            .selectAll("circle")
            .data(nodes)
            .enter().append("circle")
            .attr("r", d => sizeScale(d.marketCap))
            .attr("fill", d => this.getNodeColor(d))
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .attr("opacity", 0.9)
            .style("cursor", "pointer")
            .on("click", (event, d) => this.selectNode(d))
            .on("mouseover", (event, d) => this.showTooltip(event, d))
            .on("mouseout", () => this.hideTooltip())
            .call(d3.drag()
                .on("start", (event, d) => this.dragStarted(event, d))
                .on("drag", (event, d) => this.dragged(event, d))
                .on("end", (event, d) => this.dragEnded(event, d)));
        
        // Draw labels (only for high-score stocks to reduce clutter)
        this.labels = this.labelLayer
            .selectAll("text")
            .data(nodes.filter(d => d.buffettScore > 60))
            .enter().append("text")
            .text(d => d.id)
            .attr("font-size", "11px")
            .attr("fill", "#e0e0e0")
            .attr("text-anchor", "middle")
            .attr("dy", -3)
            .attr("pointer-events", "none")
            .style("text-shadow", "1px 1px 2px #000, -1px -1px 2px #000");
        
        // Update positions on tick
        this.simulation.on("tick", () => {
            this.links
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            
            this.nodes
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
            
            this.labels
                .attr("x", d => d.x)
                .attr("y", d => d.y);
        });
    },
    
    getNodeColor(node) {
        const score = node.buffettScore;
        const sector = node.sector || 'Unknown';
        
        // Base color from sector
        let baseColor = this.industryColors[sector] || this.industryColors['Unknown'];
        
        // Adjust brightness based on score
        const brightness = 0.5 + (score / 100) * 0.5;
        return this.adjustColorBrightness(baseColor, brightness);
    },
    
    adjustColorBrightness(color, factor) {
        const hex = color.replace('#', '');
        const r = Math.min(255, Math.round(parseInt(hex.substr(0, 2), 16) * factor));
        const g = Math.min(255, Math.round(parseInt(hex.substr(2, 2), 16) * factor));
        const b = Math.min(255, Math.round(parseInt(hex.substr(4, 2), 16) * factor));
        return `rgb(${r},${g},${b})`;
    },
    
    selectNode(node) {
        this.selectedNode = node;
        
        // Highlight selected node
        this.nodes
            .attr("opacity", d => d === node ? 1 : 0.3)
            .attr("stroke-width", d => d === node ? 3 : 2);
        
        this.links
            .attr("opacity", d => 
                d.source === node || d.target === node ? 0.6 : 0.1);
        
        // Show details panel
        this.showDetails(node);
    },
    
    showDetails(node) {
        document.getElementById("state-empty").style.display = "none";
        document.getElementById("state-details").style.display = "block";
        
        // Header
        document.getElementById("det-ticker").textContent = node.id;
        document.getElementById("det-name").textContent = node.name;
        document.getElementById("det-sector").textContent = node.sector;
        document.getElementById("det-industry").textContent = node.industry;
        
        // Score
        const scoreEl = document.getElementById("det-score");
        scoreEl.textContent = node.buffettScore;
        scoreEl.className = "score-lg " + this.getScoreClass(node.buffettScore);
        
        // Radar chart
        this.drawRadar(node);
        
        // Metrics
        this.drawMetrics(node);
    },
    
    drawRadar(node) {
        const container = document.getElementById("radar-container");
        container.innerHTML = "";
        
        const metrics = node.metrics;
        const historical = node.historical;
        
        // Create compact radar/spider chart for key metrics
        const radarData = [
            { metric: "Margin", value: metrics.gross_margin, max: 100 },
            { metric: "Returns", value: metrics.roe, max: 30 },
            { metric: "Debt", value: 100 - (metrics.debt_to_equity * 20), max: 100 },
            { metric: "Cash", value: metrics.fcf_margin, max: 30 },
            { metric: "Quality", value: 100 - metrics.sga_ratio, max: 100 }
        ];
        
        const size = 180;
        const levels = 4;
        const svg = d3.select(container)
            .append("svg")
            .attr("width", size)
            .attr("height", size);
        
        const g = svg.append("g")
            .attr("transform", `translate(${size/2},${size/2})`);
        
        const angleSlice = Math.PI * 2 / radarData.length;
        const radius = size / 2 - 30;
        
        // Draw grid circles
        for (let i = 1; i <= levels; i++) {
            g.append("circle")
                .attr("r", radius * i / levels)
                .attr("fill", "none")
                .attr("stroke", "#2a2d3a")
                .attr("stroke-width", 1);
        }
        
        // Draw axes
        radarData.forEach((d, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            
            g.append("line")
                .attr("x1", 0)
                .attr("y1", 0)
                .attr("x2", x)
                .attr("y2", y)
                .attr("stroke", "#2a2d3a")
                .attr("stroke-width", 1);
            
            g.append("text")
                .attr("x", x * 1.15)
                .attr("y", y * 1.15)
                .attr("text-anchor", "middle")
                .attr("font-size", "11px")
                .attr("fill", "#8b949e")
                .text(d.metric);
        });
        
        // Draw data polygon
        const lineGenerator = d3.lineRadial()
            .angle((d, i) => angleSlice * i)
            .radius(d => radius * (d.value / d.max))
            .curve(d3.curveLinearClosed);
        
        g.append("path")
            .datum(radarData)
            .attr("d", lineGenerator)
            .attr("fill", this.industryColors[node.sector] || "#00d4ff")
            .attr("fill-opacity", 0.3)
            .attr("stroke", this.industryColors[node.sector] || "#00d4ff")
            .attr("stroke-width", 2);
        
        // Draw points
        radarData.forEach((d, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const r = radius * (d.value / d.max);
            const x = r * Math.cos(angle);
            const y = r * Math.sin(angle);
            
            g.append("circle")
                .attr("cx", x)
                .attr("cy", y)
                .attr("r", 4)
                .attr("fill", this.industryColors[node.sector] || "#00d4ff");
        });
    },
    
    drawMetrics(node) {
        const container = document.getElementById("metrics-list");
        container.innerHTML = "";
        
        const metrics = node.metrics;
        const industry = node.industry;
        const industryAvg = this.data.industry_averages[industry] || {};
        
        // Compact 2-column grid
        const metricsList = [
            { name: "Gross Margin", value: metrics.gross_margin, unit: "%", ideal: 40, avg: industryAvg.gross_margin },
            { name: "Net Margin", value: metrics.net_margin, unit: "%", ideal: 15, avg: industryAvg.net_margin },
            { name: "ROE", value: metrics.roe, unit: "%", ideal: 15, avg: industryAvg.roe },
            { name: "ROIC", value: metrics.roic, unit: "%", ideal: 12, avg: null },
            { name: "Debt/Equity", value: metrics.debt_to_equity, unit: "x", ideal: 0.5, avg: industryAvg.debt_to_equity, inverted: true },
            { name: "Current Ratio", value: metrics.current_ratio, unit: "x", ideal: 1.5, avg: null },
            { name: "FCF Margin", value: metrics.fcf_margin, unit: "%", ideal: 15, avg: null },
            { name: "SG&A Ratio", value: metrics.sga_ratio, unit: "%", ideal: 30, avg: null, inverted: true }
        ];
        
        container.style.display = "grid";
        container.style.gridTemplateColumns = "1fr 1fr";
        container.style.gap = "8px";
        
        metricsList.forEach(metric => {
            const card = this.createMetricCard(metric, node);
            container.appendChild(card);
        });
        
        // Add histogram if historical data available
        if (node.historical && node.historical.gross_margin.length > 0) {
            setTimeout(() => this.drawHistograms(node), 100);
        }
    },
    
    createMetricCard(metric, node) {
        const card = document.createElement("div");
        card.className = "metric-card";
        card.style.padding = "8px";
        card.style.marginBottom = "0";
        
        const value = metric.value;
        const ideal = metric.ideal;
        const avg = metric.avg;
        const inverted = metric.inverted || false;
        
        // Determine if good/bad
        let performance;
        if (inverted) {
            performance = value <= ideal ? "good" : (value <= ideal * 1.5 ? "mid" : "bad");
        } else {
            performance = value >= ideal ? "good" : (value >= ideal * 0.7 ? "mid" : "bad");
        }
        
        const colors = {
            good: "#00c853",
            mid: "#ffd700",
            bad: "#ff3d00"
        };
        
        card.innerHTML = `
            <div class="m-header">
                <div class="m-title">${metric.name}</div>
                <div class="m-value" style="color: ${colors[performance]}">${value}${metric.unit}</div>
            </div>
            <div class="comp-bar-container">
                <div class="comp-bar" style="width: ${Math.min(100, (value / ideal) * (inverted ? -50 : 100))}%; background: ${colors[performance]};"></div>
                ${avg ? `<div class="comp-marker" style="left: ${(avg / ideal) * (inverted ? -50 : 100)}%;" title="Industry Avg: ${avg}${metric.unit}"></div>` : ''}
            </div>
            <div class="comp-label">
                <span style="color: ${colors.good}">Target: ${ideal}${metric.unit}</span>
                ${avg ? `<span>Ind: ${avg}${metric.unit}</span>` : ''}
            </div>
        `;
        
        return card;
    },
    
    drawHistograms(node) {
        // Add historical trend section
        const metricsContainer = document.getElementById("metrics-list");
        
        const histSection = document.createElement("div");
        histSection.style.gridColumn = "1 / -1";
        histSection.style.marginTop = "10px";
        histSection.innerHTML = `
            <div style="font-size:11px; font-weight:700; color:var(--muted); margin-bottom:8px;">5-YEAR TRENDS</div>
            <div id="hist-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;"></div>
        `;
        metricsContainer.appendChild(histSection);
        
        const histContainer = document.getElementById("hist-container");
        const historical = node.historical;
        
        // Create mini histograms for key metrics
        const histMetrics = [
            { key: 'gross_margin', name: 'Gross Margin', unit: '%' },
            { key: 'net_margin', name: 'Net Margin', unit: '%' },
            { key: 'roe', name: 'ROE', unit: '%' },
            { key: 'debt_to_equity', name: 'Debt/Eq', unit: 'x' }
        ];
        
        histMetrics.forEach(metric => {
            if (historical[metric.key] && historical[metric.key].length > 0) {
                const histDiv = this.createMiniHistogram(
                    historical[metric.key],
                    metric.name,
                    metric.unit
                );
                histContainer.appendChild(histDiv);
            }
        });
    },
    
    createMiniHistogram(data, name, unit) {
        const div = document.createElement("div");
        div.style.background = "var(--bg)";
        div.style.border = "1px solid var(--border)";
        div.style.borderRadius = "6px";
        div.style.padding = "8px";
        
        const max = Math.max(...data);
        const min = Math.min(...data);
        const trend = data.length > 1 ? (data[data.length - 1] > data[0] ? "↑" : "↓") : "";
        
        // Create mini bar chart
        const bars = data.map((val, i) => {
            const height = ((val - min) / (max - min)) * 40 + 5;
            return `<div style="width: ${100/data.length}%; height: ${height}px; background: #00d4ff; opacity: ${0.5 + (i / data.length) * 0.5}; display: inline-block;"></div>`;
        }).join('');
        
        div.innerHTML = `
            <div style="font-size: 10px; color: var(--muted); margin-bottom: 4px; display: flex; justify-content: space-between;">
                <span>${name}</span>
                <span>${trend}</span>
            </div>
            <div style="display: flex; align-items: flex-end; height: 45px; gap: 2px;">
                ${bars}
            </div>
            <div style="font-size: 10px; color: var(--muted); margin-top: 4px; display: flex; justify-content: space-between;">
                <span>${min}${unit}</span>
                <span>${data[data.length-1]}${unit}</span>
            </div>
        `;
        
        return div;
    },
    
    showTooltip(event, node) {
        const tooltip = d3.select("#tooltip");
        tooltip
            .style("opacity", 1)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px")
            .html(`
                <strong>${node.id}</strong><br>
                ${node.name}<br>
                <span style="color: ${this.industryColors[node.sector]}">${node.sector}</span><br>
                Score: <strong>${node.buffettScore}/100</strong>
            `);
    },
    
    hideTooltip() {
        d3.select("#tooltip").style("opacity", 0);
    },
    
    setupSearch() {
        const searchInput = document.getElementById("search-input");
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toUpperCase();
            if (query.length > 0) {
                const node = this.data.nodes.find(n => n.id === query);
                if (node) {
                    this.selectNode(node);
                    this.centerOnNode(node);
                }
            }
        });
    },
    
    centerOnNode(node) {
        const transform = d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(1.5)
            .translate(-node.x, -node.y);
        
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    },
    
    // Zoom controls
    zoomIn() {
        this.svg.transition().call(this.zoom.scaleBy, 1.3);
    },
    
    zoomOut() {
        this.svg.transition().call(this.zoom.scaleBy, 0.7);
    },
    
    resetZoom() {
        this.svg.transition().call(this.zoom.transform, d3.zoomIdentity);
        
        // Reset node highlighting
        this.nodes.attr("opacity", 0.9).attr("stroke-width", 2);
        this.links.attr("opacity", 0.4);
        
        // Hide details
        document.getElementById("state-empty").style.display = "block";
        document.getElementById("state-details").style.display = "none";
        
        this.selectedNode = null;
    },
    
    toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        sidebar.classList.toggle("hidden");
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
    
    getScoreClass(score) {
        if (score >= 70) return "good";
        if (score >= 40) return "mid";
        return "bad";
    }
};

// Initialize on load
window.addEventListener("DOMContentLoaded", () => app.init());
