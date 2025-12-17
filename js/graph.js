async function initGraph() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // LAYERS
    const canvas = d3.select("#edges-canvas").attr("width", width).attr("height", height);
    const ctx = canvas.node().getContext("2d");
    const svg = d3.select("#nodes-svg").attr("width", width).attr("height", height);
    const tooltip = d3.select("#tooltip");

    // DATA
    let data;
    try { data = await d3.json("data/graph_data.json"); } catch (e) { console.error(e); return; }

    // SCALES
    const sizeScale = d3.scaleSqrt().domain([0, d3.max(data.nodes, d => d.owner_earnings)]).range([5, 30]);
    // Color by Sector (Categorical)
    const sectors = [...new Set(data.nodes.map(d => d.sector))].sort();
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(sectors);

    // SETUP UI
    const tickList = document.getElementById("tickers");
    data.nodes.forEach(n => {
        let opt = document.createElement("option");
        opt.value = n.id;
        tickList.appendChild(opt);
    });

    // Sector Legend
    const legend = document.getElementById("sector-legend");
    sectors.forEach(s => {
        if(s === "Unknown") return;
        let chip = document.createElement("div");
        chip.className = "sector-chip";
        chip.innerHTML = `<div class="dot" style="background:${colorScale(s)}"></div> ${s}`;
        chip.onclick = () => filterSector(s);
        legend.appendChild(chip);
    });

    // FORCE SIMULATION
    let simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(80).strength(0.2))
        .force("charge", d3.forceManyBody().strength(-150))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => sizeScale(d.owner_earnings) + 2));

    // RENDER
    const link = canvas.select(function() { return this; }); // Placeholder for canvas draw

    const node = svg.append("g")
        .selectAll("circle")
        .data(data.nodes)
        .join("circle")
        .attr("r", d => sizeScale(d.owner_earnings))
        .attr("fill", d => colorScale(d.sector))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .style("cursor", "pointer")
        .call(d3.drag()
            .on("start", (e, d) => { if(!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on("end", (e, d) => { if(!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
        );

    // INTERACTIONS
    let activeSector = null;

    function filterSector(s) {
        if (activeSector === s) {
            activeSector = null;
            node.transition().style("opacity", 1);
            document.querySelectorAll('.sector-chip').forEach(c => c.classList.remove('active'));
        } else {
            activeSector = s;
            node.transition().style("opacity", d => d.sector === s ? 1 : 0.1);
            document.querySelectorAll('.sector-chip').forEach(c => {
                c.classList.toggle('active', c.innerText.includes(s));
            });
        }
    }

    node.on("click", (e, d) => {
        document.getElementById("sidebar").classList.remove("collapsed");
        updateSidebar(d);
    });

    node.on("mouseover", (e, d) => {
        tooltip.style("opacity", 1)
            .html(`<b>${d.id}</b><br>${d.name}<br>${d.industry}`)
            .style("left", (e.pageX + 15) + "px")
            .style("top", (e.pageY - 15) + "px");
        
        // Highlight Peers
        node.style("stroke", n => n.id === d.id ? "#fff" : "none").style("stroke-width", 2);
    }).on("mouseout", () => {
        tooltip.style("opacity", 0);
        node.style("stroke", "#fff").style("stroke-width", 1);
    });

    simulation.on("tick", () => {
        ctx.clearRect(0, 0, width, height);
        
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath();
        data.links.forEach(l => {
            // Only draw if both nodes visible
            if (activeSector && (l.source.sector !== activeSector || l.target.sector !== activeSector)) return;
            ctx.moveTo(l.source.x, l.source.y);
            ctx.lineTo(l.target.x, l.target.y);
        });
        ctx.stroke();

        node.attr("cx", d => d.x).attr("cy", d => d.y);
    });

    // --- SIDEBAR UPDATES ---
    function updateSidebar(d) {
        document.getElementById("detail-ticker").innerText = `${d.name} (${d.id})`;
        document.getElementById("detail-industry").innerText = `${d.sector} > ${d.industry}`;
        
        document.getElementById("val-score").innerText = d.buffettScore + "/100";
        document.getElementById("val-fcf").innerText = "$" + (d.owner_earnings/1e9).toFixed(2) + "B";
        document.getElementById("val-roic").innerText = (d.metrics.roic * 100).toFixed(1) + "%";

        // Draw Charts
        drawChart("#chart-gm", d.history.gross_margin, "Gross Margin", "%");
        drawChart("#chart-roic", d.history.roic, "ROIC", "%");
        drawChart("#chart-debt", d.history.debt_to_equity, "Debt/Equity", "x");
    }

    function drawChart(containerId, dataSeries, title, suffix) {
        const container = d3.select(containerId);
        container.html(""); // Clear

        if (!dataSeries || dataSeries.length === 0) {
            container.append("div").text("No Data").style("color","#666").style("text-align","center").style("padding","20px");
            return;
        }

        container.append("div").className = "chart-title";
        container.select("div").html(`<span>${title}</span>`);

        const margin = {top: 10, right: 10, bottom: 20, left: 30};
        const w = 340 - margin.left - margin.right;
        const h = 130 - margin.top - margin.bottom;

        const svg = container.append("svg")
            .attr("width", w + margin.left + margin.right)
            .attr("height", h + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // X Axis
        const x = d3.scalePoint()
            .domain(dataSeries.map(d => d.year))
            .range([0, w]);
        
        svg.append("g")
            .attr("transform", `translate(0,${h})`)
            .call(d3.axisBottom(x).tickSize(0).tickPadding(8))
            .select(".domain").remove();
        
        svg.selectAll(".tick text").style("fill", "#64748b");

        // Y Axis
        const y = d3.scaleLinear()
            .domain([0, d3.max(dataSeries, d => d.value) * 1.1])
            .range([h, 0]);

        svg.append("g").call(d3.axisLeft(y).ticks(4).tickSize(-w))
            .select(".domain").remove();
        
        svg.selectAll(".tick line").style("stroke", "#334155").style("stroke-dasharray", "2").style("opacity", 0.3);
        svg.selectAll(".tick text").style("fill", "#64748b");

        // Line
        svg.append("path")
            .datum(dataSeries)
            .attr("fill", "none")
            .attr("stroke", "#3b82f6")
            .attr("stroke-width", 2)
            .attr("d", d3.line()
                .x(d => x(d.year))
                .y(d => y(d.value))
            );

        // Dots
        svg.selectAll("dot")
            .data(dataSeries)
            .enter()
            .append("circle")
            .attr("cx", d => x(d.year))
            .attr("cy", d => y(d.value))
            .attr("r", 3)
            .attr("fill", "#0f111a")
            .attr("stroke", "#3b82f6")
            .attr("stroke-width", 2);
    }

    // SEARCH LISTENER
    document.getElementById("search-input").addEventListener("change", (e) => {
        const val = e.target.value.toUpperCase();
        const found = data.nodes.find(n => n.id === val);
        if (found) {
            document.getElementById("sidebar").classList.remove("collapsed");
            updateSidebar(found);
            // Center View
            simulation.alpha(1).restart();
        }
        e.target.value = "";
    });
}

initGraph();
