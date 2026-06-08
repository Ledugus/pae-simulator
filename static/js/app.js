// ═══════════════════════════════════════════════════════════════
// js/app.js
// Entry point. Orchestrates init, program loading, and updateAll.
// Must be loaded last — depends on all other files.
// ═══════════════════════════════════════════════════════════════

'use strict';

// ─── INIT ──────────────────────────────────────────────────────

async function init() {
    setLoadingState('loading');
    try {
        const allProgramsRaw = await fetchAllPrograms();
        state.allPrograms = Object.fromEntries(
            allProgramsRaw.map(item => [item.title, item])
        );
        buildProgramSelector(state.allPrograms);
        wireFilters();
        wireSearch();
        wireViewSwitcher();
        setLoadingState('ready');
    } catch (error) {
        setLoadingState('error', error.message);
    }
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

// ─── PROGRAM SELECTOR ──────────────────────────────────────────

function buildProgramSelector(allPrograms) {
    const container = document.getElementById('program-selector');
    container.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.id = 'program-selector-default-option';
    defaultOpt.className = 'program-selector-option';
    defaultOpt.value = 0;
    defaultOpt.textContent = 'Choose your master program';
    container.appendChild(defaultOpt);

    Object.values(allPrograms).forEach(program => {
        const opt = document.createElement('option');
        opt.className = 'program-selector-option';
        opt.value = program.id;
        opt.textContent = program.title;
        container.appendChild(opt);
    });
}

function programEventHandler(event) {
    if (event.target.value != 0) {
        const defaultOpt = document.getElementById('program-selector-default-option');
        if (defaultOpt) defaultOpt.remove();
    }
    loadProgram(event.target.value);
}

async function loadProgram(program_id) {
    if (state.current_program_id === program_id) return;
    setLoadingState('loading');

    try {
        const program_state = getProgramState(program_id);

        if (!program_state.populated) {
            const program_data = await fetchProgram(program_id);
            populateState(program_state, program_data);
            program_state.populated = true;
            program_state.activeView = 'list';
        }

        state.current_program_id = program_id;
        buildPageOfProgram(program_state);
        restoreFilterUI(program_state);
        setLoadingState('ready');
    } catch (error) {
        setLoadingState('error', error.message);
    }
}

function buildPageOfProgram(program_state) {
    if (program_state.selected_options.size === 0) autoSelectTroncCommun(program_state);

    buildCourseCatalogue(program_state);
    buildProgramView(program_state);
    buildConstraints(program_state);
    // buildRadar();
    updateRing(program_state.total_ects);
    updateAll();
}

// ─── UPDATE ALL ────────────────────────────────────────────────
// Reconciles the DOM with the current selection state.
// Called after every toggle.

function updateAll() {
    const program_state = getProgramState(state.current_program_id);
    if (!program_state) return;

    // Sync course row checkboxes
    document.querySelectorAll('.course-row').forEach(row => {
        const sel = program_state.selected_courses.has(row.dataset.code);
        row.classList.toggle('selected', sel);
        row.querySelector('.check').textContent = sel ? '✓' : '';
    });

    // Sync option header checkboxes
    document.querySelectorAll('.option-header').forEach(option => {
        const sel = program_state.selected_options.has(Number(option.dataset.id));
        option.classList.toggle('selected', sel);
        if (option.querySelector('.check')) option.querySelector('.check').textContent = sel ? '✓' : '';
    });

    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-btn').forEach(btn => {
        if (program_state.activeView === btn.dataset.view) {
            btn.classList.add('active');
        }

    })

    buildProgramView(program_state);
    buildConstraints(program_state);
    // buildRadar();
    updateRing(program_state.total_ects);
    applyFilters();
}

// ─── START ─────────────────────────────────────────────────────

init();
