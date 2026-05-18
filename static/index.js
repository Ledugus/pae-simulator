// ═══════════════════════════════════════════════════════════════
// index.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ─── CONFIG ────────────────────────────────────────────────────
// Static colour palette for options, assigned by index at load time.
// The tronc commun always gets the first colour.

const PALETTE = [
    '#4d7cfe', // tronc commun (always)
    '#f0a050',
    '#3dd68c',
    '#f05090',
    '#50c8f0',
    '#f0d050',
    '#f07050',
    '#a855f7',
    '#b0c0ff',
    '#7a88b0',
];

const TRONC_COLOR = PALETTE[0];

const RADAR_MAX = 20; // ECTS for 100% on radar


// ─── STATE ─────────────────────────────────────────────────────
const state = {
    programs: new Map(),
    current_program_id: null,
    allPrograms: null,
}

function getProgramState(program_id) {
    if (!state.programs.has(program_id)) {
        state.programs.set(program_id, {
            // program data
            populated: false,
            tronc_commun: [],
            courseData: {},
            courseOptions: {},
            optionData: {},

            // program state
            selected_courses: new Set(),
            selected_options: new Set(),
            activeFilter: 'all',
            searchQuery: '',
        });
    }
    return state.programs.get(program_id);
}


// ─── API ───────────────────────────────────────────────────────
async function fetchAllPrograms() {
    const response = await fetch(`/api/programs`);
    if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
    }
    return response.json();
}
async function fetchProgram(programId) {
    const response = await fetch(`/api/programs/${programId}`);
    if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
    }
    return response.json();
}


// ─── INIT ──────────────────────────────────────────────────────
async function init() {
    setLoadingState('loading');

    try {
        const allProgramsRaw = await fetchAllPrograms();
        const allPrograms = Object.fromEntries(allProgramsRaw.map(item => [item.title, item]));
        state.allPrograms = allPrograms

        // Basic widgets (load once)
        buildProgramSelector(allPrograms);
        wireFilters();
        wireSearch();

        setLoadingState('ready');
    } catch (error) {
        setLoadingState('error', error.message);
    }
}

function programEventHandler(event) {
    if (event.target.value != 0) {
        const defaultOption = document.getElementById('program-selector-default-option');
        if (defaultOption)
            defaultOption.remove();
    }
    loadProgram(event.target.value)
}

async function loadProgram(program_id) {

    if (state.current_program_id === program_id) { return };
    setLoadingState('loading');

    try {
        const program_state = getProgramState(program_id);
        if (!program_state.populated) {
            let program_data = await fetchProgram(program_id);
            populateState(program_state, program_data);
            program_state.populated = true; // only mark populated after data is in
        }
        state.current_program_id = program_id
        buildPageOfProgram(program_state);
        // Restore the filter UI to match this program's saved state
        restoreFilterUI(program_state);
        setLoadingState('ready');
    } catch (error) {
        setLoadingState('error', error.message);
    }
}

function buildPageOfProgram(program_state) {
    autoSelectMandatory(program_state);
    buildCourseCatalogue(program_state);
    buildProgramList();
    buildConstraints(program_state);
    buildRadar();
    updateRing(program_state.total_ects);
    updateAll();
}

// ─── LOADING STATE ─────────────────────────────────────────────

function setLoadingState(status, message = '') {
    document.getElementById('ui-loading').hidden = status !== 'loading';
    document.getElementById('ui-error').hidden = status !== 'error';
    document.getElementById('ui-ready').hidden = status !== 'ready';

    if (status === 'error') {
        document.getElementById('error-message').textContent = message;
    }
}

// ─── DATA HELPERS ──────────────────────────────────────────────

// Builds state.courseData, state.courseOptions, and state.options
function populateState(program_state, program_data) {

    // ── Tronc commun ──
    program_state.tronc_commun = program_data.tronc_commun;

    program_data.tronc_commun.forEach(c => {
        program_state.courseData[c.code] = { ...c };
        program_state.courseOptions[c.code] = ['tronc'];  // 'tronc' as a sentinel key
    });

    // ── Options — dict keyed by opt.id ──
    program_state.optionData = {};

    program_data.options.forEach((opt, i) => {
        const optWithColor = {
            ...opt,
            color: PALETTE[(i % (PALETTE.length - 1)) + 1],
        };
        program_state.optionData[opt.id] = optWithColor;

        opt.courses.forEach(c => {
            if (!program_state.courseData[c.code]) {
                program_state.courseData[c.code] = { ...c };
            }
            if (!program_state.courseOptions[c.code]) {
                program_state.courseOptions[c.code] = [];
            }
            program_state.courseOptions[c.code].push(opt.id);
        });
    });
}

