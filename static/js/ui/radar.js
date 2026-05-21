// ═══════════════════════════════════════════════════════════════
// js/ui/radar.js
// Right panel: orientation radar chart.
// Depends on: config.js, state.js, helpers.js
// ═══════════════════════════════════════════════════════════════

'use strict';

function buildRadar() {
    const svg = document.getElementById('radar-svg');
    svg.innerHTML = '';

    const program_state = getProgramState(state.current_program_id);
    if (!program_state) return;

    // Only options with a group_label are meaningful radar axes (up to 6)
    const axes = Object.values(program_state.optionData)
        .filter(o => o.group_label)
        .slice(0, 6);

    if (axes.length < 3) return;

    const byOption = getEctsByOption(program_state);
    const n  = axes.length;
    const cx = 130, cy = 115, r = 80;

    // Grid rings
    for (let ring = 1; ring <= 4; ring++) {
        const rr  = r * ring / 4;
        const pts = axes.map((_, i) => {
            const a = (i / n) * 2 * Math.PI - Math.PI / 2;
            return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
        }).join(' ');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', pts);
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#2a3050');
        poly.setAttribute('stroke-width', '1');
        svg.appendChild(poly);
    }

    // Axis lines and labels
    axes.forEach((opt, i) => {
        const a  = (i / n) * 2 * Math.PI - Math.PI / 2;
        const x1 = cx + r * Math.cos(a);
        const y1 = cy + r * Math.sin(a);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx);  line.setAttribute('y1', cy);
        line.setAttribute('x2', x1); line.setAttribute('y2', y1);
        line.setAttribute('stroke', '#2a3050');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);

        const lx  = cx + (r + 18) * Math.cos(a);
        const ly  = cy + (r + 18) * Math.sin(a);
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', lx);
        txt.setAttribute('y', ly + 4);
        txt.setAttribute('text-anchor',
            Math.abs(Math.cos(a)) < 0.1 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end');
        txt.setAttribute('fill', opt.palette.primary);
        txt.setAttribute('font-size', '9');
        txt.setAttribute('font-family', 'DM Sans, sans-serif');
        txt.textContent = opt.label;
        svg.appendChild(txt);
    });

    // Data polygon
    const dataPoints = axes.map((opt, i) => {
        const val = Math.min(1, (byOption[opt.id] || 0) / RADAR_MAX);
        const a   = (i / n) * 2 * Math.PI - Math.PI / 2;
        return `${cx + r * val * Math.cos(a)},${cy + r * val * Math.sin(a)}`;
    });
    const dataPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    dataPoly.setAttribute('points', dataPoints.join(' '));
    dataPoly.setAttribute('fill', 'rgba(77,124,254,0.2)');
    dataPoly.setAttribute('stroke', '#4d7cfe');
    dataPoly.setAttribute('stroke-width', '2');
    svg.appendChild(dataPoly);

    // Data dots
    axes.forEach((opt, i) => {
        const val = Math.min(1, (byOption[opt.id] || 0) / RADAR_MAX);
        if (val === 0) return;
        const a    = (i / n) * 2 * Math.PI - Math.PI / 2;
        const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circ.setAttribute('cx', cx + r * val * Math.cos(a));
        circ.setAttribute('cy', cy + r * val * Math.sin(a));
        circ.setAttribute('r', '3');
        circ.setAttribute('fill', opt.palette.primary);
        svg.appendChild(circ);
    });
}
