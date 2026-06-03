// ═══════════════════════════════════════════════════════════════
// js/ui/tooltip.js
// Hover tooltip on course rows.
// Depends on: nothing
// ═══════════════════════════════════════════════════════════════

'use strict';

function showTooltip(e, c) {
    const tip = document.getElementById('tooltip');
    tip.style.display = 'block';
    tip.innerHTML = `
        <strong style="color:var(--text)">${c.title}</strong><br>
        <span style="color:var(--text-muted)">${c.code}</span><br>
        ${c.hours ? `<span>${c.hours}h</span> &nbsp;` : ''}
        ${c.ects ? `<span style="color:var(--accent2)">${c.ects} ECTS</span>` : ''}
        ${c.years ? `&nbsp;${getBlocsFromYears(c.years)}` : ''}`;
    moveTooltip(e);
}

function moveTooltip(e) {
    const tip = document.getElementById('tooltip');
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY - 10}px`;
}

function hideTooltip() {
    document.getElementById('tooltip').style.display = 'none';
}

document.addEventListener('mousemove', e => {
    const tip = document.getElementById('tooltip');
    if (tip.style.display === 'block') moveTooltip(e);
});
