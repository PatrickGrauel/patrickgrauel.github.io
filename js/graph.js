const app = {
    // State
    nodes: [], links: [], watchlist: [],
    viewMode: 'network', // 'network' or 'heatmap'
    width: 0, height: 0,
    
    // D3 Objects
    svg: null, g: null, simulation: null,
    
    // Config
    colors: { 'Undervalued': '#00c853', 'Fair': '#ffd600', 'Overvalued': '#ff3d00' },

    init() {
        this.setupSVG();
        this.setupControls();
        this.loadData();
    },

    setupSVG() {
        const el = document.getElementById('graph-container');
        this.width = el.clientWidth;
        this.height = el.clientHeight;
        
        this.svg = d3.select('#main-svg');
        this.g = this.svg.append('g');
        
        // Zoom
        this.zoom = d3.zoom().scaleExtent([0.1, 8])
            .on('zoom', (e) => this.g.attr('transform', e.transform));
        this.svg.call(this.zoom);
        
        // Background Click -> Reset
        this.svg.on('click', (e) => {
            if(e.target.tagName === 'svg') this.resetFocus();
        });
    },

    setupControls() {
        // Search
        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value));
        
        // Layout Toggles
        document.getElementById('view-net').addEventListener('click', () => this.switchLayout('network'));
        document.getElementById('view-heat').addEventListener('click', () => this.switchLayout('heatmap'));
        
        // Watchlist
        const wl = document.getElementById('watchlist');
        document.getElementById('btn-watchlist').addEventListener('click', () => wl.classList.add('visible'));
        document.getElementById('wl-close').addEventListener('click', () => wl.classList.remove('visible'));
        
        // Close Sidebar
        document.getElementById('close-sidebar').addEventListener('click', () => {
            d3.select('#sidebar').classed('visible', false);
            this.resetFocus();
        });

        // Filter
        document.getElementById('filter-score').addEventListener('input', (e) => {
            document.getElementById('lbl-score').innerText = e.target.value;
            this.filterNodes(parseInt(e.target.value));
        });
    },

    loadData() {
        d3.json('data/graph_data.json?v=' + Date.now()).then(data => {
            this.nodes = data.nodes || [];
            this.links = data.links || [];
            
            // Clean nulls for visualization safety
            this.nodes.forEach(n => {
                if(!n.raw_metrics) n.raw_metrics = {};
                n.x = Math.random() * this.width;
                n.y = Math.random() * this.height;
            });

            this.renderGraph();
        });
    },

    // --- VISUALIZATION ENGINE ---
    renderGraph() {
        // Clear previous
        this.g.selectAll('*').remove();

        // SIMULATION (Network Mode)
        this.simulation = d3.forceSimulation(this.nodes)
            .force('charge', d3.forceManyBody().strength(-150))
            .force('center', d3.forceCenter(this.width/2, this.height/2))
            .force('collide', d3.forceCollide().radius(d => this.getRadius(d) + 4))
            .force('link', d3.forceLink(this.links).id(d => d.id).strength(0.2));

        // LINKS
        this.linkElements = this.g.append('g').selectAll('line')
            .data(this.links).join('line')
            .attr('stroke', '#30363d').attr('stroke-width', 1).attr('opacity', 0.3);

        // NODES
        this.nodeElements = this.g.append('g').selectAll('g')
            .data(this.nodes).join('g')
            .call(d3.drag()
                .on('start', (e, d) => {
                    if(!e.active) this.simulation.alphaTarget(0.3).restart();
                    d.fx = d.x; d.fy = d.y;
                })
                .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on('end', (e, d) => {
                    if(!e.active) this.simulation.alphaTarget(0);
                    d.fx = null; d.fy = null;
                }))
            .on('click', (e, d) => {
                e.stopPropagation();
                this.selectNode(d);
            });

        // 1. Valuation Ring (The "Halo")
        this.nodeElements.append('circle')
            .attr('r', d => this.getRadius(d) + 3)
            .attr('fill', 'none')
            .attr('stroke', d => {
                const mos = d.raw_metrics.margin_of_safety || 0;
                return mos > 20 ? this.colors.Undervalued : (mos < -20 ? this.colors.Overvalued : this.colors.Fair);
            })
            .attr('stroke-width', 2)
            .attr('opacity', 0.8);

        // 2. Main Bubble
        this.nodeElements.append('circle')
            .attr('r', d => this.getRadius(d))
            .attr('fill', '#1c2128') // Dark base
            .attr('stroke', '#fff').attr('stroke-width', 1);

        // 3. Text
        this.nodeElements.append('text')
            .text(d => d.id)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .style('font-size', d => Math.min(12, this.getRadius(d)/1.5))
            .style('font-weight', 'bold')
            .style('pointer-events', 'none');

        // Tick
        this.simulation.on('tick', () => {
            if(this.viewMode === 'network') {
                this.linkElements
                    .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
                this.nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);
            }
        });
    },

    // --- LAYOUT SWITCHER (Network vs Heatmap) ---
    switchLayout(mode) {
        this.viewMode = mode;
        document.querySelectorAll('#toolbar button').forEach(b => b.classList.remove('active'));
        document.getElementById(mode === 'network' ? 'view-net' : 'view-heat').classList.add('active');

        if(mode === 'heatmap') {
            this.simulation.stop();
            this.linkElements.attr('opacity', 0);
            
            // X: PE Ratio, Y: ROIC
            const xExtent = d3.extent(this.nodes, d => d.raw_metrics.pe_ratio || 0);
            const yExtent = d3.extent(this.nodes, d => d.raw_metrics.roic || 0);
            
            const x = d3.scaleLinear().domain([0, 60]).range([100, this.width - 100]).clamp(true);
            const y = d3.scaleLinear().domain([-10, 50]).range([this.height - 100, 100]).clamp(true);

            this.nodeElements.transition().duration(1000)
                .attr('transform', d => `translate(${x(d.raw_metrics.pe_ratio || 0)}, ${y(d.raw_metrics.roic || 0)})`);
                
            // Add Axis Labels (Simple)
            // (In a full implementation, we'd render proper D3 axes here)
            
        } else {
            this.linkElements.transition().duration(500).attr('opacity', 0.3);
            this.simulation.alpha(1).restart();
        }
    },

    // --- INTERACTION ---
    selectNode(d) {
        // Dim Peers
        const connectedIds = new Set();
        connectedIds.add(d.id);
        this.links.forEach(l => {
            if(l.source.id === d.id) connectedIds.add(l.target.id);
            if(l.target.id === d.id) connectedIds.add(l.source.id);
        });

        this.nodeElements.transition().attr('opacity', n => connectedIds.has(n.id) ? 1 : 0.1);
        this.linkElements.transition().attr('opacity', l => 
            (l.source.id === d.id || l.target.id === d.id) ? 0.6 : 0.05
        );

        this.showSidebar(d);
    },

    resetFocus() {
        this.nodeElements.transition().attr('opacity', 1);
        this.linkElements.transition().attr('opacity', 0.3);
    },

    filterNodes(minScore) {
        this.nodeElements.style('display', d => d.buffettScore >= minScore ? 'block' : 'none');
        this.linkElements.style('display', 'none'); // Hide links when filtering to avoid clutter
    },

    // --- SIDEBAR ---
    showSidebar(d) {
        const sb = d3.select('#sidebar');
        sb.classed('visible', true);
        const c = d3.select('#details-content');
        c.html('');

        // HEADER
        const m = d.raw_metrics;
        const color = m.margin_of_safety > 0 ? this.colors.Undervalued : this.colors.Overvalued;
        
        c.append('h1').text(d.id).style('margin', '0');
        c.append('div').text(d.name).style('color', '#888').style('margin-bottom', '20px');
        
        c.append('div').style('display', 'flex').style('justify-content', 'space-between').style('margin-bottom', '20px')
         .html(`
            <div><div style="font-size:10px; color:#888">PRICE</div><div style="font-size:20px; font-weight:bold">$${m.current_price}</div></div>
            <div><div style="font-size:10px; color:#888">FAIR VALUE</div><div style="font-size:20px; font-weight:bold; color:${color}">$${m.fair_value}</div></div>
            <div><div style="font-size:10px; color:#888">SCORE</div><div style="font-size:20px; font-weight:bold">${d.buffettScore}</div></div>
         `);

        // BUTTONS
        const btnRow = c.append('div').style('margin-bottom', '20px');
        btnRow.append('button').text(this.watchlist.includes(d.id) ? 'Unwatch' : '+ Watchlist')
            .on('click', () => this.toggleWatchlist(d));

        // DUPONT ANALYSIS
        c.append('div').attr('class', 'm-label').text('DUPONT BREAKDOWN (ROE)');
        const dp = c.append('div').attr('class', 'dupont-container');
        dp.append('div').attr('class', 'dupont-box').html(`<div style="font-size:14px">${m.net_margin.toFixed(1)}%</div><div style="font-size:9px">MARGIN</div>`);
        dp.append('div').attr('class', 'dupont-op').text('×');
        dp.append('div').attr('class', 'dupont-box').html(`<div style="font-size:14px">${m.dupont_turnover.toFixed(2)}</div><div style="font-size:9px">TURNOVER</div>`);
        dp.append('div').attr('class', 'dupont-op').text('×');
        dp.append('div').attr('class', 'dupont-box').html(`<div style="font-size:14px">${m.dupont_leverage.toFixed(2)}</div><div style="font-size:9px">LEVERAGE</div>`);
        dp.append('div').attr('class', 'dupont-op').text('=');
        dp.append('div').attr('class', 'dupont-box').style('background', 'rgba(0,200,83,0.1)').style('color','#00c853').html(`<div style="font-size:14px">${m.roe.toFixed(1)}%</div><div style="font-size:9px">ROE</div>`);

        // METRICS WITH SPARKLINES
        c.append('div').style('margin-top','20px').attr('class', 'm-label').text('KEY TRENDS (5Y)');
        this.addSparkRow(c, 'Revenue', m.revenue_cagr.toFixed(1)+'% CAGR', d.history.revenue, '#0079fd');
        this.addSparkRow(c, 'Net Income', '', d.history.net_income, '#00c853');
        this.addSparkRow(c, 'Free Cash Flow', '', d.history.fcf, '#ffd600');

        // EARNINGS QUALITY
        const eqColor = m.earnings_quality > 1 ? this.colors.Undervalued : this.colors.Overvalued;
        c.append('div').style('margin-top','20px').style('background', 'rgba(255,255,255,0.05)').style('padding','10px').style('border-radius','6px')
         .html(`
            <div class="m-label">EARNINGS QUALITY (CF / Net Income)</div>
            <div style="font-size:18px; font-weight:bold; color:${eqColor}">${m.earnings_quality.toFixed(2)}x</div>
            <div style="font-size:10px; color:#888">${m.earnings_quality > 1 ? 'High Quality: Cash > Profits' : 'Warning: Profits > Cash'}</div>
         `);
    },

    addSparkRow(container, label, valueLabel, history, color) {
        if(!history || history.length < 2) return;
        
        const row = container.append('div').style('margin-top', '10px');
        row.append('div').style('display','flex').style('justify-content','space-between')
           .html(`<span style="font-size:12px">${label}</span><span style="font-size:12px; font-weight:bold">${valueLabel}</span>`);
        
        const svg = row.append('svg').attr('class', 'sparkline');
        const w = 380, h = 30;
        
        const values = history.map(h => h.value);
        const x = d3.scaleLinear().domain([0, values.length-1]).range([0, w]);
        const y = d3.scaleLinear().domain(d3.extent(values)).range([h, 2]);
        
        const line = d3.line().x((d, i) => x(i)).y(d => y(d));
        
        svg.append('path').datum(values)
           .attr('d', line).attr('class', 'spark-path')
           .attr('stroke', color).attr('fill', 'none');
    },

    // --- WATCHLIST ---
    toggleWatchlist(d) {
        const idx = this.watchlist.indexOf(d.id);
        if(idx === -1) this.watchlist.push(d.id);
        else this.watchlist.splice(idx, 1);
        this.renderWatchlist();
        this.showSidebar(d); // Refresh button state
    },

    renderWatchlist() {
        const container = document.getElementById('wl-list');
        container.innerHTML = '';
        this.watchlist.forEach(id => {
            const node = this.nodes.find(n => n.id === id);
            const div = document.createElement('div');
            div.className = 'wl-item';
            div.innerHTML = `<span>${id}</span><span style="color:${node.raw_metrics.margin_of_safety>0?'#00c853':'#ff3d00'}">${node.buffettScore}</span>`;
            div.onclick = () => {
                this.selectNode(node);
                this.focusOnNode(node);
            };
            container.appendChild(div);
        });
    },

    // Utils
    getRadius(d) { return Math.max(15, Math.log10(d.marketCap || 1e9) * 4); },
    handleSearch(t) { /* Same as before */ },
    focusOnNode(n) { /* Same as before */ }
};

document.addEventListener('DOMContentLoaded', () => app.init());
