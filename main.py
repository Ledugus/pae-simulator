import json
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from src.db import (
    SaveRequest,
    get_db,
    get_program,
    get_all_programs,
    save_program_to_db,
)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")


templates = Jinja2Templates(directory="templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


@app.get("/api/programs")
def get_all_programs_route():
    all_programs = get_all_programs()

    if all_programs is None:
        raise HTTPException(status_code=404, detail="Program not found")
    return all_programs


@app.get("/api/programs/{program_id}")
def get_program_route(program_id: int):
    program = get_program(program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


@app.post("/api/save")
def save_program(req: SaveRequest):
    save_program_to_db(req)


@app.get("/saves")
def list_saves():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at FROM saves ORDER BY updated_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/saves/{save_id}")
def get_save(save_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM saves WHERE id = ?", (save_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Save not found")
    result = dict(row)
    result["data"] = json.loads(result["data"])
    return result


@app.delete("/saves/{save_id}")
def delete_save(save_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM saves WHERE id = ?", (save_id,))
    return {"status": "ok"}
