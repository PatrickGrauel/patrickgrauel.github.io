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
    const sizeScale = d3.scaleLog().domain([1e8, d3.max(data.nodes, d => d.owner_earnings)]).range([15, 45]).clamp(true);
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 100]);
    
    // Axis Scale (For beeswarm mode)
    const axisScale = d3.scaleLinear().range([100, width - 100]);

    // --- SIMULATION ---
    let simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(100).strength(0.1))
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => sizeScale(d.owner_earnings) + 5).iterations(2));

    // --- NODES ---
    const nodeGroup = svg.append("g").selectAll("g")
        .data(data.nodes).join("g").call(drag(simulation));

    const circle = nodeGroup.append("circle")
        .attr("r", d => sizeScale(d.owner_earnings))
        .attr("fill", d => colorScale(d.buffettScore))
        .attr("stroke", "#fff").attr("stroke-width", 1.5).style("cursor", "pointer");

    nodeGroup.append("text")
        .text(d => d.id).attr("text-anchor", "middle").attr("dy", ".35em")
        .attr("fill", "#000").style("font-size", "10px").style("font-weight", "bold").style("pointer-events", "none");

    // --- RADAR CHART (Mini) ---
    const radarLine = d3.lineRadial()
        .angle((d, i) => i * (Math.PI * 2 / 5))
        .radius(d => (d / 100) * 50) // 50px max radius
        .curve(d3.curveLinearClosed);

    // --- INTERACTIONS ---
    
    // 1. CLICK: Show Moat Radar
    nodeGroup.on("click", (event, d) => {
        const sidebar = document.getElementById("sidebar");
        sidebar.classList.remove("collapsed");

        // Fill Stats
        document.getElementById("detail-ticker").innerText = d.name;
        document.getElementById("detail-score").innerText = `BCS: ${d.buffettScore}`;
        
        // Draw Radar in Sidebar (Assuming an <svg id="radar-viz"> exists there)
        drawRadarChart(d.pillars);
    });

    // 2. HOVER: Contextual Dimming
    nodeGroup.on("mouseover", (event, d) => {
        // Dim everyone
        nodeGroup.style("opacity", 0.1);
        ctx.globalAlpha = 0.05;

        // Highlight Me
        d3.select(event.currentTarget).style("opacity", 1);
        
        // Highlight Peers
        const connectedIds = new Set();
        data.links.forEach(l => {
            if(l.source.id === d.id) connectedIds.add(l.target.id);
            if(l.target.id === d.id) connectedIds.add(l.source.id);
        });
        
        nodeGroup.filter(n => connectedIds.has(n.id)).style("opacity", 1);
    })
    .on("mouseout", () => {
        nodeGroup.style("opacity", 1); // Reset
        ctx.globalAlpha = 1;
    });

    // --- ANIMATION CONTROLLER (The Metric Shuffler) ---
    window.updateLayout = (metric) => {
        if (metric === 'network') {
            // Restore Gravity
            simulation.force("x", null).force("y", null).force("center", d3.forceCenter(width/2, height/2)).alpha(1).restart();
        } else {
            // BEESWARM MODE: Turn off gravity, turn on X-axis positioning
            const values = data.nodes.map(d => d.metrics[metric] || 0);
            axisScale.domain([d3.min(values), d3.max(values)]);

            simulation.force("center", null)
                .force("x", d3.forceX(d => axisScale(d.metrics[metric] || 0)).strength(1))
                .force("y", d3.forceY(height / 2).strength(0.1)) // Keep them in middle band
                .alpha(1).restart();
        }
    };

    // --- TICK LOOP ---
    simulation.on("tick", () => {
        ctx.clearRect(0, 0, width, height);
        // Draw Links only if in Network mode
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        data.links.forEach(link => {
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
        });
        ctx.stroke();
        
        nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function drag(sim) {
        // ... (Same drag function as before) ...
        return d3.drag()
            .on("start", (e, d) => { if(!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on("end", (e, d) => { if(!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });
    }
}

// Helper: Radar Chart Logic
function drawRadarChart(pillars) {
    const data = Object.values(pillars); // [80, 50, 90, 40, 60]
    // ... D3 code to draw polygon inside sidebar ...
    // (We will add the SVG container to index.html next)
}

initGraph();
