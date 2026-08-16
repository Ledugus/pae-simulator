// ═══════════════════════════════════════════════════════════════
// js/ui/program.js
// Middle panel: list view and grid view of the current selection.
// Depends on: config.js, state.js, helpers.js, selection.js
// ═══════════════════════════════════════════════════════════════

'use strict';

function buildProgramView(program_state) {
    if (program_state.activeView === 'list') {
        buildProgramList(program_state);
    } else if (program_state.activeView === 'grid') {
        buildProgramGrid(program_state);
    } else if (program_state.activeView === 'stats') {
        buildProgramStats(program_state);
    }
}

// ── List view ──────────────────────────────────────────────────

function buildProgramList(program_state) {
    const container = document.getElementById('program-content');
    container.innerHTML = '';
    let hasAny = false;


    // Options — only those with at least one selected course
    Object.values(program_state.optionData).forEach(opt => {
        const courses = Array.from(program_state.selected_courses)
            .filter(code => program_state.courseOptions[code]?.includes(opt.id))
            .map(code => program_state.courseData[code]);
        if (!courses.length) return;
        hasAny = true;
        container.appendChild(makeProgramOption(opt.label, opt.palette, courses));
    });

    if (!hasAny) {
        container.innerHTML = '<div class="empty-program">Cliquez sur des cours pour les ajouter à votre programme.</div>';
    }
}

function makeProgramOption(label, palette, courses) {
    const totalEcts = courses.reduce((s, c) => s + (c.ects || 0), 0);

    const option_el = document.createElement('div');
    option_el.className = 'program-option';
    option_el.innerHTML = `
        <div class="program-option-header">
            <div class="program-option-dot" style="background:${palette.primary}"></div>
            <div class="program-option-name">${label}</div>
            <span class="badge badge-ects">${totalEcts} ECTS</span>
        </div>`;

    courses.forEach(c => {
        const course_item = document.createElement('div');
        course_item.className = 'program-course-item';
        course_item.innerHTML = `
            <div class="program-course-dot" style="background:${palette.primary}"></div>
            <div class="program-course-name" title="${c.title}">${c.title}</div>
            <div class="program-course-ects">${c.ects || '?'}</div>
            ${!c.mandatory
                ? '<div class="program-remove">×</div>'
                : '<div style="width:20px"></div>'}`;
        if (!c.mandatory) {
            course_item.querySelector('.program-remove')
                .addEventListener('click', () => toggleCourse(c.code));
        }
        option_el.appendChild(course_item);
    });

    return option_el;
}

// ── Grid view ──────────────────────────────────────────────────
const ECTS_YEAR_LIMIT = 75;
const ECTS_SEMESTER_SOFT_LIMIT = 30;

function getEligibleZones(course) {
    const years = (!course.years || course.years === '12') ? ['1', '2'] : [course.years];
    const semesters = (!course.semester || course.semester === '12') ? ['1', '2'] : [course.semester];

    const zones = [];
    years.forEach(y => semesters.forEach(s => zones.push({ year: y, semester: s })));

    return {
        zones,                       // all legal grid zones for this course
        pinned: zones.length === 1   // exactly one legal zone => fixed, non-draggable
    };
}

function zoneKey(zone) {
    return `${zone.year}-${zone.semester}`;
}

function getZoneECTSTotal(program_state, targetZoneKey, excludeCode = null) {
    let total = 0;
    program_state.selected_courses.forEach(code => {
        if (code === excludeCode) return; // exclude the course currently being dragged
        const course = program_state.courseData[code];
        if (!course) return;

        const { zones, pinned } = getEligibleZones(course);
        const key = pinned
            ? zoneKey(zones[0])
            : (program_state.placements[code] ? zoneKey(program_state.placements[code]) : 'other');

        if (key === targetZoneKey) total += course.ects;
    });
    return total;
}

function getYearECTSTotal(program_state, year, excludeCode = null) {
    let total = 0;
    program_state.selected_courses.forEach(code => {
        if (code === excludeCode) return; // exclude the course currently being dragged
        const course = program_state.courseData[code];
        if (!course) return;

        const { zones, pinned } = getEligibleZones(course);
        const resolved = pinned
            ? zones[0]
            : program_state.placements[code];

        if (resolved === resolved.year === year) total += course.ects;
    });
    return total;
}

function getLoadStatus(total, typical = ECTS_SEMESTER_SOFT_LIMIT, tolerance = 3) {
    if (typical <= total && total <= typical + tolerance) return 'ok';       // exactly 30 -> green
    if (total > typical + tolerance) return 'over';       // above 30 -> red
    return 'under';                           // below 30 -> orange/yellow
}

