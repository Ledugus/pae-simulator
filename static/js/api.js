// ═══════════════════════════════════════════════════════════════
// js/api.js
// All fetch() calls to the FastAPI backend.
// Depends on: nothing
// ═══════════════════════════════════════════════════════════════

'use strict';

/** Gets all programs metadata from server (total_ects, title, etc) */
async function fetchAllPrograms() {
    const response = await fetch('/api/programs');
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    return response.json();
}

/** Gets all program data from server (courses, profs) */
async function fetchProgram(programId) {
    const response = await fetch(`/api/programs/${programId}`);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    return response.json();
}
