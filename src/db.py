import sqlite3
import json
from pydantic import BaseModel
from datetime import datetime, time, timezone, timedelta


SCHEMA = """
CREATE TABLE IF NOT EXISTS programs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    total_ects  INTEGER NOT NULL,
    last_seeded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS options (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id  INTEGER NOT NULL REFERENCES programs(id),
    html_id     TEXT,
    label       TEXT NOT NULL,
    group_label TEXT,
    description TEXT,
    min_ects    INTEGER,
    position    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    code  TEXT    NOT NULL UNIQUE, 
    title TEXT    NOT NULL,
    ects  INTEGER,
    lang  TEXT,
    semester TEXT,
    hours  INTEGER,
    friendly INTEGER
);

CREATE TABLE IF NOT EXISTS teachers (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS teaching (
    course_id     INTEGER NOT NULL REFERENCES courses(id),
    teacher_id    INTEGER NOT NULL REFERENCES teachers(id),
    PRIMARY KEY (course_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS prerequisites (
    course_id        INTEGER NOT NULL REFERENCES courses(id),
    prerequisite_id  INTEGER NOT NULL REFERENCES courses(id),
    PRIMARY KEY (course_id, prerequisite_id)
);

CREATE TABLE IF NOT EXISTS option_courses (
    option_id   INTEGER NOT NULL REFERENCES option(id),
    course_id   INTEGER NOT NULL REFERENCES courses(id),
    years  TEXT,
    position    INTEGER NOT NULL,   -- preserves ordering within an option 
    mandatory   INTEGER NOT NULL DEFAULT 0, -- 1 = mandatory
    PRIMARY KEY (option_id, course_id)
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data TEXT
);

"""


def init_db(conn: sqlite3.Connection) -> None:
    """Creates all tables. Safe to call multiple times (IF NOT EXISTS)."""
    conn.executescript(SCHEMA)
    conn.commit()
    print("Ensured schema.")


def get_db():
    conn = sqlite3.connect("database.db")
    init_db(conn)
    conn.row_factory = sqlite3.Row
    return conn


def get_all_programs():
    conn = get_db()

    all_programs = conn.execute(
        """SELECT id, title, total_ects FROM programs"""
    ).fetchall()
    conn.close()
    return all_programs


def get_program(program_id: int) -> dict | None:
    conn = get_db()

    program_row = conn.execute(
        "SELECT * FROM programs WHERE id = ?", (program_id,)
    ).fetchone()

    if program_row is None:
        raise Exception("Could not find program in database")

    option_rows = conn.execute(
        """
        SELECT id, html_id, label, group_label, description, min_ects, position
        FROM options
        WHERE program_id = ?
        ORDER BY position
        """,
        (program_id,),
    ).fetchall()

    course_rows = conn.execute(
        """
        SELECT c.id, c.code, c.title, c.ects, c.lang, c.semester, c.hours, c.friendly, oc.option_id, oc.years, oc.position, oc.mandatory
        FROM courses c
        JOIN option_courses oc ON oc.course_id = c.id
        JOIN options o ON o.id = oc.option_id
        WHERE o.program_id = ?
        ORDER BY oc.position
        """,
        (program_id,),
    ).fetchall()

    teachers_rows = conn.execute(
        """
        SELECT t.id, t.name, c.code
        FROM teachers t
        JOIN teaching teach ON teach.teacher_id = t.id
        JOIN courses c ON c.id = teach.course_id
        WHERE c.id IN (
            SELECT oc.course_id FROM option_courses oc
            JOIN options o ON o.id = oc.option_id
            WHERE o.program_id = ?
        )
        ORDER BY c.code
        """,
        (program_id,),
    ).fetchall()
    conn.close()

    return build_program(program_row, option_rows, course_rows, teachers_rows)


def build_program(program_row, option_rows, course_rows, teachers_rows) -> dict:

    # Index option courses by option_id for quick lookup
    # { option_id: [course, course, ...] }
    courses = {}

    for row in course_rows:
        if row["code"] not in courses:
            courses[row["code"]] = {
                "id": row["id"],
                "code": row["code"],
                "title": row["title"],
                "ects": row["ects"],
                "lang": row["lang"],
                "semester": row["semester"],
                "hours": row["hours"],
                "years": row["years"],
                "friendly": bool(row["friendly"]),
                "teachers": [],
            }

    # ── Options — index course rows by option_id first ──
    courses_by_option = {}
    for row in course_rows:
        oid = row["option_id"]
        if oid not in courses_by_option:
            courses_by_option[oid] = []
        courses_by_option[oid].append(
            {
                "code": row["code"],  # reference into the courses dict
                "mandatory": bool(row["mandatory"]),
                "position": row["position"],
            }
        )

    teachers = {}
    for row in teachers_rows:
        teachers[row["id"]] = row["name"]
        courses[row["code"]]["teachers"].append(row["id"])

    options = [
        {
            "id": row["id"],
            "html_id": row["html_id"],
            "label": row["label"],
            "group_label": row["group_label"],
            "description": row["description"],
            "min_ects": row["min_ects"],
            "courses": courses_by_option.get(row["id"], []),
        }
        for row in option_rows
    ]

    return {
        "id": program_row["id"],
        "title": program_row["title"],
        "total_ects": program_row["total_ects"],
        "courses": courses,  # dict keyed by code
        "options": options,  # list of options, each with a courses list
        "teachers": teachers,
    }


class SaveRequest(BaseModel):
    user_id: int
    title: str
    save_id: int | None = None
    data: dict


def save_program_to_db(req: SaveRequest):
    conn = get_db()
    cursor = conn.cursor()

    serialized = json.dumps(req.data)
    if req.save_id is not None:
        # TODO
        conn.execute(
            "UPDATE saves SET title = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (req.title, serialized, req.save_id),
        )
        conn.commit()
        return req.save_id

    try:
        cursor.execute(
            "INSERT INTO saves (user, title, data) VALUES (?, ?, ?)",
            (req.user_id, req.title, serialized),
        )
        save_id = cursor.lastrowid
        conn.commit()
        return save_id

    except Exception as e:
        conn.rollback()
        raise e


def get_all_saves_from_user(user_id: int):
    conn = get_db()
    cursor = conn.cursor()

    try:
        saves_rows = cursor.execute(
            "SELECT * FROM saves WHERE user = ?", (user_id,)
        ).fetchall()
        return saves_rows

    except Exception as e:
        conn.rollback()
        raise e


def test_db():

    conn = get_db()
    course = conn.execute(
        "SELECT * FROM courses WHERE code = ?", ("LINMA2471",)
    ).fetchone()
    if course is None:
        print("course not found")
    else:
        print(course["title"])

    teacher = conn.execute(
        "SELECT * FROM teaching WHERE course_id = ?",
        (int(100),),
    ).fetchone()[0]
    print(teacher)


if __name__ == "__main__":
    print(get_all_saves_from_user(1)[:][:])
