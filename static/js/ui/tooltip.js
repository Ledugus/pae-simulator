// ═══════════════════════════════════════════════════════════════
// js/ui/tooltip.js
// Hover tooltip on course rows.
// Depends on: nothing
// ═══════════════════════════════════════════════════════════════

'use strict';

function showCourseTooltip(e, c) {
    const tip = document.getElementById('course-tooltip');
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
    const tip = document.getElementById('course-tooltip');
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY - 10}px`;
}

function hideTooltip() {
    document.getElementById('course-tooltip').style.display = 'none';
}

document.addEventListener('mousemove', e => {
    const tip = document.getElementById('course-tooltip');
    if (tip.style.display === 'block') moveTooltip(e);
});

function showOptionTooltip(e, opt) {
    const tip = document.getElementById('option-tooltip');
    tip.style.display = 'block';
    tip.innerHTML = `
        <strong style="color:var(--text)">${opt.label}</strong><br>
        <span style="color:var(--text-muted)">${opt.description}</span><br>
        ${opt.min_ects ? `<span style="color:var(--accent2)">MIN ${opt.min_ects} ECTS</span>` : ''}`;
    moveTooltip(e);
}

function moveTooltip(e) {
    const tip = document.getElementById('option-tooltip');
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY - 10}px`;
}

function hideTooltip() {
    document.getElementById('option-tooltip').style.display = 'none';
}

document.addEventListener('mousemove', e => {
    const tip = document.getElementById('option-tooltip');
    if (tip.style.display === 'block') moveTooltip(e);
});