function autoSelectMandatory(program_state) {
    // Tronc commun courses are pre-selected
    program_state.selected_options.add("tronc");
    Object.values(program_state.courseData).forEach(c => {
        if (program_state.courseOptions[c.code].includes("tronc")) program_state.selected_courses.add(c.code);
    });
}

// Returns the option object for a course code, or null for tronc commun.
function getOptionsForCourse(program_state, code) {
    const optIds = program_state.courseOptions[code] || [];
    return optIds
        .filter(id => id !== 'tronc')
        .map(id => program_state.optionData[id])
        .filter(Boolean); // guard against a stale id with no matching option
}

// Returns the color for a course.
// Uses the first option's color, or tronc color if it only appears in tronc.
function getCourseColor(program_state, code) {
    const opts = getOptionsForCourse(program_state, code);
    return opts.length > 0 ? opts[0].color : TRONC_COLOR;
}

function getSelectedEcts() {
    let total = 0;
    const program_state = getProgramState(state.current_program_id);
    program_state.selected_courses.forEach(code => {
        total += program_state.courseData[code]?.ects || 0;
    });
    return total;
}

// Returns { optionId -> ects_selected } for all options,
// plus a 'tronc' key for the tronc commun.
function getEctsByOption(program_state) {
    const counts = { tronc: 0 };
    Object.values(program_state.optionData).forEach(o => counts[o.id] = 0);

    program_state.selected_courses.forEach(code => {
        const optId = program_state.courseOptions[code];
        const ects = program_state.courseData[code]?.ects || 0;
        counts[optId] = (counts[optId] || 0) + ects;
    });
    return counts;
}

// BUILD PROGRAM SELECTOR (header)

function buildProgramSelector(allPrograms) {
    const container = document.getElementById('program-selector')
    container.innerHTML = ''
    const defaultOption = document.createElement("option");
    defaultOption.id = 'program-selector-default-option'
    defaultOption.className = 'program-selector-option';
    defaultOption.value = 0;
    defaultOption.textContent = "Choose your master program"
    container.appendChild(defaultOption)

    for (const [key, value] of Object.entries(allPrograms)) {
        const option = document.createElement("option");
        option.className = 'program-selector-option';
        option.value = value.id;
        option.textContent = value.title;
        container.appendChild(option)
    }

}

// ─── BUILD COURSE CATALOGUE (left panel) ───────────────────────

function buildCourseCatalogue(program_state) {
    const container = document.getElementById('browser-content');
    container.innerHTML = '';

    // ── Tronc commun block ──
    const troncOpt = { id: 0, label: "Tronc commun" }

    const el = document.createElement('div');
    el.className = 'section-group';
    el.dataset.groupKey = 'opt-${opt.id}';

    const hdr = document.createElement('div');
    hdr.className = 'option-header';
    hdr.dataset.id = "tronc";
    hdr.innerHTML = `
        <div class="section-title">Tronc commun</div>
        <div class="section-chevron">▼</div>`;
    hdr.addEventListener('click', () => el.classList.toggle('collapsed'));
    el.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'section-body';
    el.appendChild(body);


    renderCourseList(body, program_state.tronc_commun, TRONC_COLOR);
    container.appendChild(el);

    // ── One collapsible group per option ──
    // Group options by group_label for visual separation
    const grouped = groupOptionsByGroupLabel(Object.values(program_state.optionData));

    grouped.forEach(({ groupLabel, options }) => {
        if (groupLabel) {
            // Group header (non-collapsible, just a label)
            const groupHdr = document.createElement('div');
            groupHdr.className = 'group-label-header';
            groupHdr.textContent = groupLabel;
            container.appendChild(groupHdr);
        }

        options.forEach(opt => {
            const { el, body } = makeCollapsibleGroup(opt);
            renderCourseList(body, opt.courses, opt.color);
            container.appendChild(el);
        });
    });
}

