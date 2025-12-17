async function initGraph() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 1. Setup Render Layers
    const canvas = d3.select("#edges-canvas").attr("width", width).attr("height", height);
    const ctx = canvas.node().getContext("2d");
    const svg = d3.select("#nodes-svg").attr("width", width).attr("height", height);

    // 2. Fetch Data (Gracefully handle if data isn't built yet)
    let data;
    try {
        data = await d3.json("data/graph_data.json");
    } catch (e) {
        console.error("Data not found. The Action might still be running.");
        return;
    }

    // 3. Scales
    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(data.nodes, d => d.ownerEarnings)])
        .range([3, 25]); // Size by Owner Earnings

    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
        .domain([0, 100]); // Color by Buffett Score

    // 4. Simulation Setup
    const simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(d => 100 * (1 - d.similarity)))
        .force("charge", d3.forceManyBody().strength(-150))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => sizeScale(d.ownerEarnings) + 2).iterations(2));

    // 5. Draw Nodes
    const nodes = svg.selectAll("circle")
        .data(data.nodes)
        .enter().append("circle")
        .attr("r", d => sizeScale(d.ownerEarnings))
        .attr("fill", d => colorScale(d.buffettScore))
        .attr("stroke", "#222")
        .attr("stroke-width", 1.5)
        .call(drag(simulation));

    // 6. Tooltip Logic
    const tooltip = d3.select("#tooltip");
    nodes.on("mouseover", (event, d) => {
        const scoreColor = d.buffettScore > 70 ? "score-good" : (d.buffettScore > 40 ? "score-mid" : "score-bad");

        tooltip.style("opacity", 1)
            .html(`
                <strong style="font-size:14px">${d.name}</strong><br/>
                <span style="color:#888">${d.sector}</span><br/><br/>
                Buffett Score: <b class="${scoreColor}">${d.buffettScore}</b><br/>
                <hr style="border:0; border-top:1px solid #333; margin:8px 0"/>
                Margins: ${(d.grossMargins * 100).toFixed(1)}%<br/>
                Debt/Eq: ${d.debtToEquity}<br/>
                ROE: ${(d.roe * 100).toFixed(1)}%
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", () => tooltip.style("opacity", 0));

    // 7. Animation Loop (Canvas Edges + SVG Nodes)
    simulation.on("tick", () => {
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.globalAlpha = 0.2; // Dim edges
        ctx.strokeStyle = "#fff";
        ctx.beginPath();

        data.links.forEach(link => {
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
        });
        ctx.stroke();
        ctx.restore();

        nodes
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    });

    // Drag Helper
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
