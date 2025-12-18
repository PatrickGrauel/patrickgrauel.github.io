export class GraphRenderer {
    constructor(selector, data) {
        this.container = document.querySelector(selector);
        this.data = data;
        // Keep original list for filtering
        this.allNodes = [...data.nodes];
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.svg = d3.select('#main-svg');
        this.g = this.svg.append('g');
        this.simulation = null;
        this.callbacks = {};
        
        this.init();
    }

    init() {
        const zoom = d3.zoom()
            .scaleExtent([0.1, 8])
            .on('zoom', (e) => this.g.attr('transform', e.transform));
        this.svg.call(zoom);

        window.addEventListener('resize', () => {
            this.width = this.container.clientWidth;
            this.height = this.container.clientHeight;
            if(this.simulation) {
                this.simulation.force('center', d3.forceCenter(this.width/2, this.height/2));
                this.simulation.alpha(0.3).restart();
            }
        });

        this.render();
    }

    render() {
        this.g.selectAll('*').remove();

        this.simulation = d3.forceSimulation(this.data.nodes)
            .force('link', d3.forceLink(this.data.links).id(d => d.id).strength(0.1))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collide', d3.forceCollide().radius(d => this.getRadius(d) * 1.5));

        const link = this.g.append('g').selectAll('line')
            .data(this.data.links).join('line')
            .attr('stroke', '#333').attr('stroke-width', 1).attr('opacity', 0.4);

        const node = this.g.append('g').selectAll('g')
            .data(this.data.nodes).join('g')
            .call(d3.drag()
                .on('start', (e, d) => this.dragStart(e, d))
                .on('drag', (e, d) => this.dragMove(e, d))
                .on('end', (e, d) => this.dragEnd(e, d)))
            .on('click', (e, d) => {
                e.stopPropagation();
                this.highlight(d);
                if(this.callbacks.nodeClick) this.callbacks.nodeClick(d.id);
            });

        node.append('circle')
            .attr('r', d => this.getRadius(d))
            .attr('fill', d => this.getColor(d.sc))
            .attr('stroke', '#fff').attr('stroke-width', 1.5);

        node.append('text')
            .text(d => d.id)
            .attr('dy', '.35em')
            .attr('text-anchor', 'middle')
            .attr('font-size', d => Math.min(12, this.getRadius(d)/1.5))
            .attr('fill', '#fff')
            .style('pointer-events', 'none')
            .style('font-weight', 'bold');

        this.simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });
        
        this.nodeSelection = node;
        this.linkSelection = link;
    }

    highlight(d) {
        const connected = new Set([d.id]);
        this.data.links.forEach(l => {
            if(l.source.id === d.id) connected.add(l.target.id);
            if(l.target.id === d.id) connected.add(l.source.id);
        });

        this.nodeSelection.transition().attr('opacity', n => connected.has(n.id) ? 1 : 0.1);
        this.linkSelection.transition().attr('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 0.8 : 0.05);
    }

    reset() {
        this.nodeSelection.transition().attr('opacity', 1);
        this.linkSelection.transition().attr('opacity', 0.4);
    }

    // --- NEW: Filter Method ---
    filter(minScore) {
        // 1. Filter Nodes
        const visibleNodes = new Set(this.allNodes.filter(n => n.sc >= minScore).map(n => n.id));
        
        // 2. Update Visuals
        this.nodeSelection.style('display', d => visibleNodes.has(d.id) ? 'block' : 'none');
        
        // 3. Hide links connected to hidden nodes
        this.linkSelection.style('display', l => 
            visibleNodes.has(l.source.id) && visibleNodes.has(l.target.id) ? 'block' : 'none'
        );
    }

    getRadius(d) { return Math.max(12, Math.log(d.mc || 1e9) * 1.8); }
    getColor(score) { return score > 60 ? '#00c853' : (score > 40 ? '#ffd600' : '#ff3d00'); }
    onNodeClick(fn) { this.callbacks.nodeClick = fn; }
    dragStart(e, d) { if(!e.active) this.simulation.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; }
    dragMove(e, d) { d.fx=e.x; d.fy=e.y; }
    dragEnd(e, d) { if(!e.active) this.simulation.alphaTarget(0); d.fx=null; d.fy=null; }
}
