const app = {
    data: null,
    width: window.innerWidth,
    height: window.innerHeight,
    simulation: null,
    zoom: null,
    svg: null,
    g: null, // The group that gets zoomed/panned
    activeNode: null,

    // Config
    colors: { good: "#00c853", mid: "#ffd700", bad: "#ff3d00" },

    async init() {
        await this.loadData();
        if (!this.data) return;

        this.initGraph();
        this.initUI();
        
        window.addEventListener('resize', () => this.handleResize());
    },

    async loadData() {
        try {
            this.data = await d3.json("data/graph_data.json");
        } catch (e) { console.error(e); }
    },

    // --- GRAPH ENGINE ---
    initGraph() {
        this.svg = d3.select("#main-svg");
        
        // 1. Zoom Logic
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 8]) // Min zoom 0.1x, Max zoom 8x
            .on("zoom", (e) => this.g.attr("transform", e.transform));

        this.svg.call(this.zoom)
            .on("dblclick.zoom", null); // Disable double click zoom

        // 2. Container Group (This is what moves)
        this.g = this.svg.append("g");

        // 3. Scales
        const sizeScale = d3.scaleSqrt()
            .domain([0, d3.max(this.data.nodes, d => d.owner_earnings)])
            .range([8, 60]);

        // 4. Simulation
        this.simulation = d3.forceSimulation(this.data.nodes)
            .force("link", d3.forceLink(this.data.links).id(d => d.id).distance(120).strength(0.1))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collide", d3.forceCollide().radius(d => sizeScale(d.owner_earnings) + 5).iterations(2));

        // 5. Draw Links
        const link = this.g.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(this.data.links)
            .join("line")
            .attr("stroke", "#ffffff")
            .attr("stroke-opacity", 0.1)
            .attr("stroke-width", 1);

        // 6. Draw Nodes
        const node = this.g.append("g")
            .attr("class", "nodes")
            .selectAll("g")
            .data(this.data.nodes)
            .join("g")
            .call(d3.drag()
                .on("start", (e, d) => { if(!e.active) this.simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on("end", (e, d) => { if(!e.active) this.simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

        // Bubble
        node.append("circle")
            .attr("r", d => sizeScale(d.owner_earnings))
            .attr("fill", d => this.getColor(d.buffettScore))
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .attr("fill-opacity", 0.7)
            .style("cursor", "pointer");

        // Label (Smart visibility based on size)
        node.append("text")
            .text(d => d.id)
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .style("font-family", "sans-serif")
            .style("font-weight", "800")
            .style("fill", "#fff")
            .style("font-size", d => Math.min(14, sizeScale(d.owner_earnings)/2) + "px")
            .style("pointer-events", "none")
            .style("text-shadow", "0 2px 4px rgba(0,0,0,0.8)");

        // 7. Interactions
        node.on("click", (e, d) => this.selectNode(d));
        
        node.on("mouseover", (e, d) => {
            d3.select("#tooltip").style("opacity", 1)
                .html(`<b>${d.name}</b><br>${d.sector}<br>Score: ${d.buffettScore}`)
                .style("left", (e.pageX+15)+"px").style("top", (e.pageY-15)+"px");
        }).on("mouseout", () => d3.select("#tooltip").style("opacity", 0));

        // 8. Tick
        this.simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node.attr("transform", d => `translate(${d.x},${d.y})`);
        });
    },

    // --- UI LOGIC ---
    initUI() {
        const list = document.getElementById("tickers");
        this.data.nodes.forEach(n => {
            const opt = document.createElement("option");
            opt.value = n.id;
            list.appendChild(opt);
        });

        document.getElementById("search-input").addEventListener("change", (e) => {
            const val = e.target.value.toUpperCase();
            const node = this.data.nodes.find(n => n.id === val);
            if(node) {
                this.selectNode(node);
                // Center and Zoom to node
                this.svg.transition().duration(750).call(
                    this.zoom.transform,
                    d3.zoomIdentity.translate(this.width/2, this.height/2).scale(2).translate(-node.x, -node.y)
                );
            }
            e.target.value = "";
        });
    },

    selectNode(d) {
        this.activeNode = d;
        document.getElementById("state-empty").style.display = "none";
        document.getElementById("state-details").style.display = "block";
        document.getElementById("sidebar").classList.remove("hidden");

        // 1. Identity
        document.getElementById("det-ticker").innerText = d.id;
        document.getElementById("det-name").innerText = d.name;
        document.getElementById("det-sector").innerText = d.sector;
        document.getElementById("det-industry").innerText = d.industry;
        
        const scoreEl = document.getElementById("det-score");
        scoreEl.innerText = d.buffettScore;
        scoreEl.className = `score-lg ${d.buffettScore >= 70 ? 'good' : d.buffettScore >= 40 ? 'mid' : 'bad'}`;

        // 2. Render Radar
        this.drawRadar(d.pillars);

        // 3. Render ALL Metrics (The Fix)
        const container = document.getElementById("metrics-list");
        container.innerHTML = "";

        // Need mapping for human readable names if keys are cryptic
        // But d.raw from Python usually has good keys like "Gross Margin"
        if (d.raw) {
            Object.entries(d.raw).forEach(([key, valStr]) => {
                this.createMetricCard(container, key, valStr, d);
            });
        }
    },

    createMetricCard(container, label, valStr, node) {
        // Parse value string to number for comparison (e.g. "50.2%" -> 0.502)
        let val = parseFloat(valStr);
        if (valStr.includes("%")) val = val / 100;
        
        // Find Industry Average
        // Note: Python script needs to ensure matching keys in d.sector_avg
        // For now, we try to match key logic or fallback
        // Mapping 'Gross Margin (Avg)' -> 'gross_margin' in metrics dict
        let metricKey = null;
        if(label.includes("Gross")) metricKey = 'gross_margin';
        else if(label.includes("Debt/Equity")) metricKey = 'debt_to_equity';
        else if(label.includes("ROIC")) metricKey = 'roic';
        else if(label.includes("FCF Yield")) metricKey = 'fcf_yield';
        else if(label.includes("R&D")) metricKey = 'rd_to_gp';

        let sectorVal = 0;
        if (metricKey && node.sector_avg && node.sector_avg[metricKey] !== undefined) {
            sectorVal = node.sector_avg[metricKey];
        }

        const card = document.createElement("div");
        card.className = "metric-card";
        
        let html = `
            <div class="m-header">
                <span class="m-title">${label}</span>
                <span class="m-value">${valStr}</span>
            </div>
        `;

        // Only draw comparison bar if we have a valid number and benchmark
        if (!isNaN(val) && sectorVal !== 0) {
            const max = Math.max(val, sectorVal) * 1.5; // Scale max
            const valPct = Math.min((val / max) * 100, 100);
            const secPct = Math.min((sectorVal / max) * 100, 100);
            
            // Color logic: Higher is usually better, except Debt
            let barColor = "var(--primary)";
            if (metricKey === 'debt_to_equity') {
                barColor = val > sectorVal ? "var(--danger)" : "var(--success)";
            } else {
                barColor = val > sectorVal ? "var(--success)" : "var(--warning)";
            }

            html += `
                <div class="comp-bar-container">
                    <div class="comp-bar" style="width:${valPct}%; background:${barColor}; opacity:0.8;"></div>
                    <div class="comp-marker" style="left:${secPct}%;"></div>
                </div>
                <div class="comp-label">
                    <span>${node.id}</span>
                    <span>Ind. Avg: ${(sectorVal * (valStr.includes('%')?100:1)).toFixed(1)}${valStr.includes('%')?'%':''}</span>
                </div>
            `;
        } else {
            html += `<div style="font-size:10px; color:#444; margin-top:5px;">No benchmark avail</div>`;
        }

        card.innerHTML = html;
        container.appendChild(card);
    },

    // --- UTILS ---
    getColor(score) {
        if (score >= 70) return this.colors.good;
        if (score >= 40) return this.colors.mid;
        return this.colors.bad;
    },

    drawRadar(pillars) {
        const container = document.getElementById("radar-container");
        container.innerHTML = "";
        if (!pillars) return;

        const w = container.clientWidth;
        const h = 200;
        const svg = d3.select(container).append("svg").attr("width", w).attr("height", h);
        
        const keys = Object.keys(pillars);
        const r = 70;
        const c = {x: w/2, y: h/2};
        const rScale = d3.scaleLinear().range([0, r]).domain([0, 100]);
        const angleSlice = Math.PI * 2 / keys.length;

        // Grid
        [25, 50, 75, 100].forEach(l => {
            svg.append("circle").attr("cx", c.x).attr("cy", c.y).attr("r", rScale(l))
               .attr("fill","none").attr("stroke","#333").attr("stroke-dasharray","2,2");
        });

        // Axes
        keys.forEach((k, i) => {
            const a = i * angleSlice - Math.PI/2;
            const x = c.x + rScale(100) * Math.cos(a);
            const y = c.y + rScale(100) * Math.sin(a);
            svg.append("line").attr("x1",c.x).attr("y1",c.y).attr("x2",x).attr("y2",y).attr("stroke","#333");
            
            // Label
            const lx = c.x + (r+15) * Math.cos(a);
            const ly = c.y + (r+15) * Math.sin(a);
            svg.append("text").attr("x",lx).attr("y",ly).text(k)
               .attr("text-anchor","middle").attr("dy","0.3em").style("font-size","10px").style("fill","#888");
        });

        // Shape
        const dataVals = keys.map(k => pillars[k]);
        const points = dataVals.map((d, i) => {
            const a = i * angleSlice - Math.PI/2;
            return [c.x + rScale(d) * Math.cos(a), c.y + rScale(d) * Math.sin(a)];
        });
        
        svg.append("polygon").attr("points", points.map(p=>p.join(",")).join(" "))
           .attr("fill", "rgba(0, 121, 253, 0.2)").attr("stroke", "#0079fd").attr("stroke-width", 2);
    },

    // --- CONTROLS ---
    zoomIn() { this.svg.transition().call(this.zoom.scaleBy, 1.2); },
    zoomOut() { this.svg.transition().call(this.zoom.scaleBy, 0.8); },
    resetZoom() { 
        this.svg.transition().duration(750).call(
            this.zoom.transform, 
            d3.zoomIdentity.translate(this.width/2, this.height/2).scale(1).translate(-this.width/2, -this.height/2) // Reset to center roughly
        );
    },
    toggleSidebar() {
        document.getElementById("sidebar").classList.toggle("hidden");
    },
    handleResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        // Reset center force if you want dynamic centering on resize
        this.simulation.force("center", d3.forceCenter(this.width / 2, this.height / 2));
        this.simulation.alpha(0.3).restart();
    }
};

app.init();
