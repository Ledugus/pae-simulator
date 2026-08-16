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

async function saveProgram(request) {
    try {
        const response = await fetch("/api/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: request
        });

        if (!response.ok) {
            throw new Error("Save failed");
        }
        console.log("Saved!");
        await populateSavesDropdown();
    } catch (err) {
        console.error(err);
    }
}

async function fetchSavesList() {
    const response = await fetch(`/saves`);
    if (!response.ok) throw new Error("Failed to fetch saves");
    return await response.json();
}

async function fetchSave(saveId) {
    const response = await fetch(`/saves/${saveId}`);
    if (!response.ok) throw new Error("Failed to load save");
    const save = await response.json();
    return save;
}


async function deleteSave(saveId) {
    const response = await fetch(`/saves/${saveId}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Failed to delete save");
    console.log(`Deleted save id=${saveId}`);
}
