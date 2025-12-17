async function initGraph() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const canvas = d3.select("#edges-canvas").attr("width", width).attr("height", height);
    const ctx = canvas.node().getContext("2d");
    const svg = d3.select("#nodes-svg").attr("width", width).attr("height", height);

    let data;
    try {
        data = await d3.json("data/graph_data.json");
    } catch (e) {
        console.error("Data missing.");
        return;
    }

    // SCALES
    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(data.nodes, d => d.owner_earnings)])
        .range([15, 55]); // Slightly larger bubbles to fit text

    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 100]);

    // FORCE SIMULATION
    const simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(d => 100 * (1 - d.similarity)))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => sizeScale(d.owner_earnings) + 2).iterations(2));

    // --- RENDER NODES (Groups) ---
    // We use a <g> (group) so the Circle and Text move together
    const nodeGroup = svg.append("g")
        .selectAll("g")
        .data(data.nodes)
        .join("g")
        .call(drag(simulation));

    // 1. The Circle
    nodeGroup.append("circle")
        .attr("r", d => sizeScale(d.owner_earnings))
        .attr("fill", d => colorScale(d.buffettScore))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer");

    // 2. The Symbol Text (New!)
    nodeGroup.append("text")
        .text(d => d.id)
        .attr("text-anchor", "middle")
        .attr("dy", ".35em") // Center vertically
        .attr("fill", "#000") // Black text works best on most RdYlGn colors
        .style("font-size", d => Math.min(12, sizeScale(d.owner_earnings) / 2) + "px") // Scale font slightly
        .style("font-weight", "bold")
        .style("pointer-events", "none"); // Let clicks pass through to the circle

    // --- HOVER LOGIC (The Report Card) ---
    const tooltip = d3.select("#tooltip") || d3.select("body").append("div").attr("id", "tooltip");
    
    nodeGroup.on("mouseover", (event, d) => {
        // Helper for Report Card Status
        const status = (val, threshold, reverse=false) => {
            const good = reverse ? val < threshold : val > threshold;
            return good ? "✅" : "⚠️";
        };

        const m = d.metrics;
        
        // Build the HTML Report Card
        const html = `
            <div style="min-width: 200px;">
                <h3 style="margin:0; color:#fff;">${d.name} (${d.id})</h3>
                <div style="font-size:12px; color:#ccc; margin-bottom:8px;">${d.sector}</div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; background:rgba(255,255,255,0.1); padding:5px; border-radius:4px;">
                    <span>Buffett Score:</span>
                    <strong style="font-size:16px; color:${colorScale(d.buffettScore)}">${d.buffettScore}</strong>
                </div>

                <div style="font-size:13px; line-height:1.6;">
                    <div>${status(m.gm, 0.40)} <b>Gross Margin:</b> ${(m.gm * 100).toFixed(1)}%</div>
                    <div>${status(m.sga_ratio, 0.30, true)} <b>SG&A / GP:</b> ${(m.sga_ratio * 100).toFixed(1)}%</div>
                    <div>${status(m.capex_ratio, 0.25, true)} <b>CapEx Intensity:</b> ${(m.capex_ratio * 100).toFixed(1)}%</div>
                    <div>${status(m.debt_years, 3.0, true)} <b>Debt Payoff:</b> ${m.debt_years.toFixed(1)} yrs</div>
                </div>
            </div>
        `;

        tooltip.style("opacity", 1)
            .html(html)
            .style("left", (event.pageX + 20) + "px")
            .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", () => tooltip.style("opacity", 0));

    // Interaction: Click to populate Sidebar (Keep existing sidebar logic if present)
    nodeGroup.on("click", (event, d) => {
        const sidebar = document.getElementById("sidebar");
        if(sidebar) {
            sidebar.classList.remove("collapsed");
            // Populate your existing sidebar IDs here...
            document.getElementById("detail-ticker").innerText = d.name;
            // (You can map the rest of the d.metrics to the sidebar as needed)
        }
    });

    // TICK FUNCTION
    simulation.on("tick", () => {
        ctx.clearRect(0, 0, width, height);
        
        // Draw Links
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        data.links.forEach(link => {
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
        });
        ctx.stroke();
        ctx.restore();

        // Move Groups (Circle + Text)
        nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // DRAG
    function drag(sim) {
        function dragstarted(event, d) {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
        }
        function dragged(event, d) {
            d.fx = event.x; d.fy = event.y;
        }
        function dragended(event, d) {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null; d.fy = null;
        }
        return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
    }
}

initGraph();
