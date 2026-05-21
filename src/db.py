import sqlite3


def get_db():
    conn = sqlite3.connect("database.db")
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

    tronc_commun_courses = conn.execute(
        """
        SELECT c.id, c.code, c.title, c.ects, c.lang, c.semester, c.hours, c.years, c.friendly, tc.position, tc.mandatory
        FROM courses c
        JOIN tronc_courses tc ON tc.course_id = c.id
        WHERE tc.program_id = ?
        ORDER BY tc.position
        """,
        (program_id,),
    ).fetchall()

    option_rows = conn.execute(
        """
        SELECT id, html_id, label, group_label, position
        FROM options
        WHERE program_id = ?
        ORDER BY position
        """,
        (program_id,),
    ).fetchall()

    course_rows = conn.execute(
        """
        SELECT c.id, c.code, c.title, c.ects, c.lang, c.semester, c.hours, c.years, c.friendly, oc.option_id, oc.position, oc.mandatory
        FROM courses c
        JOIN option_courses oc ON oc.course_id = c.id
        JOIN options o ON o.id = oc.option_id
        WHERE o.program_id = ?
        ORDER BY oc.position
        """,
        (program_id,),
    ).fetchall()

    prof_rows = conn.execute(
        """
        SELECT p.id, p.name, c.code
        FROM professors p
        JOIN teaching t ON t.prof_id = p.id
        JOIN courses c ON c.id = t.course_id
        WHERE c.id IN (
            SELECT course_id FROM tronc_courses WHERE program_id = ?
            UNION
            SELECT oc.course_id FROM option_courses oc
            JOIN options o ON o.id = oc.option_id
            WHERE o.program_id = ?
        )
        ORDER BY c.code
        """,
        (program_id, program_id),
    ).fetchall()
    conn.close()

    # After fetching all data, we put it in a dict exploitable by the front-end
    return build_program(
        program_row, tronc_commun_courses, option_rows, course_rows, prof_rows
    )


def build_program(program_row, tronc_rows, option_rows, course_rows, prof_rows) -> dict:

    # Index option courses by option_id for quick lookup
    # { option_id: [course, course, ...] }
    courses = {}

    for row in tronc_rows:
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

    # ── Tronc commun — relationship data only, course data lives in courses ──

    tronc_commun_courses = [
        {
            "code": row["code"],
            "mandatory": bool(row["mandatory"]),
            "position": row["position"],
        }
        for row in tronc_rows
    ]
    tronc_commun = {
        "id": "tronc",
        "html_id": "tronc",
        "label": "Tronc Commun",
        "group_label": None,
        "courses": tronc_commun_courses,
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

    professors = {}
    for row in prof_rows:
        professors[row["id"]] = row["name"]
        courses[row["code"]]["teachers"].append(row["id"])

    options = [
        {
            "id": row["id"],
            "html_id": row["html_id"],
            "label": row["label"],
            "group_label": row["group_label"],
            "courses": courses_by_option.get(row["id"], []),
        }
        for row in option_rows
    ]
    options.insert(0, tronc_commun)

    return {
        "id": program_row["id"],
        "title": program_row["title"],
        "total_ects": program_row["total_ects"],
        "courses": courses,  # dict keyed by code
        "options": options,  # list of options, each with a courses list
        "professors": professors,
    }


def test_db():

    conn = get_db()
    course = conn.execute(
        "SELECT * FROM courses WHERE code = ?", ("LINMA2471",)
    ).fetchone()
    if course is None:
        print("course not found")
    else:
        print(course["title"])

    prof = conn.execute(
        "SELECT * FROM teaching WHERE course_id = ?",
        (int(100),),
    ).fetchone()[0]
    print(prof)


if __name__ == "__main__":
    test_db()
    get_program(1)