// Groups the flat options list by group_label while preserving order.
function groupOptionsByGroupLabel(options) {
    const result = [];
    const seen = {};
    options.forEach(opt => {
        const key = opt.group_label || '__ungrouped__';
        if (!seen[key]) {
            seen[key] = { groupLabel: opt.group_label || null, options: [] };
            result.push(seen[key]);
        }
        seen[key].options.push(opt);
    });
    return result;
}

function makeCollapsibleGroup(opt) {
    let program_state = getProgramState(state.current_program_id)
    const el = document.createElement('div');
    el.className = 'section-group';
    el.dataset.groupKey = 'opt-${opt.id}';


    const hdr_content = document.createElement('div');
    hdr_content.innerHTML = `
        <div class="section-title">${opt.label}</div>
        <div class="section-chevron">▼</div>`;
    hdr_content.addEventListener('click', () => el.classList.toggle('collapsed'));

    const hdr_check = document.createElement('div');
    hdr_check.innerHTML = `
        <div class="check">${program_state.selected_options.has(opt.id) ? '✓' : ''}</div>`;
    hdr_check.addEventListener('click', () => toggleOption(opt));


    const hdr = document.createElement('div');
    hdr.className = 'option-header';
    hdr.dataset.id = opt.id;
    if (program_state.selected_options.has(opt.id)) hdr.classList.add('selected');
    hdr.appendChild(hdr_check);
    hdr.appendChild(hdr_content);
    el.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'section-body';
    el.appendChild(body);

    return { el, body };
}

function renderCourseList(container, courses, color) {
    let program_state = getProgramState(state.current_program_id)
    courses.forEach(c => {
        // convert to boolean
        const isMandatory = !!c.mandatory;

        const row = document.createElement('div');
        row.className = 'course-row';
        row.dataset.code = c.code;
        row.dataset.lang = c.language || '';
        row.dataset.semester = c.semester || '';
        row.dataset.ects = c.ects || 0;

        if (isMandatory) row.classList.add('mandatory');
        if (program_state.selected_courses.has(c.code)) row.classList.add('selected');

        row.innerHTML = `
            <div class="check">${program_state.selected_courses.has(c.code) ? '✓' : ''}</div>
            <div class="course-info">
                <div class="course-code">${c.code}</div>
                <div class="course-title" title="${c.title}">${c.title}</div>
            </div>
            <div class="course-meta">
                ${c.ects ? `<span class="badge badge-ects">${c.ects}</span>` : ''}
                ${c.language ? `<span class="badge badge-lang">${c.language}</span>` : ''}
                ${c.semester ? `<span class="badge badge-q">${c.semester}</span>` : ''}
            </div>`;

        if (!isMandatory) {
            row.addEventListener('click', () => toggleCourse(c.code));
        }
        row.addEventListener('mouseenter', e => showTooltip(e, c));
        row.addEventListener('mouseleave', hideTooltip);

        container.appendChild(row);
    });
}


// ─── BUILD PROGRAM (middle panel) ──────────────────────────────

function buildProgramList() {
    const program_state = getProgramState(state.current_program_id);
    const container = document.getElementById('program-content');
    container.innerHTML = '';
    let hasAny = false;

    // ── Tronc commun ──
    const troncCourses = Array.from(program_state.selected_courses)
        .filter(code => program_state.courseOptions[code].includes("tronc"))
        .map(code => program_state.courseData[code]);

    if (troncCourses.length) {
        hasAny = true;
        container.appendChild(makeProgramSection('Tronc commun', TRONC_COLOR, troncCourses));
    }
    // ── Options (only show options that have at least one course selected) ──
    Object.values(program_state.optionData).forEach(opt => {
        const courses = Array.from(program_state.selected_courses)
            .filter(code => program_state.courseOptions[code].includes(opt.id))
            .map(code => program_state.courseData[code]);

        if (!courses.length) return;
        hasAny = true;
        container.appendChild(makeProgramSection(opt.label, opt.color, courses));
    });

    if (!hasAny) {
        container.innerHTML = '<div class="empty-program">Cliquez sur des cours pour les ajouter à votre programme.</div>';
    }
}

