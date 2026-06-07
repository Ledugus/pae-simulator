import requests
import re
from bs4 import BeautifulSoup, Tag


def parse_program_list():
    urls = {}
    url = (
        "https://www.uclouvain.be/fr/catalogue-formations/faculte-2026-epl#CAFO_MASTER"
    )

    response = requests.get(url)
    if response.status_code == 200:
        html_content = response.text
        soup = BeautifulSoup(html_content, "html.parser")
        ul = soup.find("header", class_="list-group-item CAFO_MASTER").parent
        links = ul.find_all("li", class_="list-group-item", recursive=False)
        for li in links:
            link = li.find("a", href=re.compile(r"prog-\d{4}-"))

            if link is None:
                continue
            code = link["href"].split("-")[-1][:-2].upper()
            program_link = link["href"] + "-programme"
            urls[code] = program_link

    else:
        return None
    return urls


def parse_program(master_code, url):
    response = requests.get(url)
    if response.status_code == 200:
        html_content = response.text
        soup = BeautifulSoup(html_content, "html.parser")
    else:
        return None
    root_ul = soup.find("ul", class_="cafo_lu")

    if root_ul is None:
        raise ValueError(
            "Could not find root ul.cafo_lu — has the page structure changed?"
        )

    top_level_lis = root_ul.find_all("li", class_="list-group-item", recursive=False)

    options = []

    for li in top_level_lis:
        label, section_id = extract_label(li)
        content_div = find_content_div(li, section_id)
        collect_options(content_div, section_id, label, options)

    final_dict = {
        "title": master_code,
        "total_ects": 120,
        "options": options,
    }
    return final_dict


def collect_options(
    container, section_id: str, group_label: str, options: list
) -> None:

    nested_ul = container.find("ul", class_="cafo_lu")

    if nested_ul is None:
        courses = extract_courses(container)
        if courses:
            options.append(
                {
                    "html_id": section_id,
                    "label": group_label,
                    "group_label": None,
                    "courses": courses,
                }
            )
    else:
        # Grouping node — current label becomes the group_label for children
        child_lis = nested_ul.find_all("li", class_="list-group-item", recursive=False)
        for child_li in child_lis:
            child_label, child_id = extract_label(child_li)
            child_content = find_content_div(child_li, child_id)

            child_options = []
            collect_options(child_content, child_id, child_label, child_options)

            for opt in child_options:
                if opt["group_label"] is None:
                    opt["group_label"] = group_label
            options.extend(child_options)


def extract_label(li: Tag) -> tuple[str, str]:
    """
    Finds the section_title_ppm div inside the li and returns
    (clean_label, section_id).

    The title div looks like:
      <div class="section_title_ppm" id="title_section_XXXX">
        <span>Tronc commun [30.0]</span>
        ...svg, copy-link spans we don't want...
      </div>
    """
    title_div = li.find("div", class_="section_title_ppm")

    if title_div is None:
        return ("Unknown section", "")

    section_id = title_div.get("id", "")

    # Remove SVG icons and utility spans (copy-link buttons etc.)
    # that pollute the text content — we only want the human-readable label.
    for noise in title_div.find_all(["svg", "span"], id=re.compile(r"link_copy")):
        noise.decompose()

    raw_label = title_div.get_text(separator=" ")
    clean_label = re.sub(r"\s+", " ", raw_label).strip()

    return (clean_label, section_id)


def find_content_div(li: Tag, section_id: str) -> Tag:
    """
    The collapsible content of a section sits in a div whose id mirrors
    the title div: 'title_section_X' -> 'div_section_X'.
    Falls back to the li itself if no such div is found.
    """
    if not section_id:
        return li

    content_id = section_id.replace("title_", "div_")
    content_div = li.find("div", id=content_id)

    return content_div if content_div else li


def extract_courses(container):
    courses = []
    seen_codes = set([])

    for pos, row in enumerate(container.find_all("div", class_="row")):
        link = row.find("a", href=re.compile(r"cours-\d{4}-"))
        if link is None:
            continue

        code = link["href"].split("-", 2)[-1].upper()
        if code in seen_codes:
            continue
        seen_codes.add(code)

        cols = row.find_all("div", class_="col-sm-6")
        left = cols[0] if len(cols) > 0 else row
        right = cols[1] if len(cols) > 1 else None

        # ── LEFT COLUMN ──────────────────────────────────────────
        title = link.get_text(strip=True)

        obl_img = left.find("img", alt=re.compile(r"Obligatoire|Optionnel", re.I))
        mandatory = bool(obl_img and obl_img["alt"] == "Obligatoire")

        # ── RIGHT COLUMN ─────────────────────────────────────────
        lang = None
        semester = []
        hours = None
        years = ""
        friendly = False
        teachers = []

        if right:
            # Language — inside a <code> tag
            lang_code = right.find("code")
            if lang_code:
                lang = lang_code.get_text(strip=True)

            # Blocs — 1, 2, 12 meaning both, None = not found
            year_1_imgs = right.find_all("img", title="1er bloc annuel")
            year_2_imgs = right.find_all("img", title="2e bloc annuel")
            if len(year_1_imgs) > 0:
                years += "1"
            if len(year_2_imgs) > 0:
                years += "2"

            # Semester — 1, 2, 3 meaning both, None = not found
            for span in right.find_all("span", recursive=False):
                t = span.get_text(strip=True)
                if "q1" in t:
                    semester.append("1")
                if "q2" in t:
                    semester.append("2")

            # Hours — sum of all numeric hour values found in the span
            hours = None
            for span in right.find_all("span", recursive=False):
                t = span.get_text(strip=True)
                if re.match(r"\d+h", t):
                    # extract all numbers before 'h' — e.g. '22.5h+22.5h' -> [22.5, 22.5]
                    parts = re.findall(r"(\d+(?:\.\d+)?)h", t)
                    if parts:
                        total = sum(float(p) for p in parts)
                        hours = int(total)

            # French-friendly flag — presence of the .friendly span with content
            friendly_span = right.find("span", class_="friendly")
            if friendly_span and friendly_span.get_text(strip=True):
                friendly = True

            # Teachers — use teachers_nopopup to avoid duplicates from the popup copy
            teacher_div = right.find("div", class_="teachers_nopopup")
            if teacher_div:
                teachers = [a.get_text(strip=True) for a in teacher_div.find_all("a")]

        # ── CREDITS ──────────────────────────────────────────────
        ects = None
        credits_span = row.find("span", string=re.compile(r"crédits"))
        if credits_span:
            try:
                ects = int(credits_span.get_text(strip=True).split()[0])
            except (ValueError, IndexError):
                pass

        courses.append(
            {
                "code": code,
                "title": title,
                "ects": ects,
                "lang": lang,
                "semester": "".join(semester),
                "hours": hours,
                "friendly": friendly,
                "teachers": teachers,
                # data for options
                "years": years,
                "mandatory": mandatory,
                "position": pos,
            }
        )

    return courses
