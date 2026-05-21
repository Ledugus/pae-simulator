// ═══════════════════════════════════════════════════════════════
// js/helpers.js
// Pure data helpers. Read state, return values. No DOM access.
// Depends on: config.js, state.js
// ═══════════════════════════════════════════════════════════════

'use strict';

/**
 * Populates a program_state from raw API data.
 * Assigns palette colours to each option.
 */
function populateState(program_state, program_data) {
    program_state.courseData  = program_data.courses;
    program_state.total_ects  = program_data.total_ects;
    program_state.optionData  = {};

    program_data.options.forEach((opt, i) => {
        const palette = opt.id === 'tronc'
            ? OPTION_COLORS[0]
            : OPTION_COLORS[(i % (OPTION_COLORS.length - 1)) + 1];

        program_state.optionData[opt.id] = { ...opt, palette };

        opt.courses.forEach(c => {
            if (!program_state.courseOptions[c.code]) {
                program_state.courseOptions[c.code] = [];
            }
            program_state.courseOptions[c.code].push(opt.id);
        });
    });
}

/**
 * Pre-selects the tronc commun option and all its courses.
 */
function autoSelectMandatory(program_state) {
    program_state.selected_options.add('tronc');
    Object.values(program_state.courseData).forEach(c => {
        if (program_state.courseOptions[c.code]?.includes('tronc')) {
            program_state.selected_courses.add(c.code);
        }
    });
}

/**
 * Returns the palette of the first option a course belongs to.
 */
function getCourseColorPalette(program_state, code) {
    const optId = program_state.courseOptions[code]?.[0];
    return program_state.optionData[optId]?.palette || TRONC_COLORS;
}

/**
 * Returns the total ECTS of all selected courses.
 */
function getSelectedEcts() {
    const program_state = getProgramState(state.current_program_id);
    let total = 0;
    program_state.selected_courses.forEach(code => {
        total += program_state.courseData[code]?.ects || 0;
    });
    return total;
}

/**
 * Returns { optionId -> ects_selected } for every option.
 * Includes a 'tronc' key.
 */
function getEctsByOption(program_state) {
    const counts = {};
    Object.values(program_state.optionData).forEach(o => counts[o.id] = 0);

    program_state.selected_courses.forEach(code => {
        const ects   = program_state.courseData[code]?.ects || 0;
        const optIds = program_state.courseOptions[code] || [];
        optIds.forEach(optId => {
            counts[optId] = (counts[optId] || 0) + ects;
        });
    });
    return counts;
}

/**
 * Groups a flat options array by group_label, preserving order.
 * Returns [{ groupLabel, options }]
 */
function groupOptionsByGroupLabel(options) {
    const result = [];
    const seen   = {};
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
