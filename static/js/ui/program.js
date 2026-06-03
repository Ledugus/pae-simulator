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
    }
}

// ── List view ──────────────────────────────────────────────────

function buildProgramList(program_state) {
    const container = document.getElementById('program-content');
    container.innerHTML = '';
    let hasAny = false;

    // Tronc commun
    const troncCourses = Array.from(program_state.selected_courses)
        .filter(code => program_state.courseOptions[code]?.includes('tronc'))
        .map(code => program_state.courseData[code]);

    if (troncCourses.length) {
        hasAny = true;
        container.appendChild(makeProgramSection('Tronc commun', TRONC_COLORS, troncCourses));
    }

    // Options — only those with at least one selected course
    Object.values(program_state.optionData).forEach(opt => {
        if (opt.id === 'tronc') return;
        const courses = Array.from(program_state.selected_courses)
            .filter(code => program_state.courseOptions[code]?.includes(opt.id))
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
            item.querySelector('.program-remove')
                .addEventListener('click', () => toggleCourse(c.code));
        }
        sec.appendChild(item);
    });

    return sec;
}

// ── Grid view ──────────────────────────────────────────────────

function buildProgramGrid(program_state) {
    const container = document.getElementById('program-content');

    container.innerHTML = `
        <div class="year-grid">
            ${[1, 2].map(year => [1, 2].map(sem => `
                <div class="grid-col">
                    <div class="grid-col-header">M${year} — Q${sem}</div>
                    <div class="grid-col-courses" data-year="${year}" data-semester="${sem}"></div>
                </div>
            `).join('')).join('')}
        </div>
        <div class="other-courses-grid"></div>`;

    Array.from(program_state.selected_courses)
        .map(code => program_state.courseData[code])
        .filter(Boolean)
        .forEach(c => {
            const palette = getCourseColorPalette(program_state, c.code);

            const card = document.createElement('div');
            card.className = 'course-card';
            card.style.setProperty('--card-bg', palette.bg);
            card.style.setProperty('--card-border', palette.primary);
            card.style.setProperty('--card-text-dark', palette.dark);
            card.style.setProperty('--card-badge-bg', palette.badge);
            card.innerHTML = `
                <div class="course-card-title">${c.title}</div>
                <div class="course-card-code">${c.code}</div>
                <div class="course-card-footer">
                    <span class="course-card-lang">${c.lang || ''}</span>
                    <span class="course-card-ects">${c.ects} ECTS</span>
                </div>`;

            let grid;
            if (!c.years || c.years === "12") {
                grid = container.querySelector('.other-courses-grid');
            } else if (!c.semester || c.semester === "12") {
                // Both semesters — place in Q1 column for that year
                grid = container.querySelector(
                    `.grid-col-courses[data-year="${c.years}"][data-semester="1"]`);
            } else {
                grid = container.querySelector(
                    `.grid-col-courses[data-year="${c.years}"][data-semester="${c.semester}"]`);
            }
            if (grid) grid.appendChild(card);
        });
}

// ── View switcher wiring ───────────────────────────────────────

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
