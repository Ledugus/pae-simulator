import sqlite3
import json
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
    position    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    code  TEXT    NOT NULL UNIQUE, 
    title TEXT    NOT NULL,
    ects  INTEGER
);

CREATE TABLE IF NOT EXISTS prerequisites (
    course_id        INTEGER NOT NULL REFERENCES courses(id),
    prerequisite_id  INTEGER NOT NULL REFERENCES courses(id),
    PRIMARY KEY (course_id, prerequisite_id)
);

CREATE TABLE IF NOT EXISTS tronc_courses (
    program_id  INTEGER NOT NULL REFERENCES programs(id),
    course_id   INTEGER NOT NULL REFERENCES courses(id),
    position    INTEGER NOT NULL,
    mandatory   INTEGER NOT NULL DEFAULT 0, 
    PRIMARY KEY (program_id, course_id)
);

CREATE TABLE IF NOT EXISTS option_courses (
    option_id   INTEGER NOT NULL REFERENCES option(id),
    course_id   INTEGER NOT NULL REFERENCES courses(id),
    position    INTEGER NOT NULL,   -- preserves ordering within an option 
    mandatory   INTEGER NOT NULL DEFAULT 0, -- 1 = mandatory
    PRIMARY KEY (option_id, course_id)
);

CREATE TABLE IF NOT EXISTS metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
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
    row = cursor.execute(
        "SELECT last_seeded_at FROM programs WHERE title = ?", (program_title,)
    ).fetchone()

    # Program does not exist yet — seed needed
    if row is None or row["last_seeded_at"] is None:
        return True

    last_seeded = datetime.fromisoformat(row["last_seeded_at"])
    age = datetime.now(timezone.utc) - last_seeded

    return age > timedelta(days=365)


def insert_programme(conn: sqlite3.Connection, program: dict) -> None:
    cursor = conn.cursor()

    # SKIP IF UP TO DATE
    if not is_seed_needed(cursor, program["title"]):
        last = cursor.execute(
            "SELECT last_seeded_at FROM programs WHERE title = ?", (program["title"],)
        ).fetchone()["last_seeded_at"]
        print(f"'{program['title']}' is up to date (seeded at {last}). Skipping.")
        return

    seeded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    try:
        existing = cursor.execute(
            "SELECT id FROM programs WHERE title = ?", (program["title"],)
        ).fetchone()

        if existing:
            print(f"'{program['title']}' is stale, replacing...")
            delete_program(cursor, existing[0])

        cursor.execute(
            "INSERT INTO programs (title, total_ects, last_seeded_at) VALUES (?, ?, ?)",
            (program["title"], program["total_ects"], seeded_at),
        )
        program_id = cursor.lastrowid

        # INSERT TRONC COMMUN
        insert_tronc_commun(cursor, program["tronc_commun"], program_id)
        # INSERT OPTIONS
        for position, option in enumerate(program["options"]):
            insert_option(cursor, option, program_id, parent_id=None, position=position)

        cursor.execute(
            "INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_seeded_at', ?)",
            (seeded_at,),
        )

        conn.commit()
        print(f"Seeded '{program['title']}' at {seeded_at}.")

    except Exception as e:
        conn.rollback()
        raise e


def delete_program(cursor: sqlite3.Cursor, program_id: int) -> None:
    """
    Deletes a program and all its dependent rows in the right order.
    You must delete children before parents to respect foreign key constraints.
    """

    # Find all section ids belonging to this program
    section_ids = [
        row[0]
        for row in cursor.execute(
            "SELECT id FROM sections WHERE program_id = ?", (program_id,)
        ).fetchall()
    ]

    if section_ids:
        # SQLite doesn't support WHERE IN with a list natively,
        # so we build the placeholders dynamically.
        placeholders = ",".join("?" * len(section_ids))

        cursor.execute(
            f"DELETE FROM section_courses WHERE section_id IN ({placeholders})",
            section_ids,
        )

    cursor.execute("DELETE FROM sections WHERE program_id = ?", (program_id,))
    cursor.execute("DELETE FROM programs WHERE id = ?", (program_id,))


def insert_tronc_commun(cursor: sqlite3.Cursor, courses: list, program_id: int):
    """
    Inserts the "tronc commun" for a program, linking via tronc_courses
    """
    for course in courses:
        pos = course["position"]
        course_db_id = insert_or_get_course(cursor, course)
        cursor.execute(
            """
            INSERT OR IGNORE INTO tronc_courses (program_id, course_id, position)
            VALUES(?, ?, ?)
            """,
            (program_id, course_db_id, pos),
        )


def insert_option(
    cursor: sqlite3.Cursor,
    option: dict,
    program_id: int,
    parent_id: int | None,
    position: int,
) -> None:
    """
    Inserts one section row, then recurses into subsections.
    Courses in this section are linked via section_courses.
    """
    cursor.execute(
        """
        INSERT INTO options (html_id, program_id, label, group_label, position)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            option["html_id"],
            program_id,
            option["label"],
            option["group_label"],
            position,
        ),
    )
    option_db_id = cursor.lastrowid  # this section's new database id

    # Insert courses that belong directly to this section
    for course in option["courses"]:
        course_db_id = insert_or_get_course(cursor, course)
        cursor.execute(
            """
            INSERT OR IGNORE INTO option_courses (option_id, course_id, position, mandatory)
            VALUES (?, ?, ?, ?)
            """,
            (option_db_id, course_db_id, course["position"], course["mandatory"]),
        )

    # Recurse into subsections, passing this section's db id as parent_id
    # for pos, subsection in enumerate(option["subsections"]):
    #     insert_option(
    #         cursor, subsection, program_id, parent_id=option_db_id, position=pos
    #     )


def insert_or_get_course(cursor: sqlite3.Cursor, course: dict) -> int:
    """
    Inserts a course if its code doesn't exist yet, otherwise fetches the
    existing row's id. This is how the same course can appear in multiple
    sections without being duplicated in the courses table.

    Returns the course's database id.
    """
    cursor.execute(
        """
        INSERT INTO courses (code, title, ects)
        VALUES (?, ?, ?)
        ON CONFLICT(code) DO NOTHING
        """,
        (course["code"], course["title"], course.get("ects")),
    )

    # Whether we just inserted or the row already existed, fetch the id
    cursor.execute("SELECT id FROM courses WHERE code = ?", (course["code"],))
    return cursor.fetchone()[0]


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
