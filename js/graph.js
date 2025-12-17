async function initGraph() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const canvas = d3.select("#edges-canvas").attr("width", width).attr("height", height);
    const ctx = canvas.node().getContext("2d");
    const svg = d3.select("#nodes-svg").attr("width", width).attr("height", height);

    let data;
    try { data = await d3.json("data/graph_data.json"); } catch (e) { return; }

    const sizeScale = d3.scaleLog().domain([1e8, d3.max(data.nodes, d => d.owner_earnings)]).range([15, 50]).clamp(true);
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 100]);

    // Populate Datalist & Sector Dropdown
    const tickList = document.getElementById("tickers-list");
    const sectorSelect = document.getElementById("sector-select");
    const sectors = new Set();
    
    data.nodes.forEach(n => {
        sectors.add(n.sector);
        const opt = document.createElement("option");
        opt.value = n.id;
        tickList.appendChild(opt);
    });
    
    [...sectors].sort().forEach(s => {
        if(s && s !== "Unknown") {
            const opt = document.createElement("option");
            opt.value = s; opt.innerText = s;
            sectorSelect.appendChild(opt);
        }
    });

    // SIMULATION
    let simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(100).strength(0.1))
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => sizeScale(d.owner_earnings) + 5).iterations(2));

    const nodeGroup = svg.append("g").selectAll("g")
        .data(data.nodes).join("g").call(drag(simulation));

    nodeGroup.append("circle")
        .attr("r", d => sizeScale(d.owner_earnings))
        .attr("fill", d => colorScale(d.buffettScore))
        .attr("stroke", "#fff").attr("stroke-width", 1.5).style("cursor", "pointer");

    nodeGroup.append("text")
        .text(d => d.id).attr("text-anchor", "middle").attr("dy", ".35em")
        .style("font-size", d => Math.min(12, sizeScale(d.owner_earnings)/2.5)+"px")
        .style("font-weight","800").style("fill","#0f111a").style("pointer-events","none");

    // --- MULTI-SELECT LOGIC ---
    let selectedIds = new Set();

    function toggleSelection(d) {
        if (selectedIds.has(d.id)) {
            selectedIds.delete(d.id);
        } else {
            if (selectedIds.size >= 10) alert("Max 10 items for comparison.");
            else selectedIds.add(d.id);
        }
        renderSelection();
    }

    function renderSelection() {
        // Visual Highlight
        nodeGroup.select("circle").attr("stroke", d => selectedIds.has(d.id) ? "#3b82f6" : "#fff")
                                  .attr("stroke-width", d => selectedIds.has(d.id) ? 4 : 1.5);

        // Sidebar List
        const bar = document.getElementById("selection-bar");
        bar.innerHTML = "";
        
        if (selectedIds.size === 0) {
            bar.innerHTML = '<span style="color:#64748b; font-size:12px; padding:4px;">Select companies to compare...</span>';
            document.getElementById("metrics-table").innerHTML = "";
            drawRadar(null);
            return;
        }

        const selectedNodes = data.nodes.filter(n => selectedIds.has(n.id));
        
        // Draw Chips
        selectedNodes.forEach(n => {
            const chip = document.createElement("div");
            chip.className = "chip";
            chip.innerHTML = `${n.id} <span onclick="event.stopPropagation(); window.removeSel('${n.id}')">✕</span>`;
            chip.onclick = () => window.focusNode(n.id);
            bar.appendChild(chip);
        });

        // Draw Comparison Table
        buildTable(selectedNodes);
        
        // Draw Radar (Use Average or Most Recent? Let's use Most Recent for clarity, or overlay?)
        // For simplicity: Draw the LAST selected node's radar
        const lastNode = selectedNodes[selectedNodes.length - 1];
        drawRadar(lastNode.pillars);
    }

    // Expose remove function to window for the "X" button
    window.removeSel = (id) => {
        const node = data.nodes.find(n => n.id === id);
        if(node) toggleSelection(node);
    };

    window.focusNode = (id) => {
        // Center view logic if needed
    };

    function buildTable(nodes) {
        const container = document.getElementById("metrics-table");
        container.innerHTML = "";
        
        // Header Row (Tickers)
        let html = `<div class="comp-row" style="border-bottom: 2px solid #444;">
                        <span class="comp-label">METRIC</span>
                        ${nodes.map(n => `<span class="comp-val" style="color:${colorScale(n.buffettScore)}">${n.id}</span>`).join("")}
                    </div>`;

        // Data Rows
        // Get all raw keys from first node
        const keys = Object.keys(nodes[0].raw);
        
        keys.forEach(key => {
            html += `<div class="comp-row">
                        <span class="comp-label">${key}</span>
                        ${nodes.map(n => `<span class="comp-val">${n.raw[key] || '--'}</span>`).join("")}
                     </div>`;
        });
        
        container.innerHTML = html;
    }

    // CLICK HANDLER
    nodeGroup.on("click", (e, d) => {
        document.getElementById("sidebar").classList.remove("collapsed");
        toggleSelection(d);
    });

    // SEARCH HANDLER
    const searchBox = document.getElementById("search-box");
    searchBox.addEventListener("change", (e) => {
        const val = e.target.value.toUpperCase();
        const node = data.nodes.find(n => n.id === val);
        if (node) {
            if(!selectedIds.has(node.id)) toggleSelection(node);
            e.target.value = ""; // Clear box
        }
    });

    // HOVER
    nodeGroup.on("mouseover", (e, d) => {
        const tooltip = d3.select("#tooltip");
        tooltip.style("opacity", 1).html(`<strong>${d.name}</strong><br/>Score: ${d.buffettScore}`)
               .style("left", (e.pageX+15)+"px").style("top", (e.pageY-15)+"px");
    }).on("mouseout", () => d3.select("#tooltip").style("opacity", 0));

    // ANIMATION LOOP
    simulation.on("tick", () => {
        ctx.clearRect(0, 0, width, height);
        ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.beginPath();
        data.links.forEach(l => { ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y); });
        ctx.stroke(); ctx.restore();
        nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function drag(sim) {
        return d3.drag().on("start", (e,d)=>{ if(!e.active)sim.alphaTarget(0.3).restart(); d.fx=d.x;d.fy=d.y; })
                        .on("drag", (e,d)=>{ d.fx=e.x;d.fy=e.y; })
                        .on("end", (e,d)=>{ if(!e.active)sim.alphaTarget(0); d.fx=null;d.fy=null; });
    }
}

