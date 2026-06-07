// ═══════════════════════════════════════════════════════════════
// js/state.js
// Global state object and program state factory.
// Depends on: nothing
// ═══════════════════════════════════════════════════════════════

'use strict';

const state = {
    programs: new Map(),
    current_program_id: null,
    allPrograms: null,
};

/**
 * Returns the state object for a given program id.
 * Creates a fresh one if it doesn't exist yet.
 * @param {number|string} program_id
 */
function getProgramState(program_id) {
    if (!state.programs.has(program_id)) {
        state.programs.set(program_id, {
            // data — populated once by populateState()
            populated: false,
            courseData: {},   // { code -> course }
            courseOptions: {},   // { code -> [opt_id, ...] }
            optionData: {},   // { opt_id -> option }
            total_ects: 120,

            // ui state — persists when switching programs
            selected_courses: new Set(),
            selected_options: new Set(),
            activeFilter: 'all',
            searchQuery: '',
            activeView: 'list',
        });
    }
    return state.programs.get(program_id);
}
