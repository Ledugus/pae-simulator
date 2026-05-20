// ═══════════════════════════════════════════════════════════════
// index.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ─── CONFIG ────────────────────────────────────────────────────
// Static colour palette for options, assigned by index at load time.
// The tronc commun always gets the first colour.

const OPTION_COLORS = [
    { bg: '#eef2ff', primary: '#4d7cfe', dark: '#1a3a8f', mid: '#2d55c8', badge: '#c7d4fd' }, // blue
    { bg: '#fef3e8', primary: '#f0a050', dark: '#7a3f00', mid: '#b85f00', badge: '#fdd9a8' }, // orange
    { bg: '#e8faf2', primary: '#3dd68c', dark: '#0d5c34', mid: '#1a8c52', badge: '#a8eece' }, // green
    { bg: '#fde8f2', primary: '#f05090', dark: '#7a0038', mid: '#b8005a', badge: '#f9b0d1' }, // pink
    { bg: '#e8f8fd', primary: '#50c8f0', dark: '#004d6b', mid: '#007aa0', badge: '#a8e4f8' }, // cyan
    { bg: '#fefae8', primary: '#f0d050', dark: '#6b4e00', mid: '#a07800', badge: '#f8eba8' }, // yellow
    { bg: '#fdf0ed', primary: '#f07050', dark: '#7a2000', mid: '#b83800', badge: '#f8c4b8' }, // red-orange
    { bg: '#f5eeff', primary: '#a855f7', dark: '#4a0080', mid: '#7200bf', badge: '#dbb8fd' }, // purple
    { bg: '#eef0ff', primary: '#b0c0ff', dark: '#1a2880', mid: '#3040c0', badge: '#d0d8ff' }, // periwinkle
    { bg: '#f0f2f8', primary: '#7a88b0', dark: '#1e2a45', mid: '#3a4a70', badge: '#c0c8e0' }, // slate
];
const TRONC_COLORS = OPTION_COLORS[0];

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
            activeView: 'list',
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
        wireViewSwitcher();

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
            program_state.populated = true;
            program_state.activeView = "list";
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
    buildProgramView(program_state);
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
    // Courses
    program_state.courseData = program_data.courses

    // ── Options — dict keyed by opt.id ──
    program_state.optionData = {};
    program_data.options.forEach((opt, i) => {
        let palette;
        if (opt.id === "tronc") {
            palette = OPTION_COLORS[0]

        } else {
            palette = OPTION_COLORS[(i % (OPTION_COLORS.length - 1)) + 1]
        }
        const optWithColor = {
            ...opt,
            palette: palette
        };
        program_state.optionData[opt.id] = optWithColor;

        // Add lookup table for the options a course appears in
        opt.courses.forEach(c => {
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


// Returns the color palette for a course.
// Uses the first option's color palette
function getCourseColorPalette(program_state, code) {
    return program_state.optionData[program_state.courseOptions[code][0]].palette;
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
        <div class="section-chevron" style="color: ${TRONC_COLORS.primary}">▼</div>
        <div class="section-title">Tronc commun</div>`;
    hdr.addEventListener('click', () => el.classList.toggle('collapsed'));
    el.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'section-body';
    el.appendChild(body);


    renderCourseList(body, program_state.optionData["tronc"].courses, TRONC_COLORS);
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
            if (opt.id === "tronc") return;
            const { el, body } = makeCollapsibleGroup(opt);
            renderCourseList(body, opt.courses, opt.palette);
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
    hdr_content.className = "option-header-content"
    hdr_content.innerHTML = `
    <div class="section-chevron" style="color: ${opt.palette.primary}">▼</div>
        <div class="section-title">${opt.label}</div>`;
    hdr_content.addEventListener('click', () => el.classList.toggle('collapsed'));

    const hdr_check = document.createElement('div');
    hdr_check.innerHTML = `
        <div class="check">${program_state.selected_options.has(opt.id) ? '✓' : ''}</div>`;
    hdr_check.addEventListener('click', () => toggleOption(opt));


    const hdr = document.createElement('div');
    hdr.className = 'option-header';
    hdr.dataset.id = opt.id;
    if (program_state.selected_options.has(opt.id)) hdr.classList.add('selected');
    hdr.appendChild(hdr_content);
    hdr.appendChild(hdr_check);
    el.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'section-body';
    el.appendChild(body);

    return { el, body };
}

function renderCourseList(container, courses, palette) {
    let program_state = getProgramState(state.current_program_id)
    courses.forEach(c => {
        // convert to boolean
        const isMandatory = !!c.mandatory;
        const course = program_state.courseData[c.code]

        const row = document.createElement('div');
        row.className = 'course-row';
        row.dataset.code = course.code;
        row.dataset.lang = course.lang || '';
        row.dataset.semester = course.semester || '';
        row.dataset.ects = course.ects || 0;

        if (isMandatory) row.classList.add('mandatory');
        if (program_state.selected_courses.has(course.code)) row.classList.add('selected');

        row.innerHTML = `
            <div class="check">${program_state.selected_courses.has(course.code) ? '✓' : ''}</div>
            <div class="course-info">
                <div class="course-code">${course.code}</div>
                <a class="course-title" href="https://uclouvain.be/cours-2026-${course.code.toLowerCase()}" target="_blank">${course.title}</a>
            </div>
            <div class="course-meta">
                ${course.ects ? `<span class="badge badge-ects">${course.ects}</span>` : ''}
                ${course.lang ? `<span class="badge badge-lang">${course.lang}</span>` : ''}
                ${course.semester ? `<span class="badge badge-q">${course.semester}</span>` : ''}
            </div>`;

        row.addEventListener('click', () => toggleCourse(course.code));
        row.addEventListener('mouseenter', e => showTooltip(e, course));
        row.addEventListener('mouseleave', hideTooltip);

        container.appendChild(row);
    });
}


// ─── BUILD PROGRAM (middle panel) ──────────────────────────────
function buildProgramView(program_state) {
    const viewType = program_state.activeView;
    if (viewType === "list") {
        buildProgramList();
    } else if (viewType === "grid") {
        buildProgramGrid();
    } else {
        return
    }
}

function buildProgramGrid() {
    const program_state = getProgramState(state.current_program_id);
    const container = document.getElementById('program-content');

    container.innerHTML = `
    <div id="grid-view" class="hidden">
      <div class="year-grid">
        ${[1, 2].map(year => [1, 2].map(sem => `
          <div class="grid-col">
            <div class="grid-col-header">M${year} — Q${sem}</div>
            <div class="grid-col-courses" data-year="${year}" data-semester="${sem}"></div>
          </div>
        `).join('')).join('')}
      </div>
    </div>`;

    Array.from(program_state.selected_courses)
        .map(code => program_state.courseData[code])
        .filter(Boolean)
        .forEach(c => {
            const col = container.querySelector(
                `.grid-col-courses[data-year="${c.years}"][data-semester="${c.semester}"]`
            );
            if (!col) return;

            const palette = getCourseColorPalette(program_state, c.code);
            const card = document.createElement('div');
            card.className = `course-card`;
            card.style.setProperty('--card-bg', palette.bg);
            card.style.setProperty('--card-border', palette.primary);
            card.style.setProperty('--ects', c.ects);
            card.innerHTML = `
                <div class="course-card-title">${c.title}</div>
                <div class="course-card-code">${c.code}</div>
                <div class="course-card-footer">
                    <span class="course-card-lang">${c.lang}</span>
                    <span class="course-card-ects">${c.ects} ECTS</span>
                </div>`;
            col.appendChild(card);
        });
}

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
        container.appendChild(makeProgramSection('Tronc commun', TRONC_COLORS, troncCourses));
    }
    // ── Options (only show options that have at least one course selected) ──
    Object.values(program_state.optionData).forEach(opt => {
        const courses = Array.from(program_state.selected_courses)
            .filter(code => program_state.courseOptions[code].includes(opt.id))
            .map(code => program_state.courseData[code]);

        if (!courses.length) return;
        hasAny = true;
        container.appendChild(makeProgramSection(opt.label, opt.palette, courses));
    });

    if (!hasAny) {
        container.innerHTML = '<div class="empty-program">Cliquez sur des cours pour les ajouter à votre programme.</div>';
    }
}

function makeProgramSection(label, palette, courses) {
    const totalEcts = courses.reduce((s, c) => s + (c.ects || 0), 0);

    const sec = document.createElement('div');
    sec.className = 'program-section';
    sec.innerHTML = `
        <div class="program-section-header">
            <div class="program-section-dot" style="background:${palette.primary}"></div>
            <div class="program-section-name">${label}</div>
            <span class="badge badge-ects">${totalEcts} ECTS</span>
        </div>`;

    courses.forEach(c => {
        const item = document.createElement('div');
        item.className = 'program-course-item';
        item.innerHTML = `
            <div class="program-course-dot" style="background:${palette.primary}"></div>
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

    const tronc_commun = program_state.optionData["tronc"];
    renderConstraintBar(container, {
        label: 'Tronc Commun',
        current: byOption["tronc"],
        target: tronc_commun.min_ects,
        max: totalEcts,
    });
    // One bar per option that has a min_ects constraint
    program_state.selected_options.forEach(opt_id => {
        if (opt_id === "tronc") return;
        const opt = program_state.optionData[opt_id]
        renderConstraintBar(container, {
            label: opt.label,
            current: byOption[opt.id] || 0,
            target: opt.min_ects || 30,
            max: opt.max_ects || null,
            color: opt.palette.primary,
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
        txt.setAttribute('fill', opt.palette.primary);
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
        circ.setAttribute('fill', opt.palette.primary);
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
    if (!c) return;

    if (program_state.selected_courses.has(code)) {
        const options_needing_course = Array.from(program_state.courseOptions[code])
            .filter(opt_id => program_state.selected_options.has(opt_id))
            .filter(opt_id => program_state.optionData[opt_id]?.courses
                .filter(c => c.code === code)
                .map(c => c.mandatory)[0]
            )
        if (options_needing_course.length === 0) {
            program_state.selected_courses.delete(code);
        } else {
            let descr = options_needing_course
                .map(id => `• ${program_state.optionData[id]?.label || id}`)
                .join('<br>');
            showToast("The course could not be removed : mandatory for some selected option",
                descr
            )
        }

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
        Array.from(program_state.optionData[opt_id].courses)
            .filter(c =>
                Array.from(program_state.courseOptions[c.code])
                    .filter(opt_id => program_state.selected_options.has(opt_id))
                    .length === 0)
            .map(c => {
                program_state.selected_courses.delete(c.code)
            })
    } else {
        program_state.selected_options.add(opt_id);
        const optionData = program_state.optionData[opt_id];
        Array.from(optionData.courses).filter(c => c.mandatory).map(c => {
            program_state.selected_courses.add(c.code);
        });
    }
    updateAll();
}

function updateAll() {
    const program_state = getProgramState(state.current_program_id);

    // Update selected courses
    document.querySelectorAll('.course-row').forEach(row => {
        const sel = program_state.selected_courses.has(row.dataset.code);
        row.classList.toggle('selected', sel);
        row.querySelector('.check').textContent = sel ? '✓' : '';
    });

    // Update selected options
    document.querySelectorAll('.option-header').forEach(option => {
        if (option.dataset.id !== "tronc") {
            const sel = program_state.selected_options.has(Number(option.dataset.id));
            option.classList.toggle('selected', sel);
            option.querySelector('.check').textContent = sel ? '✓' : '';
        }
    });
    buildProgramView(program_state);
    buildConstraints(program_state);
    buildRadar();
    updateRing(program_state.total_ects);  // pass the program's actual total
    applyFilters();
}


// ─── FILTERS ───────────────────────────────────────────────────

function applyFilters() {
    let total_results = 0;
    const program_state = getProgramState(state.current_program_id);
    const { activeFilter: f, searchQuery, courseData } = program_state;
    const q = searchQuery.toLowerCase();

    document.querySelectorAll('.course-row').forEach(row => {
        const course = courseData[row.dataset.code];
        if (!course) return;

        const filterOk = (
            f === 'all' ||
            (f === 'EN' && course.lang === 'EN') ||
            (f === 'FR' && course.lang === 'FR') ||
            (f === 'q1' && course.semester % 2 === 1) ||  // number comparison works naturally
            (f === 'q2' && course.semester - 2 >= 0) ||
            (f === '5' && course.ects === 5)
        );
        const searchOk = !q || course.title.toLowerCase().includes(q) || course.code.toLowerCase().includes(q);
        row.classList.toggle('hidden', !filterOk || !searchOk);
        if (filterOk && searchOk) {
            total_results += 1;
        }

    });
    document.getElementById('results-count').innerHTML = total_results;

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

function wireViewSwitcher() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const program_state = getProgramState(state.current_program_id)
            program_state.activeView = btn.dataset.view;
            buildProgramView(program_state);
        });
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
        ${c.hours ? `<span>${c.hours}h</span> &nbsp;` : ''}
        ${c.ects ? `<span style="color:var(--accent2)">${c.ects} ECTS</span>` : ''}
        ${c.years?.length ? `&nbsp;Bloc ${c.years.join(',')}` : ''}`;
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

function showToast(message, detail = null, type = 'warn', duration = 3000) {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    if (detail) {
        toast.innerHTML = `
            <span class="toast-short">${message}
                <span class="toast-more">more</span>
            </span>
            <div class="toast-full">${detail}</div>`;

        toast.querySelector('.toast-more').addEventListener('click', () => {
            const full = toast.querySelector('.toast-full');
            const btn = toast.querySelector('.toast-more');
            full.classList.toggle('visible');
            btn.textContent = full.classList.contains('visible') ? 'less' : 'more';
        });
    } else {
        toast.textContent = message;
    }

    container.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('visible'));
    });

    setTimeout(() => {
        toast.classList.remove('visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

// ─── START ─────────────────────────────────────────────────────

init();