// RADAR
function drawRadar(pillars) {
    const svg = d3.select("#radar-viz");
    svg.selectAll("*").remove();
    if(!pillars) return;

    const keys = Object.keys(pillars);
    const radius = 70; const center = {x: 110, y: 100};
    const rScale = d3.scaleLinear().range([0, radius]).domain([0, 100]);
    const angleSlice = Math.PI * 2 / keys.length;

    // Grid
    [25,50,75,100].forEach(l => {
        svg.append("circle").attr("cx", center.x).attr("cy", center.y).attr("r", rScale(l))
           .style("fill","none").style("stroke","#444").style("stroke-dasharray","2,4");
    });

    // Shape
    const points = keys.map((k, i) => {
        const angle = i * angleSlice - Math.PI/2;
        return [center.x + rScale(pillars[k]) * Math.cos(angle), center.y + rScale(pillars[k]) * Math.sin(angle)];
    });

    svg.append("polygon").attr("points", points.map(p=>p.join(",")).join(" "))
       .style("fill","rgba(59,130,246,0.5)").style("stroke","#3b82f6").style("stroke-width",2);
       
    // Labels
    keys.forEach((k, i) => {
        const angle = i * angleSlice - Math.PI/2;
        const x = center.x + (radius+15)*Math.cos(angle);
        const y = center.y + (radius+15)*Math.sin(angle);
        svg.append("text").attr("x",x).attr("y",y).text(k).attr("text-anchor","middle").style("font-size","10px").style("fill","#888");
    });
}

initGraph();
