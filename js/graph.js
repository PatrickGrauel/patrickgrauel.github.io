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
        console.error("Data missing. Run the Python action.");
        return;
    }

    // SCALES
    // Log scale for size so massive companies don't swallow the screen
    const sizeScale = d3.scaleLog()
        .domain([1e8, d3.max(data.nodes, d => d.owner_earnings)])
        .range([18, 55]) // Min size 18px to fit text
        .clamp(true);

    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 100]);

    // PHYSICS ENGINE
    const simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(d => 120 * (1 - d.similarity)))
        .force("charge", d3.forceManyBody().strength(-350))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => sizeScale(d.owner_earnings) + 4).iterations(2));

    // --- RENDER NODES ---
    // Using a group <g> to keep Circle and Text together
    const nodeGroup = svg.append("g")
        .selectAll("g")
        .data(data.nodes)
        .join("g")
        .call(drag(simulation));

    // 1. The Bubble (Circle)
    nodeGroup.append("circle")
        .attr("r", d => sizeScale(d.owner_earnings))
        .attr("fill", d => colorScale(d.buffettScore))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer");

    // 2. The Symbol (Text)
    nodeGroup.append("text")
        .text(d => d.id)
        .attr("text-anchor", "middle")
        .attr("dy", ".35em") // Vertically center
        .attr("fill", "#0f111a") // Dark text for contrast
        .style("font-family", "sans-serif")
        .style("font-weight", "bold")
        .style("font-size", d => Math.min(14, sizeScale(d.owner_earnings) / 2.5) + "px") // Scale font to bubble
        .style("pointer-events", "none"); // Clicks pass through to circle

    // --- HOVER: BUFFETT INDICATOR DEEP DIVE ---
    const tooltip = d3.select("#tooltip") || d3.select("body").append("div").attr("id", "tooltip");

    nodeGroup.on("mouseover", (event, d) => {
        // Status Helper: Returns Symbol based on Buffett Thresholds
        const check = (val, threshold, reverse=false) => {
            const isGood = reverse ? val < threshold : val > threshold;
            return isGood ? "✅" : "⚠️";
        };

        const m = d.metrics;
        
        // Tooltip Content
        const html = `
            <div style="min-width: 220px; font-family: sans-serif;">
                <div style="border-bottom: 1px solid #444; padding-bottom: 8px; margin-bottom: 8px;">
                    <strong style="font-size: 16px; color: white;">${d.name}</strong>
                    <div style="color: #888; font-size: 12px;">${d.sector}</div>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px;">
                    <span style="color: #ccc;">Buffett Score:</span>
                    <strong style="color: ${colorScale(d.buffettScore)}; font-size: 16px;">${d.buffettScore}/100</strong>
                </div>

                <div style="font-size: 13px; line-height: 1.8; color: #ddd;">
                    <div>${check(m.gm, 0.40)} <b>Gross Margin:</b> ${(m.gm * 100).toFixed(1)}%</div>
                    <div>${check(m.sga_ratio, 0.30, true)} <b>SG&A / GP:</b> ${(m.sga_ratio * 100).toFixed(1)}%</div>
                    <div>${check(m.capex_ratio, 0.25, true)} <b>CapEx Intensity:</b> ${(m.capex_ratio * 100).toFixed(1)}%</div>
                    <div>${check(m.debt_years, 3.0, true)} <b>Debt Payoff:</b> ${m.debt_years.toFixed(1)} yrs</div>
                </div>
            </div>
        `;

        tooltip.style("opacity", 1)
            .html(html)
            .style("left", (event.pageX + 20) + "px")
            .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", () => tooltip.style("opacity", 0));

    // --- ANIMATION LOOP ---
    simulation.on("tick", () => {
        ctx.clearRect(0, 0, width, height);
        
        // Draw Links (Canvas)
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        data.links.forEach(link => {
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
        });
        ctx.stroke();
        ctx.restore();

        // Move Nodes (SVG Group)
        nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // DRAG BEHAVIOR
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
