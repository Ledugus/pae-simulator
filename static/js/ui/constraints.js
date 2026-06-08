// ═══════════════════════════════════════════════════════════════
// js/ui/constraints.js
// Right panel: constraint progress bars and ECTS ring.
// Depends on: state.js, helpers.js
// ═══════════════════════════════════════════════════════════════

'use strict';

function buildConstraints(program_state) {
    const container = document.getElementById('constraints-list');
    container.innerHTML = '';
    const byOption = getEctsByOption(program_state);
    const totalEcts = program_state?.total_ects || 120;

    // Total programme
    renderConstraintBar(container, {
        label: 'Total programme',
        current: getSelectedEcts(),
        target: totalEcts,
        max: totalEcts,
    });

    // One bar per selected option that has a min_ects target
    program_state.selected_options.forEach(opt_id => {
        const opt = program_state.optionData[opt_id];
        console.log("rendering opt", opt.label, opt.min_ects)
        if (!opt || !opt.min_ects) return;
        renderConstraintBar(container, {
            label: opt.label,
            current: byOption[opt.id] || 0,
            target: opt.min_ects,
            max: opt.max_ects || null,
            color: opt.palette.primary,
        });
    });
}

function renderConstraintBar(container, { label, current, target, max, color }) {
    if (!target) return; // skip bars with no meaningful target
    const pct = Math.min(100, Math.round(current / target * 100));
    const met = current >= target;
    const over = max && current > max;
    const statusColor = over ? '#f05050' : met ? '#3dd68c' : current > 0 ? '#f0a050' : '#4a5578';
    const barColor = color || statusColor;

    const item = document.createElement('div');
    item.className = 'constraint-item';
    item.innerHTML = `
        <div class="constraint-label">
            <div class="constraint-status" style="background:${statusColor}"></div>
            ${label}
        </div>
        <div class="constraint-bar-wrap">
            <div class="constraint-bar-fill" style="width:${pct}%; background:${barColor}"></div>
        </div>
        <div class="constraint-numbers">
            <span>${current} ECTS</span>
            <span>${over ? '⚠ dépassé' : met ? '✓ atteint' : `${target - current} manquants`}</span>
        </div>`;
    container.appendChild(item);
}

function updateRing(totalEcts = 120) {
    const ects = getSelectedEcts();
    const circumference = 2 * Math.PI * 42;
    const offset = circumference * (1 - Math.min(1, ects / totalEcts));
    const fill = document.getElementById('ring-fill');
    if (!fill) return;

    fill.setAttribute('stroke-dashoffset', offset);
    fill.setAttribute('stroke',
        ects > totalEcts ? '#f05050' :
            ects >= totalEcts * 0.75 ? '#3dd68c' : '#4d7cfe');

    document.getElementById('ring-num').textContent = ects;
    document.getElementById('hdr-ects').textContent = ects;
}
