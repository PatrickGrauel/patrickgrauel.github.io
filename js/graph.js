const app = {
    data: null,
    activeTicker: null,
    currentView: 'overview',
    historyRange: '5Y',
    simulation: null,
    
    // Config
    width: window.innerWidth,
    height: window.innerHeight,
    
    // Init
    async init() {
        this.setupTheme();
        await this.loadData();
        if (!this.data) return;

        this.initSearch();
        this.renderNetwork(); // Pre-warm the sim
        
        // Select first node by default
        if (this.data.nodes.length > 0) {
            this.selectTicker(this.data.nodes[0].id);
        }
        
        // Resize listener
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            // Re-render active view if needed
        });
    },

    // --- 1. DATA & THEME ---
    async loadData() {
        try {
            this.data = await d3.json("data/graph_data.json");
            console.log("Data loaded:", this.data.nodes.length, "nodes");
        } catch (e) {
            console.error("Failed to load data", e);
        }
    },

    setupTheme() {
        const saved = localStorage.getItem('theme') || 'system';
        document.documentElement.setAttribute('data-theme', saved);
        
        // Listen for system changes if 'system'
        if (saved === 'system') {
            const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
            darkQuery.addListener((e) => {
                if(localStorage.getItem('theme') === 'system') {
                    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
                }
            });
        }
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        
        // Re-render charts if they depend on CSS variables
        if (this.currentView === 'history') this.renderHistory();
        if (this.currentView === 'overview') this.renderRadar(this.getNode(this.activeTicker));
    },

    // --- 2. NAVIGATION ---
    switchView(viewId) {
        this.currentView = viewId;
        
        // Update Nav UI
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.toggle('active', el.innerText.toLowerCase() === viewId);
        });

        // Update Panels
        document.querySelectorAll('.view-panel').forEach(el => {
            el.classList.remove('active');
        });
        document.getElementById(`view-${viewId}`).classList.add('active');

        // Logic triggers
        if (viewId === 'history') this.renderHistory();
        if (viewId === 'overview') {
            const node = this.getNode(this.activeTicker);
            if(node) this.renderOverview(node);
        }
        
        // Show Search bar only in relevant views
        const search = document.getElementById('global-search');
        search.style.display = (viewId === 'overview' || viewId === 'history') ? 'block' : 'none';
    },

    // --- 3. SELECTION LOGIC ---
    selectTicker(ticker) {
        this.activeTicker = ticker;
        const node = this.getNode(ticker);
        if (!node) return;

        // Update all views
        this.renderOverview(node);
        if (this.currentView === 'history') this.renderHistory();
        
        // Update Network Selection visuals
        d3.selectAll("circle").attr("stroke", d => d.id === ticker ? "var(--accent)" : "#fff")
                              .attr("stroke-width", d => d.id === ticker ? 4 : 1);
    },

    getNode(ticker) {
        return this.data.nodes.find(n => n.id === ticker);
    },

    // --- 4. OVERVIEW RENDERER ---
    renderOverview(node) {
        // Identity
        document.getElementById('ov-ticker').innerText = node.id;
        document.getElementById('ov-name').innerText = node.name;
        document.getElementById('ov-sector').innerText = node.sector;
        document.getElementById('ov-industry').innerText = node.industry || node.sector;
        
        const scoreEl = document.getElementById('ov-score');
        scoreEl.innerText = `Buffett Score: ${node.buffettScore}`;
        scoreEl.className = `badge ${node.buffettScore > 70 ? 'good' : node.buffettScore > 40 ? 'neutral' : 'bad'}`;

        // Radar
        this.renderRadar(node);

        // Metrics Injection Helper
        const makeCard = (label, val, suffix, isGood) => `
            <div class="metric-instrument">
                <div class="mi-top">${label} <span style="opacity:0.5">ⓘ</span></div>
                <div class="mi-val">${(val * 100).toFixed(1)}${suffix}</div>
                <div class="mi-bot">
                    <span class="badge ${isGood ? 'good' : 'neutral'}">${isGood ? 'STRONG' : 'NEUTRAL'}</span>
                    <span>vs Sector</span>
                </div>
            </div>
        `;

        const m = node.metrics;
        
        document.getElementById('moat-metrics').innerHTML = `
            ${makeCard('Gross Margin', m.gross_margin, '%', m.gross_margin > 0.4)}
            ${makeCard('ROIC (Avg)', m.roic, '%', m.roic > 0.15)}
        `;
        
        document.getElementById('strength-metrics').innerHTML = `
            ${makeCard('FCF Yield', m.fcf_yield, '%', m.fcf_yield > 0.05)}
            <div class="metric-instrument">
                <div class="mi-top">Debt / Equity</div>
                <div class="mi-val">${m.debt_to_equity.toFixed(2)}x</div>
                <div class="mi-bot"><span class="badge ${m.debt_to_equity < 0.8 ? 'good' : 'bad'}">${m.debt_to_equity < 0.8 ? 'SAFE' : 'HIGH'}</span></div>
            </div>
        `;
    },

    renderRadar(node) {
        const container = document.getElementById('radar-container');
        container.innerHTML = '';
        const width = 280, height = 220;
        
        const svg = d3.select(container).append("svg")
            .attr("width", "100%").attr("height", "100%")
            .attr("viewBox", `0 0 ${width} ${height}`);
            
        const pillars = node.pillars;
        const keys = Object.keys(pillars);
        const values = keys.map(k => pillars[k]);
        
        const rScale = d3.scaleLinear().domain([0, 100]).range([0, 80]);
        const center = { x: width/2, y: height/2 + 10 };
        const angleSlice = Math.PI * 2 / keys.length;

        // Grid
        [25, 50, 75, 100].forEach(level => {
            svg.append("circle")
                .attr("cx", center.x).attr("cy", center.y).attr("r", rScale(level))
                .attr("fill", "none").attr("stroke", "var(--border)");
        });

        // Axes & Labels
        keys.forEach((k, i) => {
            const angle = i * angleSlice - Math.PI/2;
            const x = center.x + rScale(115) * Math.cos(angle);
            const y = center.y + rScale(115) * Math.sin(angle);
            
            svg.append("line")
                .attr("x1", center.x).attr("y1", center.y)
                .attr("x2", center.x + rScale(100) * Math.cos(angle))
                .attr("y2", center.y + rScale(100) * Math.sin(angle))
                .attr("stroke", "var(--border)");
                
            svg.append("text")
                .attr("x", x).attr("y", y)
                .text(k)
                .attr("text-anchor", "middle")
                .attr("dy", "0.35em")
                .attr("font-size", "10px")
                .attr("font-weight", "600")
                .attr("fill", "var(--muted)");
        });

        // Shape
        const line = d3.lineRadial()
            .angle((d, i) => i * angleSlice)
            .radius(d => rScale(d))
            .curve(d3.curveLinearClosed);
            
        const points = values.map((d, i) => [d]); // dummy wrapper
        
        // Calculate polygon points manually for simple SVG polygon to avoid radial confusion
        const polyPoints = values.map((d, i) => {
            const angle = i * angleSlice - Math.PI/2;
            return [center.x + rScale(d) * Math.cos(angle), center.y + rScale(d) * Math.sin(angle)];
        });

        svg.append("polygon")
            .attr("points", polyPoints.map(p => p.join(",")).join(" "))
            .attr("fill", "var(--primaryTint)")
            .attr("stroke", "var(--primary)")
            .attr("stroke-width", 2);
    },

    // --- 5. HISTORY RENDERER ---
    setRange(range) {
        this.historyRange = range;
        document.querySelectorAll('.tr-btn').forEach(b => {
            b.classList.toggle('active', b.innerText === range);
        });
        this.renderHistory();
    },

    renderHistory() {
        const node = this.getNode(this.activeTicker);
        if (!node) return;
        
        document.getElementById('hist-ticker').innerText = node.id;
        const container = document.getElementById('history-charts-container');
        container.innerHTML = ''; // Clear

        // 1. Gross Margin
        this.drawChart(container, node.history.gross_margin, "Gross Margin", "%");
        // 2. Debt
        this.drawChart(container, node.history.debt_to_equity, "Debt / Equity", "x");
        // 3. ROIC
        this.drawChart(container, node.history.roic, "ROIC", "%");
    },

    drawChart(container, data, title, unit) {
        if (!data || data.length === 0) return;

        // Filter based on range (Mock logic)
        let sliceN = data.length;
        if(this.historyRange === '1Y') sliceN = 2;
        if(this.historyRange === '5Y') sliceN = 5;
        const viewData = data.slice(-sliceN);

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-header"><span class="card-title">${title}</span></div>`;
        const chartDiv = document.createElement('div');
        chartDiv.style.height = "200px";
        card.appendChild(chartDiv);
        container.appendChild(card);

        // D3 Chart
        const margin = {top: 10, right: 20, bottom: 20, left: 30};
        const width = chartDiv.clientWidth - margin.left - margin.right;
        const height = 200 - margin.top - margin.bottom;

        const svg = d3.select(chartDiv).append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scalePoint().domain(viewData.map(d => d.year)).range([0, width]);
        const y = d3.scaleLinear().domain([0, d3.max(viewData, d => d.value) * 1.1]).range([height, 0]);

        // Grid
        svg.append("g").call(d3.axisLeft(y).tickSize(-width).ticks(5))
           .select(".domain").remove();
        svg.selectAll(".tick line").attr("stroke", "var(--border)");
        svg.selectAll(".tick text").attr("fill", "var(--muted2)");

        // Axis
        svg.append("g").attr("transform", `translate(0,${height})`)
           .call(d3.axisBottom(x).tickSize(0).tickPadding(10))
           .select(".domain").remove();
        svg.selectAll(".tick text").attr("fill", "var(--muted)");

        // Line
        const line = d3.line()
            .x(d => x(d.year))
            .y(d => y(d.value))
            .curve(d3.curveMonotoneX);

        svg.append("path").datum(viewData)
           .attr("fill", "none")
           .attr("stroke", "var(--primary)")
           .attr("stroke-width", 2)
           .attr("d", line);

        // Dots
        svg.selectAll(".dot").data(viewData).enter().append("circle")
           .attr("cx", d => x(d.year)).attr("cy", d => y(d.value))
           .attr("r", 4).attr("fill", "var(--surface)").attr("stroke", "var(--primary)").attr("stroke-width", 2);
    },

    // --- 6. NETWORK GRAPH ---
    renderNetwork() {
        const canvas = document.getElementById('edges-canvas');
        const svg = document.getElementById('nodes-svg');
        const rect = document.querySelector('.network-container').getBoundingClientRect();
        
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext('2d');
        
        const sizeScale = d3.scaleSqrt().domain([0, 1e11]).range([4, 20]); // Adjust domain based on market cap proxy
        const colorScale = d3.scaleOrdinal(d3.schemeTableau10); // Sector colors

        // Legend
        const sectors = [...new Set(this.data.nodes.map(n => n.sector))];
        const legendEl = document.getElementById('sector-legend');
        sectors.forEach(s => {
            if(s === "Unknown") return;
            const div = document.createElement('div');
            div.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colorScale(s)};margin-right:6px;"></span>${s}`;
            div.style.fontSize = "11px";
            div.style.color = "var(--muted)";
            legendEl.appendChild(div);
        });

        // Simulation
        this.simulation = d3.forceSimulation(this.data.nodes)
            .force("link", d3.forceLink(this.data.links).id(d => d.id).distance(60))
            .force("charge", d3.forceManyBody().strength(-100))
            .force("center", d3.forceCenter(rect.width / 2, rect.height / 2))
            .force("collide", d3.forceCollide().radius(d => sizeScale(d.owner_earnings) + 2));

        const nodeGroup = d3.select(svg).selectAll("g")
            .data(this.data.nodes).join("g")
            .call(d3.drag()
                .on("start", (e, d) => { if (!e.active) this.simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on("end", (e, d) => { if (!e.active) this.simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

        nodeGroup.append("circle")
            .attr("r", d => sizeScale(d.owner_earnings))
            .attr("fill", d => colorScale(d.sector))
            .attr("stroke", "#fff").attr("stroke-width", 1.5)
            .style("cursor", "pointer");

        // Hover & Selection
        nodeGroup.on("click", (e, d) => {
            this.selectTicker(d.id);
            document.getElementById('net-details').classList.add('visible');
            document.getElementById('net-ticker').innerText = d.id;
            document.getElementById('net-name').innerText = d.name;
            document.getElementById('net-score').innerText = d.buffettScore;
        });

        this.simulation.on("tick", () => {
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.beginPath();
            ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border');
            
            this.data.links.forEach(l => {
                ctx.moveTo(l.source.x, l.source.y);
                ctx.lineTo(l.target.x, l.target.y);
            });
            ctx.stroke();

            nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
        });
    },

    // --- 7. SEARCH ---
    initSearch() {
        const list = document.getElementById('tickers');
        this.data.nodes.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n.id;
            list.appendChild(opt);
        });

        document.querySelectorAll('.search-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const val = e.target.value.toUpperCase();
                if (this.getNode(val)) {
                    this.selectTicker(val);
                    // If in overview/history, we are good.
                    // If in Network, maybe center view?
                }
                e.target.value = '';
            });
        });
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => app.init());