function makeProgramSection(label, color, courses) {
    const totalEcts = courses.reduce((s, c) => s + (c.ects || 0), 0);

    const sec = document.createElement('div');
    sec.className = 'program-section';
    sec.innerHTML = `
        <div class="program-section-header">
            <div class="program-section-dot" style="background:${color}"></div>
            <div class="program-section-name">${label}</div>
            <span class="badge badge-ects">${totalEcts} ECTS</span>
        </div>`;

    courses.forEach(c => {
        const item = document.createElement('div');
        item.className = 'program-course-item';
        item.innerHTML = `
            <div class="program-course-dot" style="background:${color}"></div>
            <div class="program-course-name" title="${c.title}">${c.title}</div>
            <div class="program-course-ects">${c.ects || '?'}</div>
            ${!c.mandatory
                ? '<div class="program-remove">×</div>'
                : '<div style="width:20px"></div>'}`;
        if (!c.mandatory) {
            item.querySelector('.program-remove').addEventListener('click', () => toggleCourse(c.code));
        }
        sec.appendChild(item);
    });

    return sec;
}


// ─── BUILD CONSTRAINTS (right panel) ───────────────────────────
// Constraints are derived from the program data, not hardcoded.

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

    // One bar per option that has a min_ects constraint
    Object.values(program_state.optionData).forEach(opt => {
        if (!opt.min_ects) return;
        renderConstraintBar(container, {
            label: opt.label,
            current: byOption[opt.id] || 0,
            target: opt.min_ects,
            max: opt.max_ects || null,
            color: opt.color,
        });
    });
}

function renderConstraintBar(container, { label, current, target, max, color }) {
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


// ─── BUILD RADAR (right panel) ─────────────────────────────────
// Axes are derived from options that have a group_label (main engineering options).

function buildRadar() {
    const svg = document.getElementById('radar-svg');
    svg.innerHTML = '';

    // Use options that belong to a named group as radar axes, up to 6
    const program_state = getProgramState(state.current_program_id);
    const axes = Object.values(program_state.optionData)
        .filter(o => o.group_label)
        .slice(0, 6);

    if (axes.length < 3) return; // not enough axes for a meaningful radar

    const byOption = getEctsByOption(program_state);
    const n = axes.length;
    const cx = 130, cy = 115, r = 80;

    // Grid rings
    for (let ring = 1; ring <= 4; ring++) {
        const rr = r * ring / 4;
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

    // Axes and labels
    axes.forEach((opt, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        const x1 = cx + r * Math.cos(a);
        const y1 = cy + r * Math.sin(a);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx); line.setAttribute('y1', cy);
        line.setAttribute('x2', x1); line.setAttribute('y2', y1);
        line.setAttribute('stroke', '#2a3050');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);

        const lx = cx + (r + 18) * Math.cos(a);
        const ly = cy + (r + 18) * Math.sin(a);
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', lx);
        txt.setAttribute('y', ly + 4);
        txt.setAttribute('text-anchor', Math.abs(Math.cos(a)) < 0.1 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end');
        txt.setAttribute('fill', opt.color);
        txt.setAttribute('font-size', '9');
        txt.setAttribute('font-family', 'DM Sans, sans-serif');
        txt.textContent = opt.label;
        svg.appendChild(txt);
    });

    // Data polygon
    const dataPoints = axes.map((opt, i) => {
        const val = Math.min(1, (byOption[opt.id] || 0) / RADAR_MAX);
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
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
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circ.setAttribute('cx', cx + r * val * Math.cos(a));
        circ.setAttribute('cy', cy + r * val * Math.sin(a));
        circ.setAttribute('r', '3');
        circ.setAttribute('fill', opt.color);
        svg.appendChild(circ);
    });
}


// ─── ECTS RING ─────────────────────────────────────────────────

function updateRing(totalEcts = 120) {
    const ects = getSelectedEcts();
    const circumference = 2 * Math.PI * 42;
    const offset = circumference * (1 - Math.min(1, ects / totalEcts));
    const fill = document.getElementById('ring-fill');

    fill.setAttribute('stroke-dashoffset', offset);
    fill.setAttribute('stroke', ects > totalEcts ? '#f05050' : ects >= totalEcts * 0.75 ? '#3dd68c' : '#4d7cfe');
    document.getElementById('ring-num').textContent = ects;
    document.getElementById('hdr-ects').textContent = ects;
}


// ─── TOGGLE COURSE ─────────────────────────────────────────────

function toggleCourse(code) {

    const program_state = getProgramState(state.current_program_id);
    const c = program_state.courseData[code];
    if (!c || c.mandatory) return;

    if (program_state.selected_courses.has(code)) {
        program_state.selected_courses.delete(code);
    } else {
        program_state.selected_courses.add(code);
    }
    updateAll();
}

function toggleOption(opt) {

    const program_state = getProgramState(state.current_program_id);

    const opt_id = opt.id;
    if (!opt || opt.mandatory) return;

    if (program_state.selected_options.has(opt_id)) {
        program_state.selected_options.delete(opt_id);
    } else {
        program_state.selected_options.add(opt_id);
    }
    updateAll();
}

function updateAll() {
    const program_state = getProgramState(state.current_program_id);

    // Update selected courses
    document.querySelectorAll('.course-row').forEach(row => {
        console.log("Selector Course")
        const sel = program_state.selected_courses.has(row.dataset.code);
        row.classList.toggle('selected', sel);
        row.querySelector('.check').textContent = sel ? '✓' : '';
    });

    // Update selected options
    document.querySelectorAll('.option-header').forEach(option => {
        console.log("Selector Option")
        console.log(option.dataset.id, Number(option.dataset.id))
        if (option.dataset.id !== "tronc") {
            console.log(option.dataset.id, Number(option.dataset.id))
            const sel = program_state.selected_options.has(Number(option.dataset.id));
            option.classList.toggle('selected', sel);
            option.querySelector('.check').textContent = sel ? '✓' : '';
        }
    });
    buildProgramList();
    buildConstraints(program_state);
    buildRadar();
    updateRing(program_state.total_ects);  // pass the program's actual total
    applyFilters();
    console.log(program_state.selected_options)
}


// ─── FILTERS ───────────────────────────────────────────────────

function applyFilters() {

    const program_state = getProgramState(state.current_program_id);
    const f = program_state.activeFilter;
    const q = program_state.searchQuery.toLowerCase();

    document.querySelectorAll('.course-row').forEach(row => {
        const { lang, semester, ects, code } = row.dataset;
        const title = program_state.courseData[code]?.title?.toLowerCase() || '';

        const filterOk = (
            f === 'all' ||
            (f === 'EN' && lang === 'EN') ||
            (f === 'FR' && lang === 'FR') ||
            (f === 'q1' && semester === 'q1') ||
            (f === 'q2' && semester === 'q2') ||
            (f === '5' && ects === '5')
        );
        const searchOk = !q || title.includes(q) || code.toLowerCase().includes(q);

        row.classList.toggle('hidden', !filterOk || !searchOk);
    });

    document.querySelectorAll('.section-group').forEach(grp => {
        const anyVisible = Array.from(grp.querySelectorAll('.course-row'))
            .some(r => !r.classList.contains('hidden'));
        grp.style.display = !anyVisible && q ? 'none' : '';
    });
}

function wireFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Write to the current program's state, not the top-level state
            if (state.current_program_id !== null) {
                getProgramState(state.current_program_id).activeFilter = btn.dataset.filter;
            }
            applyFilters();
        });
    });
}

