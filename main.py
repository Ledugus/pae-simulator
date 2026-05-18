from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from src.db import get_program, get_all_programs

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
