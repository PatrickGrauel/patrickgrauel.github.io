async function initGraph() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const canvas = d3.select("#edges-canvas").attr("width", width).attr("height", height);
    const ctx = canvas.node().getContext("2d");
    const svg = d3.select("#nodes-svg").attr("width", width).attr("height", height);

    // --- DATA LOAD ---
    let data;
    try { data = await d3.json("data/graph_data.json"); } 
    catch (e) { console.error("Data missing."); return; }

    // --- SCALES ---
    const sizeScale = d3.scaleLog().domain([1e8, d3.max(data.nodes, d => d.owner_earnings)]).range([15, 50]).clamp(true);
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 100]);
    const axisScale = d3.scaleLinear().range([150, width - 150]);

    // --- INIT SECTOR FILTER ---
    const sectors = [...new Set(data.nodes.map(d => d.sector))].sort();
    const sectorSelect = document.getElementById("sector-select");
    sectors.forEach(s => {
        if(s && s !== "Unknown") {
            const opt = document.createElement("option");
            opt.value = s; opt.innerText = s;
            sectorSelect.appendChild(opt);
        }
    });

    // --- SIMULATION ---
    let activeNodes = data.nodes; // For filtering
    
    let simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(100).strength(0.1))
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => sizeScale(d.owner_earnings) + 5).iterations(2));

    // --- DRAW NODES ---
    const nodeGroup = svg.append("g").selectAll("g")
        .data(data.nodes).join("g")
        .call(drag(simulation));

    const circle = nodeGroup.append("circle")
        .attr("r", d => sizeScale(d.owner_earnings))
        .attr("fill", d => colorScale(d.buffettScore))
        .attr("stroke", "#fff").attr("stroke-width", 1.5)
        .style("cursor", "pointer");

    const text = nodeGroup.append("text")
        .text(d => d.id).attr("text-anchor", "middle").attr("dy", ".35em")
        .attr("fill", "#0f111a").style("font-weight", "800")
        .style("font-size", d => Math.min(12, sizeScale(d.owner_earnings) / 2.5) + "px")
        .style("font-family", "sans-serif").style("pointer-events", "none");

    // --- RADAR INIT (Default View) ---
    // Draw an "Average" radar initially to populate the UI
    drawRadar({ Quality: 50, Strength: 50, Moat: 50, Management: 50, Value: 50 });

    // --- INTERACTIONS ---

    // 1. HOVER: Smart Dimming
    nodeGroup.on("mouseover", (event, d) => {
        // Dim Everything slightly (keep readable)
        nodeGroup.transition().duration(100).style("opacity", 0.2);
        
        // Highlight SELF
        const self = d3.select(event.currentTarget);
        self.transition().duration(100).style("opacity", 1);
        
        // Find Connections
        const neighbors = new Set();
        data.links.forEach(l => {
            if(l.source.id === d.id) neighbors.add(l.target.id);
            if(l.target.id === d.id) neighbors.add(l.source.id);
        });

        // Highlight NEIGHBORS (Full Opacity)
        nodeGroup.filter(n => neighbors.has(n.id))
            .transition().duration(100).style("opacity", 1);

        // Highlight SECTOR PEERS (Medium Opacity - Context)
        nodeGroup.filter(n => n.sector === d.sector && !neighbors.has(n.id) && n.id !== d.id)
            .transition().duration(100).style("opacity", 0.6);

        // Update Radar to Hovered Node (Preview)
        drawRadar(d.pillars);
        updateSidebarMetrics(d);

    }).on("mouseout", () => {
        // Reset Opacity based on active filter
        const currentSector = document.getElementById("sector-select").value;
        if(currentSector === 'all') {
            nodeGroup.transition().duration(200).style("opacity", 1);
        } else {
            nodeGroup.style("opacity", n => n.sector === currentSector ? 1 : 0.05);
        }
    });

    // 2. CLICK: Lock Sidebar
    nodeGroup.on("click", (event, d) => {
        updateSidebarMetrics(d);
        drawRadar(d.pillars); // Lock radar
    });

    // --- HELPER: UPDATE SIDEBAR ---
    function updateSidebarMetrics(d) {
        document.getElementById("detail-ticker").innerText = d.name;
        document.getElementById("detail-sector").innerText = d.sector;
        
        const badge = document.getElementById("detail-score");
        badge.innerText = `BCS: ${d.buffettScore}`;
        badge.style.background = colorScale(d.buffettScore);
        badge.style.color = d.buffettScore > 50 ? "#0f111a" : "#fff";

        const m = d.metrics;
        document.getElementById("detail-margin").innerText = (m.gross_margin * 100).toFixed(1) + "%";
        document.getElementById("detail-debt").innerText = m.debt_to_equity.toFixed(2);
        document.getElementById("detail-roic").innerText = (m.roic * 100).toFixed(1) + "%";
        document.getElementById("detail-yield").innerText = (m.fcf_yield * 100).toFixed(1) + "%";
    }

    // --- FILTER: SECTOR ---
    window.filterBySector = (sector) => {
        if (sector === "all") {
            activeNodes = data.nodes;
            nodeGroup.transition().style("opacity", 1).style("pointer-events", "all");
        } else {
            activeNodes = data.nodes.filter(d => d.sector === sector);
            nodeGroup.transition().duration(300)
                .style("opacity", d => d.sector === sector ? 1 : 0.05)
                .style("pointer-events", d => d.sector === sector ? "all" : "none");
        }
    };

    // --- LAYOUT: METRIC SHUFFLER ---
    window.updateLayout = (mode) => {
        if (mode === "network") {
            simulation.force("x", null).force("y", null)
                .force("center", d3.forceCenter(width / 2, height / 2))
                .force("charge", d3.forceManyBody().strength(-200))
                .alpha(0.5).restart();
        } else {
            // Linear Layout
            const values = activeNodes.map(d => d.metrics[mode] || 0);
            axisScale.domain([d3.min(values), d3.max(values)]);

            simulation.force("center", null).force("charge", null)
                .force("x", d3.forceX(d => axisScale(d.metrics[mode] || 0)).strength(0.5))
                .force("y", d3.forceY(height / 2).strength(0.1))
                .alpha(0.5).restart();
        }
    };

    // --- RENDER LOOP ---
    simulation.on("tick", () => {
        ctx.clearRect(0, 0, width, height);
        
        // Draw Links (Only visible ones)
        const currentSector = document.getElementById("sector-select").value;
        const isNetwork = document.getElementById("view-select").value === "network";

        if (isNetwork) {
            ctx.save();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
            ctx.beginPath();
            data.links.forEach(link => {
                // If filtering by sector, only draw links between visible nodes
                const sourceVis = currentSector === 'all' || link.source.sector === currentSector;
                const targetVis = currentSector === 'all' || link.target.sector === currentSector;
                
                if (sourceVis && targetVis) {
                    ctx.moveTo(link.source.x, link.source.y);
                    ctx.lineTo(link.target.x, link.target.y);
                }
            });
            ctx.stroke();
            ctx.restore();
        }
        nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function drag(sim) {
        return d3.drag()
            .on("start", (e, d) => { if(!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on("end", (e, d) => { if(!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });
    }
}

// --- RADAR CHART DRAWING ---
function drawRadar(pillars) {
    const svg = d3.select("#radar-viz");
    svg.selectAll("*").remove();

    if(!pillars) return;

    const keys = ["Quality", "Strength", "Moat", "Management", "Value"];
    const values = keys.map(k => pillars[k] || 0);
    const radius = 70; 
    const center = { x: 110, y: 110 };

    const rScale = d3.scaleLinear().range([0, radius]).domain([0, 100]);
    const angleSlice = Math.PI * 2 / keys.length;

    // 1. Grid
    [25, 50, 75, 100].forEach(level => {
        svg.append("circle")
            .attr("cx", center.x).attr("cy", center.y).attr("r", rScale(level))
            .style("fill", "none").style("stroke", "#444").style("stroke-dasharray", "2,4");
    });

    // 2. Axes
    keys.forEach((key, i) => {
        const angle = i * angleSlice - Math.PI / 2;
        const x = center.x + rScale(100) * Math.cos(angle);
        const y = center.y + rScale(100) * Math.sin(angle);
        svg.append("line").attr("x1", center.x).attr("y1", center.y).attr("x2", x).attr("y2", y).style("stroke", "#444");
        
        // Label
        const lx = center.x + (radius + 15) * Math.cos(angle);
        const ly = center.y + (radius + 15) * Math.sin(angle);
        svg.append("text").attr("x", lx).attr("y", ly).text(key)
           .attr("text-anchor", "middle").attr("dy", "0.35em")
           .style("font-size", "10px").style("fill", "#888");
    });

    // 3. Shape
    const points = values.map((d, i) => {
        const angle = i * angleSlice - Math.PI / 2;
        return [center.x + rScale(d) * Math.cos(angle), center.y + rScale(d) * Math.sin(angle)];
    });

    svg.append("polygon")
        .attr("points", points.map(p => p.join(",")).join(" "))
        .style("fill", "rgba(59, 130, 246, 0.4)")
        .style("stroke", "#3b82f6").style("stroke-width", 2);
}

initGraph();
