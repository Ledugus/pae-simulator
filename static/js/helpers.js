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
    program_state.courseData = program_data.courses;
    program_state.total_ects = program_data.total_ects;
    program_state.optionData = {};

    program_data.options.forEach((opt, i) => {
        const palette = opt.html_id.includes('tronc_commun')
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

    program_state.teachers = program_data.teachers;
}
function autoSelectTroncCommun(program_state) {
    const tronc_commun = Object.values(program_state.optionData)
        .filter(opt =>
            opt.html_id.includes('tronc')
        )[0];
    toggleOption(tronc_commun)
}


/**
 * Returns the palette of the first option a course belongs to.
 */
function getCourseColorPalette(program_state, code) {
    const optId = program_state.courseOptions[code]?.[0];
    return program_state.optionData[optId].palette;
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
 */
function getEctsByOption(program_state) {
    const counts = {};
    Object.values(program_state.optionData).forEach(o => counts[o.id] = 0);

    program_state.selected_courses.forEach(code => {
        const ects = program_state.courseData[code]?.ects || 0;
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


function getBlocsFromYears(years) {
    if (years === "1") {
        return "Bloc 1"
    }
    if (years === "2") {
        return "Bloc 2"
    }
    if (years === "12") {
        return "Blocs 1 & 2"
    }
}

function getTeachersString(teachers) {
    const teachersList = getProgramState(state.current_program_id).teachers
    return teachers.map(id => teachersList[id]).join(" - ")
}
