renderSparkline(containerId, data, indAvg) {
        // ... (keep setup code) ...

        // FILTER: Remove null values before plotting
        const validData = data.filter(d => d.value !== null && d.value !== undefined);
        
        if (validData.length < 2) return; // Don't draw single points

        const x = d3.scalePoint()
            .domain(validData.map(d => d.date)) // Use valid dates only
            .range([0, w]).padding(0.1);
            
        const vals = validData.map(d => d.value);
        if(indAvg) vals.push(indAvg);
        
        // ... (keep y scale code) ...

        // Update Line Generator to use validData
        const line = d3.line()
            .defined(d => d.value !== null) // Safety check
            .x(d => x(d.date))
            .y(d => y(d.value))
            .curve(d3.curveMonotoneX);
            
        svg.append('path').datum(validData) // Bind validData!
            .attr('d', line).attr('class', 'line-stock');
            
        // ... (Update area and dots to use validData too) ...
        svg.selectAll('circle').data(validData).enter().append('circle')
            .attr('cx', d => x(d.date)).attr('cy', d => y(d.value))
            .attr('r', 2.5).attr('fill', '#0079fd').attr('stroke', '#161b22').attr('stroke-width', 1);
    },
