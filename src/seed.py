import os
import sqlite3
from datetime import datetime, timezone, timedelta

from scrape import parse_program, parse_program_list

SCHEMA = """
CREATE TABLE IF NOT EXISTS programs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    total_ects  INTEGER NOT NULL,
    last_seeded_at TEXT
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

CREATE TABLE IF NOT EXISTS professors (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS teaching (
    course_id     INTEGER NOT NULL REFERENCES courses(id),
    prof_id       INTEGER NOT NULL REFERENCES professors(id),
    PRIMARY KEY (course_id, prof_id)
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

"""


def init_db(conn: sqlite3.Connection) -> None:
    """Creates all tables. Safe to call multiple times (IF NOT EXISTS)."""
    conn.executescript(SCHEMA)
    conn.commit()
    print("Schema initialised.")


def is_seed_needed(cursor: sqlite3.Cursor, program_title: str) -> bool:
    """
    Returns True if the program needs seeding, False if it is still fresh.
    A program is considered stale after one year.
    """
    response = cursor.execute(
        "SELECT last_seeded_at FROM programs WHERE title = ?", (program_title,)
    ).fetchone()

    if response is None:
        return True

    last_seeded = datetime.fromisoformat(response[0])
    age = datetime.now() - last_seeded

    return age > timedelta(days=365)


def insert_programme(conn: sqlite3.Connection, program: dict) -> None:
    cursor = conn.cursor()

    # SKIP IF UP TO DATE
    if not is_seed_needed(cursor, program["title"]):
        last = cursor.execute(
            "SELECT last_seeded_at FROM programs WHERE title = ?", (program["title"],)
        ).fetchone()[0]
        print(f"'{program['title']}' is up to date (seeded at {last}). Skipping.")
        return

    seeded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    try:
        cursor.execute(
            "INSERT INTO programs (title, total_ects, last_seeded_at) VALUES (?, ?, ?)",
            (program["title"], program["total_ects"], seeded_at),
        )
        program_id = cursor.lastrowid

        for position, option in enumerate(program["options"]):
            insert_option(cursor, option, program_id, position=position)

        conn.commit()
        print(f"Seeded '{program['title']}' at {seeded_at}.")

    except Exception as e:
        conn.rollback()
        raise e


def insert_option(
    cursor: sqlite3.Cursor,
    option: dict,
    program_id: int,
    position: int,
) -> None:
    """
    Inserts one option row, then recurses into subsections.
    Courses in this option are linked via option_courses.
    """
    cursor.execute(
        """
        INSERT INTO options (html_id, program_id, label, group_label, description, min_ects, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            option["html_id"],
            program_id,
            option["label"],
            option["group_label"],
            option["description"],
            option["min_ects"],
            position,
        ),
    )
    option_db_id = cursor.lastrowid  # this option's new database id

    # Insert courses that belong directly to this option
    for course in option["courses"]:
        course_db_id = insert_or_get_course(cursor, course)
        cursor.execute(
            """
            INSERT OR IGNORE INTO option_courses (option_id, course_id, years, position, mandatory)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                option_db_id,
                course_db_id,
                course["years"],
                course["position"],
                course["mandatory"],
            ),
        )


def insert_or_get_course(cursor: sqlite3.Cursor, course: dict) -> int:
    """
    Inserts a course if its code doesn't exist yet, otherwise fetches the
    existing row's id. This is how the same course can appear in multiple
    options without being duplicated in the courses table.

    Returns the course's database id.
    """
    cursor.execute(
        """
        INSERT INTO courses (code, title, ects, lang, semester, hours, friendly)
        VALUES (?, ?, ?, ?, ?, ?,  ?)
        ON CONFLICT(code) DO NOTHING
        """,
        (
            course["code"],
            course["title"],
            course.get("ects"),
            course.get("lang"),
            course.get("semester"),
            course.get("hours"),
            course.get("friendly"),
        ),
    )

    # Whether we just inserted or the row already existed, fetch the id
    cursor.execute("SELECT id FROM courses WHERE code = ?", (course["code"],))
    course_id = cursor.fetchone()[0]

    # Add the teachers, and the teaching relation course-professor
    teachers = course.get("teachers")
    if teachers:
        for teacher in teachers:
            cursor.execute(
                """
                INSERT INTO professors (name)
                VALUES (?)
                ON CONFLICT(name) DO NOTHING
                """,
                (teacher,),
            )

            teacher_id = cursor.execute(
                "SELECT id FROM professors WHERE name = ?", (teacher,)
            ).fetchone()[0]

            cursor.execute(
                """
                INSERT OR IGNORE INTO teaching (course_id, prof_id)
                VALUES (?, ?)
                """,
                (course_id, teacher_id),
            )

    return course_id


if __name__ == "__main__":
    conn = sqlite3.connect("database.db")

    init_db(conn)
    urls = parse_program_list()
    if urls is None:
        print("Problem fetching programs list")
    else:
        for code, url in urls.items():

            program = parse_program(code, url)
            if program:
                insert_programme(conn, program)
            else:
                print("Error fetching program", code)
    conn.close()
