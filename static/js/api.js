// ═══════════════════════════════════════════════════════════════
// js/api.js
// All fetch() calls to the FastAPI backend.
// Depends on: nothing
// ═══════════════════════════════════════════════════════════════

'use strict';

async function fetchAllPrograms() {
    const response = await fetch('/api/programs');
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    return response.json();
}

async function fetchProgram(programId) {
    const response = await fetch(`/api/programs/${programId}`);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    return response.json();
}
