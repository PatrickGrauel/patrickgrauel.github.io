export const ChartEngine = {
    // --- RADAR / SPIDER CHART ---
    renderRadar(containerId, scores) {
        const container = d3.select(containerId);
        container.html('');
        
        const width = 280, height = 220;
        const radius = Math.min(width, height) / 2 - 30;
        
        const svg = container.append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${width/2},${height/2})`);
            
        // Config: 5 Axes
        const data = [
            {axis: "Pricing", value: scores.Pricing},
            {axis: "Efficiency", value: scores.Efficiency},
            {axis: "Health", value: scores.Health},
            {axis: "Growth", value: scores.Growth},
            {axis: "Cash", value: scores.Cash}
        ];
        
        const angleSlice = Math.PI * 2 / data.length;
        const rScale = d3.scaleLinear().range([0, radius]).domain([0, 100]);

        // 1. Draw Grid (Web)
        const levels = [20, 40, 60, 80, 100];
        levels.forEach(level => {
            svg.append('circle')
                .attr('r', rScale(level))
                .attr('fill', 'none')
                .attr('stroke', '#333')
                .attr('stroke-dasharray', '3,3');
        });

        // 2. Draw Axes
        const axis = svg.selectAll('.axis')
            .data(data).enter().append('g').attr('class', 'axis');

        axis.append('line')
            .attr('x1', 0).attr('y1', 0)
            .attr('x2', (d, i) => rScale(100) * Math.cos(angleSlice * i - Math.PI/2))
            .attr('y2', (d, i) => rScale(100) * Math.sin(angleSlice * i - Math.PI/2))
            .attr('stroke', '#444').attr('stroke-width', 1);

        axis.append('text')
            .attr('class', 'legend')
            .style('font-size', '10px').style('fill', '#888')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('x', (d, i) => rScale(115) * Math.cos(angleSlice * i - Math.PI/2))
            .attr('y', (d, i) => rScale(115) * Math.sin(angleSlice * i - Math.PI/2))
            .text(d => d.axis);

        // 3. Draw Blob
        const radarLine = d3.lineRadial()
            .curve(d3.curveLinearClosed)
            .radius(d => rScale(d.value))
            .angle((d, i) => i * angleSlice);

        svg.append('path')
            .datum(data)
            .attr('d', radarLine)
            .style('fill', 'rgba(0, 121, 253, 0.2)')
            .style('stroke', '#0079fd')
            .style('stroke-width', 2);
            
        // 4. Draw Points
        svg.selectAll('.radarCircle')
            .data(data).enter().append('circle')
            .attr('class', 'radarCircle')
            .attr('r', 3)
            .attr('cx', (d, i) => rScale(d.value) * Math.cos(angleSlice * i - Math.PI/2))
            .attr('cy', (d, i) => rScale(d.value) * Math.sin(angleSlice * i - Math.PI/2))
            .style('fill', '#0079fd');
    },

    // --- TIMELINE CHART ---
    renderTimeline(containerId, historyData, metricKey, label) {
        const container = d3.select(containerId);
        // Do not clear immediately if appending multiple, but here we assume one chart per container
        // or handled externally. For simplicity, append new div.
        const wrapper = container.append('div').style('margin-bottom', '20px');
        
        wrapper.append('div')
            .style('font-size', '11px').style('font-weight', 'bold').style('color', '#888').style('margin-bottom', '5px')
            .text(label.toUpperCase());

        const width = 300, height = 100;
        const margin = {top: 10, right: 10, bottom: 20, left: 35};
        
        const svg = wrapper.append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Prepare Data
        // historyData is { revenue: [...], net_income: [...], dates: [...] }
        // We need to zip dates with the specific metric
        const series = historyData[metricKey];
        if (!series || series.length === 0) {
            wrapper.append('div').text('No Data').style('color', '#444');
            return;
        }
        
        const dates = historyData.dates;
        const dataset = series.map((val, i) => ({ date: dates[i], value: val }));

        // Scales
        const x = d3.scalePoint()
            .domain(dates)
            .range([0, width]);
            
        const y = d3.scaleLinear()
            .domain([0, d3.max(dataset, d => d.value) * 1.1])
            .range([height, 0]);

        // Axes
        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x).tickSize(0).tickPadding(8))
            .select('.domain').attr('stroke', '#333');
            
        svg.append('g')
            .call(d3.axisLeft(y).ticks(4).tickFormat(d => d >= 1e9 ? (d/1e9).toFixed(0)+'B' : (d/1e6).toFixed(0)+'M'))
            .select('.domain').remove();
            
        svg.selectAll('.tick text').attr('fill', '#666');
        svg.selectAll('.tick line').attr('stroke', '#222');

        // Line
        const line = d3.line()
            .x(d => x(d.date))
            .y(d => y(d.value))
            .curve(d3.curveMonotoneX);

        svg.append('path')
            .datum(dataset)
            .attr('fill', 'none')
            .attr('stroke', '#00c853')
            .attr('stroke-width', 2)
            .attr('d', line);

        // Area (Gradient)
        const area = d3.area()
            .x(d => x(d.date))
            .y0(height)
            .y1(d => y(d.value))
            .curve(d3.curveMonotoneX);
            
        svg.append('path')
            .datum(dataset)
            .attr('fill', 'rgba(0, 200, 83, 0.1)')
            .attr('d', area);
            
        // Dots
        svg.selectAll('.dot')
            .data(dataset).enter().append('circle')
            .attr('cx', d => x(d.date))
            .attr('cy', d => y(d.value))
            .attr('r', 3)
            .attr('fill', '#00c853');
    }
};
