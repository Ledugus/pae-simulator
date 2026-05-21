// ═══════════════════════════════════════════════════════════════
// js/ui/catalogue.js
// Left panel: course catalogue, filters, search.
// Depends on: config.js, state.js, helpers.js, selection.js, ui/tooltip.js
// ═══════════════════════════════════════════════════════════════

'use strict';

function buildCourseCatalogue(program_state) {
    const container = document.getElementById('browser-content');
    container.innerHTML = '';

    // ── Tronc commun block (no checkbox — always selected) ──
    const troncEl  = document.createElement('div');
    troncEl.className = 'section-group';

    const troncHdr = document.createElement('div');
    troncHdr.className = 'option-header';
    troncHdr.dataset.id = 'tronc';
    troncHdr.innerHTML = `
        <div class="section-chevron" style="color:${TRONC_COLORS.primary}">▼</div>
        <div class="section-title">Tronc commun</div>`;
    troncHdr.addEventListener('click', () => troncEl.classList.toggle('collapsed'));
    troncEl.appendChild(troncHdr);

    const troncBody = document.createElement('div');
    troncBody.className = 'section-body';
    renderCourseList(troncBody, program_state.optionData['tronc'].courses, TRONC_COLORS);
    troncEl.appendChild(troncBody);
    container.appendChild(troncEl);

    // ── One collapsible group per option, grouped by group_label ──
    const grouped = groupOptionsByGroupLabel(Object.values(program_state.optionData));

    grouped.forEach(({ groupLabel, options }) => {
        if (groupLabel) {
            const groupHdr = document.createElement('div');
            groupHdr.className = 'group-label-header';
            groupHdr.textContent = groupLabel;
            container.appendChild(groupHdr);
        }
        options.forEach(opt => {
            if (opt.id === 'tronc') return;
            const { el, body } = makeCollapsibleGroup(opt, program_state);
            renderCourseList(body, opt.courses, opt.palette);
            container.appendChild(el);
        });
    });
}

function makeCollapsibleGroup(opt, program_state) {
    const el = document.createElement('div');
    el.className = 'section-group';
    el.dataset.groupKey = `opt-${opt.id}`;

    // Left side: chevron + label — click to collapse
    const hdrContent = document.createElement('div');
    hdrContent.className = 'option-header-content';
    hdrContent.innerHTML = `
        <div class="section-chevron" style="color:${opt.palette.primary}">▼</div>
        <div class="section-title">${opt.label}</div>`;
    hdrContent.addEventListener('click', () => el.classList.toggle('collapsed'));

    // Right side: checkbox — click to select/deselect the option
    const hdrCheck = document.createElement('div');
    hdrCheck.innerHTML = `<div class="check">${program_state.selected_options.has(opt.id) ? '✓' : ''}</div>`;
    hdrCheck.addEventListener('click', () => toggleOption(opt));

    const hdr = document.createElement('div');
    hdr.className = 'option-header';
    hdr.dataset.id = opt.id;
    if (program_state.selected_options.has(opt.id)) hdr.classList.add('selected');
    hdr.appendChild(hdrContent);
    hdr.appendChild(hdrCheck);
    el.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'section-body';
    el.appendChild(body);

    return { el, body };
}

function renderCourseList(container, courses, palette) {
    const program_state = getProgramState(state.current_program_id);

    courses.forEach(c => {
        const isMandatory = !!c.mandatory;
        const course      = program_state.courseData[c.code];
        if (!course) return;

        const row = document.createElement('div');
        row.className        = 'course-row';
        row.dataset.code     = course.code;
        row.dataset.lang     = course.lang     || '';
        row.dataset.semester = course.semester || '';
        row.dataset.ects     = course.ects     || 0;

        if (isMandatory)                              row.classList.add('mandatory');
        if (program_state.selected_courses.has(course.code)) row.classList.add('selected');

        row.innerHTML = `
            <div class="check">${program_state.selected_courses.has(course.code) ? '✓' : ''}</div>
            <div class="course-info">
                <div class="course-code">${course.code}</div>
                <a class="course-title"
                   href="https://uclouvain.be/cours-2026-${course.code.toLowerCase()}"
                   target="_blank">${course.title}</a>
            </div>
            <div class="course-meta">
                ${course.ects     ? `<span class="badge badge-ects">${course.ects}</span>`     : ''}
                ${course.lang     ? `<span class="badge badge-lang">${course.lang}</span>`     : ''}
                ${course.semester ? `<span class="badge badge-q">${course.semester}</span>`    : ''}
            </div>`;

        row.addEventListener('click',       ()  => toggleCourse(course.code));
        row.addEventListener('mouseenter',  e   => showTooltip(e, course));
        row.addEventListener('mouseleave',  ()  => hideTooltip());

        container.appendChild(row);
    });
}

// ── Filters ────────────────────────────────────────────────────

function applyFilters() {
    const program_state = getProgramState(state.current_program_id);
    if (!program_state) return;

    const { activeFilter: f, searchQuery, courseData } = program_state;
    const q = searchQuery.toLowerCase();
    let total_results = 0;

    document.querySelectorAll('.course-row').forEach(row => {
        const course = courseData[row.dataset.code];
        if (!course) return;

        const filterOk = (
            f === 'all' ||
            (f === 'EN' && course.lang === 'EN') ||
            (f === 'FR' && course.lang === 'FR') ||
            (f === 'q1' && course.semester % 2 === 1) ||
            (f === 'q2' && course.semester - 2 >= 0) ||
            (f === '5'  && course.ects === 5)
        );
        const searchOk = !q
            || course.title.toLowerCase().includes(q)
            || course.code.toLowerCase().includes(q);

        row.classList.toggle('hidden', !filterOk || !searchOk);
        if (filterOk && searchOk) total_results++;
    });

    const counter = document.getElementById('results-count');
    if (counter) counter.textContent = total_results;
}

function wireFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
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

function restoreFilterUI(program_state) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === program_state.activeFilter);
    });
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');
    if (input) {
        input.value         = program_state.searchQuery;
        clear.style.display = program_state.searchQuery ? 'block' : 'none';
    }
}
