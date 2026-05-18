import sqlite3


def get_db():
    conn = sqlite3.connect("database.db")
    conn.row_factory = (
        sqlite3.Row
    )  # rows behave like dicts: row['label'] instead of row[0]
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

    # ── 1. Fetch the program row ──────────────────────────────────────────────
    program = conn.execute(
        "SELECT * FROM programs WHERE id = ?", (program_id,)
    ).fetchone()

    if program is None:
        return None

    try:
        tronc_commun_courses = conn.execute(
            """
            SELECT c.id, c.code, c.title, c.ects, tc.position, tc.mandatory
            FROM courses c
            JOIN tronc_courses tc ON tc.course_id = c.id
            WHERE tc.program_id = ?
            ORDER BY tc.position
            """,
            (program_id,),
        ).fetchall()
    except sqlite3.OperationalError as e:
        print("Error", e)

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
        SELECT c.id, c.code, c.title, c.ects, oc.option_id, oc.position, oc.mandatory
        FROM courses c
        JOIN option_courses oc ON oc.course_id = c.id
        JOIN options o ON o.id = oc.option_id
        WHERE o.program_id = ?
        ORDER BY oc.position
        """,
        (program_id,),
    ).fetchall()

    conn.close()

    # ── 4. Build the tree in Python ───────────────────────────────────────────
    return build_tree(program, tronc_commun_courses, option_rows, course_rows)


def print_program(program, tronc_courses):
    print(program["total_ects"])
    print(len(tronc_courses))


def build_tree(program, tronc_rows, option_rows, course_rows) -> dict:

    # Index option courses by option_id for quick lookup
    # { option_id: [course, course, ...] }
    courses_by_option = {}
    for row in course_rows:
        oid = row["option_id"]
        if oid not in courses_by_option:
            courses_by_option[oid] = []
        courses_by_option[oid].append(
            {
                "id": row["id"],
                "code": row["code"],
                "title": row["title"],
                "ects": row["ects"],
                "mandatory": bool(row["mandatory"]),
                "position": row["position"],
            }
        )

    # Build the flat options list, each with its courses attached
    options = []
    for row in option_rows:
        options.append(
            {
                "id": row["id"],
                "html_id": row["html_id"],
                "label": row["label"],
                "group_label": row["group_label"],
                "courses": courses_by_option.get(row["id"], []),
            }
        )

    # Tronc commun is a flat list — no grouping needed
    tronc_commun = [
        {
            "id": row["id"],
            "code": row["code"],
            "title": row["title"],
            "ects": row["ects"],
            "position": row["position"],
            "mandatory": bool(row["mandatory"]),
        }
        for row in tronc_rows
    ]

    return {
        "id": program["id"],
        "title": program["title"],
        "total_ects": program["total_ects"],
        "tronc_commun": tronc_commun,
        "options": options,
    }


def test_db():

    conn = get_db()
    program_id = 1
    program = conn.execute(
        "SELECT * FROM programs WHERE id = ?", (program_id,)
    ).fetchone()

    course = conn.execute(
        "SELECT * FROM courses WHERE code = ?", ("LINMA2471",)
    ).fetchone()
    if course is None:
        print("course not found")
    else:
        print(course["title"])


if __name__ == "__main__":
    print(get_program(1))