function wireSearch() {
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');

    input.addEventListener('input', () => {
        // Write to the current program's state, not the top-level state
        if (state.current_program_id !== null) {
            getProgramState(state.current_program_id).searchQuery = input.value;
        }
        clear.style.display = input.value ? 'block' : 'none';
        applyFilters();
    });

    clear.addEventListener('click', () => {
        input.value = '';
        if (state.current_program_id !== null) {
            getProgramState(state.current_program_id).searchQuery = '';
        }
        clear.style.display = 'none';
        applyFilters();
    });
}


// Restores the filter buttons and search input to match a program's saved state.
// Called when switching programs so the UI reflects the correct program's filters.
function restoreFilterUI(program_state) {
    // Restore active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === program_state.activeFilter);
    });
    // Restore search input
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');
    if (input) {
        input.value = program_state.searchQuery;
        clear.style.display = program_state.searchQuery ? 'block' : 'none';
    }
}



function showTooltip(e, c) {
    const tip = document.getElementById('tooltip');
    tip.style.display = 'block';
    tip.innerHTML = `
        <strong style="color:var(--text)">${c.title}</strong><br>
        <span style="color:var(--text-muted)">${c.code}</span><br>
        ${c.hours ? `<span>${c.hours}</span> &nbsp;` : ''}
        ${c.ects ? `<span style="color:var(--accent2)">${c.ects} ECTS</span>` : ''}
        ${c.blocs?.length ? `&nbsp;Bloc ${c.blocs.join(',')}` : ''}`;
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


// ─── START ─────────────────────────────────────────────────────

init();

