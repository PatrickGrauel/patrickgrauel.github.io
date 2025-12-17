const app = {
    data: null,
    width: window.innerWidth,
    height: window.innerHeight,
    simulation: null,
    activeNodes: [],
    
    // Config
    colors: {
        good: "#00c853",
        mid: "#ffd700",
        bad: "#ff3d00"
    },

    async init() {
        await this.loadData();
        if (!this.data) return;
        
        this.activeNodes = this.data.nodes;
        this.initUI();
        this.renderGraph();
        
        // Handle Resize
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            d3.select("#edges-canvas").attr("width", this.width).attr("height", this.height);
            d3.select("#nodes-svg").attr("width", this.width).attr("height", this.height);
            this.simulation.force("center", d3.forceCenter(this.width / 2, this.height / 2));
            this.simulation.alpha(0.3).restart();
        });
    },

    async loadData() {
        try {
            this.data = await d3.json("data/graph_data.json");
        } catch (e) { console.error(e); }
    },

    initUI() {
        // Populate Search Datalist
        const list = document.getElementById("tickers");
        this.data.nodes.forEach(n => {
            const opt = document.createElement("option");
            opt.value = n.id;
            list.appendChild(opt);
        });

        // Populate Sector Filter
        const sectors = [...new Set(this.data.nodes.map(n => n.sector))].sort();
        const sel = document.getElementById("sector-select");
        sectors.forEach(s => {
            if(s !== "Unknown") {
                const opt = document.createElement("option");
                opt.value = s; opt.innerText = s;
                sel.appendChild(opt);
            }
        });

        // Search Listener
        document.getElementById("search-input").addEventListener("change", (e) => {
            const val = e.target.value.toUpperCase();
            const node = this.data.nodes.find(n => n.id === val);
            if(node) this.selectNode(node);
            e.target.value = "";
        });
    },

    // --- GRAPH RENDERING ---
    renderGraph() {
        const canvas = d3.select("#edges-canvas").attr("width", this.width).attr("height", this.height);
        const ctx = canvas.node().getContext("2d");
        const svg = d3.select("#nodes-svg").attr("width", this.width).attr("height", this.height);

        // Scales
        const sizeScale = d3.scaleSqrt()
            .domain([0, d3.max(this.data.nodes, d => d.owner_earnings)])
            .range([12, 45]); // Min size big enough for text

        // Color Logic (Traffic Light)
        const getColor = (score) => {
            if (score >= 70) return this.colors.good;
            if (score >= 40) return this.colors.mid;
            return this.colors.bad;
        };

        // Simulation
        this.simulation = d3.forceSimulation(this.data.nodes)
            .force("link", d3.forceLink(this.data.links).id(d => d.id).distance(100).strength(0.1))
            .force("charge", d3.forceManyBody().strength(-200))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collide", d3.forceCollide().radius(d => sizeScale(d.owner_earnings) + 4));

        // SVG Groups (Node + Text)
        const nodeGroup = svg.append("g")
            .selectAll("g")
            .data(this.data.nodes)
            .join("g")
            .call(d3.drag()
                .on("start", (e, d) => { if(!e.active) this.simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on("end", (e, d) => { if(!e.active) this.simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

        // 1. Bubbles
        nodeGroup.append("circle")
            .attr("r", d => sizeScale(d.owner_earnings))
            .attr("fill", d => getColor(d.buffettScore))
            .attr("stroke", "#fff").attr("stroke-width", 1.5)
            .attr("fill-opacity", 0.8)
            .style("cursor", "pointer");

        // 2. Ticker Text
        nodeGroup.append("text")
            .text(d => d.id)
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .style("font-family", "sans-serif")
            .style("font-weight", "800")
            .style("font-size", d => Math.min(12, sizeScale(d.owner_earnings) / 2) + "px")
            .style("fill", "#000") // Black text contrast on colored bubbles
            .style("pointer-events", "none");

        // Interactions
        nodeGroup.on("click", (e, d) => this.selectNode(d));
        
        nodeGroup.on("mouseover", (e, d) => {
            d3.select("#tooltip").style("opacity", 1)
                .html(`<b>${d.name}</b><br>Score: ${d.buffettScore}`)
                .style("left", (e.pageX + 15) + "px").style("top", (e.pageY - 15) + "px");
            d3.select(e.currentTarget).select("circle").attr("stroke-width", 3).attr("stroke", "#fff");
        }).on("mouseout", (e) => {
            d3.select("#tooltip").style("opacity", 0);
            d3.select(e.currentTarget).select("circle").attr("stroke-width", 1.5);
        });

        // Tick Loop
        this.simulation.on("tick", () => {
            ctx.clearRect(0, 0, this.width, this.height);
            
            // Draw Edges (Canvas for performance)
            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.1)";
            ctx.beginPath();
            
            // Only draw links if both nodes are visible (filtered)
            this.data.links.forEach(l => {
                const sVis = this.isNodeVisible(l.source);
                const tVis = this.isNodeVisible(l.target);
                if (sVis && tVis) {
                    ctx.moveTo(l.source.x, l.source.y);
                    ctx.lineTo(l.target.x, l.target.y);
                }
            });
            ctx.stroke();
            ctx.restore();

            // Update Nodes (SVG)
            nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`)
                     .style("opacity", d => this.isNodeVisible(d) ? 1 : 0.05)
                     .style("pointer-events", d => this.isNodeVisible(d) ? "all" : "none");
        });
    },

    // --- FILTER LOGIC ---
    filters: { sector: 'all', score: 'all' },

    filterGraph(type, val) {
        this.filters[type] = val;
        // Trigger simulation tick to update opacity
        this.simulation.alpha(0.1).restart();
    },

    isNodeVisible(d) {
        const secMatch = this.filters.sector === 'all' || d.sector === this.filters.sector;
        let scoreMatch = true;
        if (this.filters.score === 'good') scoreMatch = d.buffettScore >= 70;
        if (this.filters.score === 'mid') scoreMatch = d.buffettScore >= 40 && d.buffettScore < 70;
        if (this.filters.score === 'bad') scoreMatch = d.buffettScore < 40;
        
        return secMatch && scoreMatch;
    },

    // --- DETAILS PANEL LOGIC ---
    selectNode(d) {
        // Switch Sidebar State
        document.getElementById("state-filters").style.display = "none";
        document.getElementById("state-details").style.display = "block";

        // Identity
        document.getElementById("det-id").innerText = d.id;
        document.getElementById("det-name").innerText = d.name;
        const scoreEl = document.getElementById("det-score");
        scoreEl.innerText = d.buffettScore;
        scoreEl.className = `stock-score ${d.buffettScore>=70?'good':d.buffettScore>=40?'mid':'bad'}`;

        // Render All Metrics (Dynamic List)
        const container = document.getElementById("det-metrics");
        container.innerHTML = "";
        
        if (d.raw) {
            Object.entries(d.raw).forEach(([key, val]) => {
                const row = document.createElement("div");
                row.className = "metric-row";
                row.innerHTML = `
                    <span class="m-label">${key}</span>
                    <span class="m-val">${val}</span>
                `;
                container.appendChild(row);
            });
        }

        // Render Radar
        this.drawRadar(d.pillars);
        
        // Center Graph on Node
        this.simulation.force("center", d3.forceCenter(this.width/2 - 200, this.height/2)).alpha(0.3).restart();
    },

    clearSelection() {
        document.getElementById("state-filters").style.display = "block";
        document.getElementById("state-details").style.display = "none";
        // Reset Center
        this.simulation.force("center", d3.forceCenter(this.width/2, this.height/2)).alpha(0.3).restart();
    },

    drawRadar(pillars) {
        const container = document.getElementById("radar-container");
        container.innerHTML = "";
        if (!pillars) return;

        const width = container.clientWidth;
        const height = 200;
        const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
        
        const keys = Object.keys(pillars);
        const radius = 60; 
        const center = {x: width/2, y: height/2 + 10};
        const angleSlice = Math.PI * 2 / keys.length;
        const rScale = d3.scaleLinear().range([0, radius]).domain([0, 100]);

        // Grid
        [25, 50, 75, 100].forEach(l => {
            svg.append("circle").attr("cx", center.x).attr("cy", center.y).attr("r", rScale(l))
               .attr("fill","none").attr("stroke","#333").attr("stroke-dasharray","2,2");
        });

        // Shape
        const points = keys.map((k, i) => {
            const angle = i * angleSlice - Math.PI/2;
            return [center.x + rScale(pillars[k]) * Math.cos(angle), center.y + rScale(pillars[k]) * Math.sin(angle)];
        });

        svg.append("polygon").attr("points", points.map(p=>p.join(",")).join(" "))
           .attr("fill", "rgba(0, 121, 253, 0.3)").attr("stroke", "#0079fd").attr("stroke-width", 2);

        // Labels
        keys.forEach((k, i) => {
            const angle = i * angleSlice - Math.PI/2;
            const x = center.x + (radius+15)*Math.cos(angle);
            const y = center.y + (radius+15)*Math.sin(angle);
            svg.append("text").attr("x",x).attr("y",y).text(k)
               .attr("text-anchor","middle").attr("fill","#888").style("font-size","10px");
        });
    }
};

app.init();