function buildProgramGrid(program_state) {
    const container = document.getElementById('program-content');

    container.innerHTML = `
        <div class="year-grid">
            ${[1, 2].map(year => [1, 2].map(sem => `
                <div class="grid-col">
                    <div class="grid-col-header">M${year} — Q${sem}</div>
                    <div class="grid-col-courses" data-zone="${year}-${sem}"></div>
                </div>
            `).join('')).join('')}
        </div>
        <div class="other-courses-wrap">
          <div class="other-courses-header">Not yet placed</div>
          <div class="other-courses-grid" data-zone="other"></div>
        </div>`;

    document.querySelectorAll(`.grid-col-courses[data-zone]`).forEach(col => {
        const header = col.previousElementSibling;
        const zone = col.dataset.zone
        const total = getZoneECTSTotal(program_state, zone)
        const status = getLoadStatus(total)
        header.innerHTML = `M${zone[0]} — Q${zone[2]}
        <span class="ects-total load-${status}">${total}</span>/${ECTS_SEMESTER_SOFT_LIMIT}`;
    });

    Array.from(program_state.selected_courses)
        .map(code => program_state.courseData[code])
        .filter(Boolean)
        .forEach(course => {
            const { zones, pinned } = getEligibleZones(course);
            let targetKey;
            if (pinned) {
                targetKey = zoneKey(zones[0]);
            } else {
                const placed = program_state.placements[course.code];
                targetKey = placed ? zoneKey(placed) : 'other';
            }
            const target = container.querySelector(`[data-zone="${targetKey}"]`);
            if (!target) return;

            const palette = getCourseColorPalette(program_state, course.code);

            const card = document.createElement('div');
            card.className = pinned ? 'course-card pinned' : 'course-card';
            card.style.setProperty('--ects', course.ects);
            card.style.setProperty('--card-bg', palette.bg);
            card.style.setProperty('--card-border', palette.primary);
            card.style.setProperty('--card-text-dark', palette.dark);
            card.style.setProperty('--card-text-mid', palette.mid);
            card.style.setProperty('--card-badge-bg', palette.badge);
            card.innerHTML = `
                <div class="course-card-toprow">
                    <span class="course-card-code">${course.code}</span>
                    <span class="course-card-lang">${course.lang || ''}</span>
                    <span class="course-card-ects">${course.ects} ECTS</span>
                </div>
                <div class="course-card-title">${course.title}</div>`;
            if (!pinned) attachDragHandlers(card, course, zones, program_state);
            target.appendChild(card);
        });
}

function attachDragHandlers(card, course, zones, program_state) {

    card.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
        const eligibleKeys = new Set(zones.map(zoneKey));

        const allZoneEls = document.querySelectorAll('[data-zone]');
        allZoneEls.forEach(z => {
            const key = z.dataset.zone;
            if (!eligibleKeys.has(key)) {
                z.classList.add('zone-ineligible'); // wrong year/semester entirely
                return;
            }
            const currentTotal = getZoneECTSTotal(program_state, key, course.code);
            if (currentTotal + course.ects > ECTS_YEAR_LIMIT) {
                z.classList.add('zone-full');       // right period, but no room left
            } else {
                z.classList.add('zone-eligible');   // droppable
            }
        });
        const rect = card.getBoundingClientRect();
        const ghost = card.cloneNode(true);
        ghost.classList.add('drag-ghost');
        ghost.style.width = rect.width + 'px';
        ghost.style.left = rect.left + 'px';
        ghost.style.top = rect.top + 'px';
        document.body.appendChild(ghost);
        card.classList.add('dragging-source');

        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        let hoveredZone = null;

        function onMove(ev) {
            ghost.style.left = (ev.clientX - offsetX) + 'px';
            ghost.style.top = (ev.clientY - offsetY) + 'px';

            ghost.style.display = 'none'; // exclude ghost from its own hit-test
            const under = document.elementFromPoint(ev.clientX, ev.clientY);
            ghost.style.display = '';
            const zone = under && under.closest('[data-zone]');

            if (zone !== hoveredZone) {
                if (hoveredZone) hoveredZone.classList.remove('zone-hover');
                hoveredZone = zone;
                if (hoveredZone) hoveredZone.classList.add('zone-hover');
            }
        }

        function onUp() {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            ghost.remove();
            allZoneEls.forEach(z => z.classList.remove('zone-eligible', 'zone-ineligible', 'zone-hover'));

            const dropKey = hoveredZone && hoveredZone.dataset.zone;
            const isRealZone = dropKey && eligibleKeys.has(dropKey);

            if (isRealZone) {
                const [year] = dropKey.split('-')
                const currentTotal = getYearECTSTotal(program_state, year, course.code);
                const wouldExceed = currentTotal + course.ects > ECTS_YEAR_LIMIT;

                if (!wouldExceed) {
                    const [year, semester] = dropKey.split('-');
                    program_state.placements[course.code] = { year, semester };
                }
                // else: over budget -> state untouched, card snaps back on re-render
            } else if (dropKey === 'other') {
                delete program_state.placements[course.code];
            }

            buildProgramGrid(program_state);
        }

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    });
}


