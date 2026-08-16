function wireSaveBtn() {
    document.getElementById("saveBtn").addEventListener("click", async () => {
        const program_state = getProgramState(state.current_program_id)

        const title = document.getElementById("saveTitleInput").value.trim();
        if (!title) {
            alert("Please give your save a title.");
            return;
        }
        const myObject = {
            user_id: state.user_id,
            title: title,
            data: {
                program_id: state.current_program_id,
                options: Array.from(program_state.selected_options),
                courses: Array.from(program_state.selected_courses),
                placements: program_state.placements,
            },
            save_id: program_state.save_id,
        }
        const request = JSON.stringify(myObject)
        saveProgram(request)
    });
}

async function populateSavesDropdown() {
    const select = document.getElementById("loadSaveSelect");
    select.innerHTML = '<option value="">-- Load a save --</option>';

    try {
        const saves = await fetchSavesList();
        for (const save of saves) {
            const option = document.createElement("option");
            option.value = save.id;
            option.textContent = save.title;
            select.appendChild(option);
        }
    } catch (err) {
        console.error("Could not populate saves dropdown:", err);
    }
}

async function loadSave(saveId) {
    const save = await fetchSave(saveId)

    // Apply the loaded data back into your program state
    const program_id = save.data.program_id
    setSelectedProgram(program_id)
    loadProgram(program_id)
    const program_state = getProgramState(program_id)
    program_state.selected_options = new Set(save.data.options);
    program_state.selected_courses = new Set(save.data.courses);
    program_state.placements = save.data.placements;
    program_state.save_id = save.id;
    updateAll(program_state)

    // Reflect the loaded title in the title input, so an immediate re-save updates rather than duplicates
    document.getElementById("saveTitleInput").value = save.title;

    console.log(`Loaded save "${save.title}" (id=${save.id})`);
}

function wireLoadSaves() {
    populateSavesDropdown();

    document.getElementById("loadSaveBtn").addEventListener("click", async () => {
        const select = document.getElementById("loadSaveSelect");
        const saveId = select.value;
        if (!saveId) {
            alert("Please select a save to load.");
            return;
        }
        try {
            await loadSave(saveId);
        } catch (err) {
            console.error(err);
        }
    });

    document.getElementById("deleteSaveBtn").addEventListener("click", async () => {
        const select = document.getElementById("loadSaveSelect");
        const saveId = select.value;
        if (!saveId) {
            alert("Please select a save to delete.");
            return;
        }
        if (!confirm("Delete this save? This can't be undone.")) return;

        try {
            await deleteSave(saveId);
            await populateSavesDropdown(); // refresh the list after deletion
        } catch (err) {
            console.error(err);
        }
    });
}
