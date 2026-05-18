import requests
import re
from bs4 import BeautifulSoup, Tag

from db import get_all_programs, get_program


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

    # Each direct li child of the root ul is a top-level section
    # (e.g. Tronc commun, Finalité, Options).
    top_level_lis = root_ul.find_all("li", class_="list-group-item", recursive=False)

    tronc_courses = []
    options = []

    for li in top_level_lis:
        label, section_id = extract_label(li)
        content_div = find_content_div(li, section_id)

        if "tronc_commun" in section_id:
            new_courses = extract_courses(content_div)
            tronc_courses = add_courses(new_courses, tronc_courses)
        else:
            collect_options(content_div, section_id, options)
    final_dict = {
        "title": master_code,
        "total_ects": 120,
        "tronc_commun": tronc_courses,
        "options": options,
    }
    return final_dict


def collect_options(container, parent_id: str, options: list) -> None:
    """
    Walks a container and appends leaf options to the options list.
    Sub-options are flattened — only leaves (sections with actual courses) are kept.
    The parent grouping label is preserved as group_label for UI display only.
    """
    nested_ul = container.find("ul", class_="cafo_lu")

    if nested_ul is None:
        # This is a leaf — it has courses directly, so it's a real option
        courses = extract_courses(container)
        if courses:  # ignore empty sections
            label, section_id = extract_label(
                container.find_parent("li", class_="list-group-item")
            )
            options.append(
                {
                    "html_id": section_id,
                    "label": label,
                    "group_label": None,  # filled in by the caller when recursing
                    "courses": courses,
                }
            )
    else:
        # This is a grouping node — recurse into its children
        # Pass the current label down as group_label for the leaves
        group_label, _ = extract_label(
            container.find_parent("li", class_="list-group-item")
        )
        child_lis = nested_ul.find_all("li", class_="list-group-item", recursive=False)
        for child_li in child_lis:
            child_label, child_id = extract_label(child_li)
            child_content = find_content_div(child_li, child_id)
            # Recurse, but inject the group label before appending
            child_options = []
            collect_options(child_content, child_id, child_options)
            for opt in child_options:
                if opt["group_label"] is None:  # don't overwrite a deeper group label
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

    raw = title_div.get_text(separator=" ")
    clean = re.sub(r"\s+", " ", raw).strip()

    return (clean, section_id)


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


def add_courses(courses, option_course_list):
    for course in courses:
        option_course_list.append(course)
    return option_course_list


def extract_courses(container: Tag) -> list[dict]:
    """
    Finds all course rows inside a container div.
    Each course row is a div.row containing a link to a course page
    (href matching 'cours-2025-...').

    Returns a list of minimal dicts — just enough to identify each course.
    Extend this function when you need more fields (ECTS, language, etc.)
    """
    courses = []
    seen_codes = set()  # against duplicate
    for pos, row in enumerate(container.find_all("div", class_="row")):
        link = row.find("a", href=re.compile(r"cours-\d{4}-"))

        if link is None:
            continue

        # CODE
        code = (
            link["href"].split("-", 2)[-1].upper()
        )  # 'cours-2025-lelec2990' -> 'LELEC2990'

        if code in seen_codes:
            continue
        seen_codes.add(code)

        # TITLE
        title = link.get_text(strip=True)

        # ECTS
        credits_span = row.find("span", string=re.compile(r"crédits")).get_text(
            strip=True
        )
        try:
            ects = int(credits_span.strip().split()[0])
        except:
            ects = None

        # MANDATORY
        obl_img = row.find("img", alt=re.compile(r"Obligatoire|Optionnel", re.I))
        mandatory = obl_img and obl_img["alt"] == "Obligatoire"

        courses.append(
            {
                "code": code,
                "title": title,
                "ects": ects,
                "mandatory": mandatory,
                "position": pos,
            }
        )

    return courses


def parse_all_programs():
    urls = parse_program_list()
    if urls is None:
        print("Problem fetching programs list")
    else:
        for code, url in urls.items():
            parse_program(code, url)
