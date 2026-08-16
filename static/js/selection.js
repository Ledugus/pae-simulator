// ═══════════════════════════════════════════════════════════════
// js/selection.js
// Course and option toggle logic.
// Depends on: state.js, helpers.js, ui/toast.js
// ═══════════════════════════════════════════════════════════════

'use strict';

function toggleCourse(code) {
    const program_state = getProgramState(state.current_program_id);
    const c = program_state.courseData[code];
    if (!c) return;

    if (program_state.selected_courses.has(code)) {
        // Check if mandatory in any currently selected option
        const blocking = Array.from(program_state.courseOptions[code])
            .filter(opt_id => program_state.selected_options.has(opt_id))
            .filter(opt_id => program_state.optionData[opt_id]?.courses
                .find(oc => oc.code === code)?.mandatory
            );

        if (blocking.length > 0) {
            const detail = blocking
                .map(id => `• ${program_state.optionData[id]?.label || id}`)
                .join('<br>');
            showToast('Ce cours est obligatoire pour une option sélectionnée.', detail);
            return;
        }
        program_state.selected_courses.delete(code);
    } else {
        program_state.selected_courses.add(code);
    }
    updateAll(program_state);
}

function toggleOption(opt) {
    const program_state = getProgramState(state.current_program_id);
    const opt_id = opt.id;
    if (!opt || opt.mandatory) return;

    if (program_state.selected_options.has(opt_id)) {
        // Deselect option — remove courses that are no longer in any selected option
        program_state.selected_options.delete(opt_id);
        program_state.optionData[opt_id].courses.forEach(c => {
            const stillNeeded = program_state.courseOptions[c.code]
                .some(id => program_state.selected_options.has(id));
            if (!stillNeeded) {
                program_state.selected_courses.delete(c.code);
            }
        });
    } else {
        // Select option — auto-add its mandatory courses
        program_state.selected_options.add(opt_id);
        program_state.optionData[opt_id].courses
            .filter(c => c.mandatory)
            .forEach(c => program_state.selected_courses.add(c.code));
    }
    updateAll(program_state)
}
