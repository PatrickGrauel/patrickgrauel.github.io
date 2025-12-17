async function initGraph() {
    // 1. Fetch Data
    const data = await d3.json("data/graph_data.json");
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 2. Setup Render Layers
    const canvas = d3.select("#edges-canvas").attr("width", width).attr("height", height);
    const ctx = canvas.node().getContext("2d");
    const svg = d3.select("#nodes-svg").attr("width", width).attr("height", height);

    // 3. Scales
    // Size = Owner Earnings (Intrinsic Value)
    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(data.nodes, d => d.ownerEarnings)])
        .range([4, 25]);

    // Color = Buffett Score (0-100)
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
        .domain([0, 100]);

    // 4. Force Simulation
    const simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(d => 150 * (1 - d.similarity))) // Tighter links for higher similarity
        .force("charge", d3.forceManyBody().strength(-200)) // Spread out
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => sizeScale(d.ownerEarnings) + 2));

    // 5. Draw Nodes (SVG)
    const nodes = svg.selectAll("circle")
        .data(data.nodes)
        .enter().append("circle")
        .attr("r", d => sizeScale(d.ownerEarnings))
        .attr("fill", d => colorScale(d.buffettScore))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .call(drag(simulation));

    // Tooltip Interaction
    const tooltip = d3.select("#tooltip");
    nodes.on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(`
            <strong>${d.name} (${d.id})</strong><br/>
            Buffett Score: <span style="color:${colorScale(d.buffettScore)}">${d.buffettScore}</span><br/>
            Margins: ${(d.grossMargins * 100).toFixed(1)}% | ROE: ${(d.roe * 100).toFixed(1)}%
        `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", () => tooltip.transition().duration(500).style("opacity", 0));

    // 6. Simulation Tick (Animation Loop)
    simulation.on("tick", () => {
        // A. Clear and Draw Links on Canvas (Performance Hack)
        ctx.clearRect(0, 0, width, height);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        
        data.links.forEach(link => {
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
        });
        ctx.stroke();

        // B. Move Nodes in SVG
        nodes
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    });

    // Drag Behavior
    function drag(sim) {
        function dragstarted(event, d) {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        function dragended(event, d) {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }
}

initGraph();