// ── Stats view ──────────────────────────────────────────────────

function buildProgramStats(program_state, useEcts = false) {
    const container = document.getElementById('program-content');
    container.innerHTML = '';

    const textColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--text-muted').trim();
    const gridColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--border').trim();

    function computeScores() {
        const scoreOf = useEcts ? (course) => course.ects : () => 1;
        return Array.from(program_state.selected_courses)
            .flatMap(course => {
                const c = program_state.courseData[course];
                return c.teachers.map(teacher => ({ teacher, score: scoreOf(c) }));
            })
            .reduce((acc, { teacher, score }) => {
                if (!acc[teacher]) {
                    acc[teacher] = { score: 0, name: program_state.teachers[teacher] };
                }
                acc[teacher].score += score;
                return acc;
            }, {});
    }

    const sorted = [];
    const MAX_VISIBLE = 6;
    let showAll = false;

    // --- header ---
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 10px 16px 8px;';

    const title = document.createElement('span');
    title.className = 'group-label-header';
    title.style.cssText = 'padding: 0; margin: 0;';
    title.textContent = 'Professeurs';

    const segmented = document.createElement('div');
    segmented.style.cssText = 'display: flex; border: 1px solid var(--border2); border-radius: 6px; overflow: hidden;';

    const options = [
        { label: 'Nombre de cours', value: false },
        { label: 'ECTS', value: true }
    ];

    options.forEach(({ label, value }) => {
        const opt = document.createElement('button');
        opt.textContent = label;
        opt.className = 'filter-btn';
        opt.style.cssText = 'border: none; border-radius: 0; margin: 0;';
        opt.onclick = () => {
            if (useEcts === value) return;
            useEcts = value;
            updateSegmented();
            rebuildScores();
        };
        segmented.appendChild(opt);
    });

    function updateSegmented() {
        Array.from(segmented.children).forEach((btn, i) => {
            btn.className = (options[i].value === useEcts) ? 'filter-btn active' : 'filter-btn';
            btn.style.cssText = 'border: none; border-radius: 0; margin: 0;';
        });
    }


    header.appendChild(title);
    header.appendChild(segmented);
    container.appendChild(header);

    // --- chart ---
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative;';
    container.appendChild(wrapper);

    const canvas = document.createElement('canvas');
    wrapper.appendChild(canvas);

    const chart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: '#4d7cfe',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: {
                        stepSize: 1,
                        color: textColor,
                        font: { family: 'DM Mono', size: 10 }
                    },
                    grid: { color: gridColor }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: textColor,
                        font: { family: 'DM Sans', size: 12 }
                    }
                }
            }
        }
    });

    // --- show more button ---
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.style.cssText = 'margin-top: 8px;';
    btn.onclick = () => {
        showAll = !showAll;
        renderChart();
    };
    container.appendChild(btn);

    function renderChart() {
        const visible = showAll ? sorted : sorted.slice(0, MAX_VISIBLE);
        wrapper.style.height = (visible.length * 40 + 80) + 'px';
        chart.data.labels = visible.map(t => t.name);
        chart.data.datasets[0].data = visible.map(t => t.score);
        chart.update();

        btn.style.display = sorted.length > MAX_VISIBLE ? '' : 'none';
        btn.textContent = showAll
            ? 'Show less'
            : 'Show all ' + sorted.length + ' teachers';
    }

    function rebuildScores() {
        sorted.length = 0;
        Object.values(computeScores())
            .sort((a, b) => b.score - a.score)
            .forEach(t => sorted.push(t));
        renderChart();
    }

    // --- init ---
    updateSegmented();
    rebuildScores();
}

function wireViewSwitcher() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const program_state = getProgramState(state.current_program_id);
            if (!program_state) return;
            program_state.activeView = btn.dataset.view;
            buildProgramView(program_state);
        });
    });
}
