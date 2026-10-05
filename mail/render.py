#!/usr/bin/env python3
"""Validate a cutoff-frozen briefing and render the user's fixed email layout.

No model or network call occurs here. Imported API: validate_briefing(data),
render_html(data), render_briefing(data, output_dir) -> dict[str, pathlib.Path].
Source date-only values are retained as dates; a clock time is never invented.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
KST = timezone(timedelta(hours=9))
VERIFICATION_METHODS = {"full_text", "public_primary", "public_reprint"}
SELECTION_AUDIT_REQUIRED_FROM = date(2026, 9, 30)
SELECTION_COVERAGE_AREAS = (
    "domestic_npu", "domestic_policy_demand", "global_accelerators",
    "operating_software", "memory_packaging_infrastructure",
)
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def _text(value, field, maximum=4000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f"{field}: nonempty text of at most {maximum} characters required")
    if any(ord(c) < 32 and c not in "\n\t" for c in value):
        raise ValueError(f"{field}: control characters are not allowed")
    return value


def _timestamp(value, field):
    _text(value, field, 50)
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field}: ISO 8601 timestamp required") from exc
    if result.tzinfo is None or result.utcoffset() is None or "T" not in value:
        raise ValueError(f"{field}: explicit timezone and time required")
    return result


def _date_or_timestamp(value, field):
    _text(value, field, 50)
    if DATE_RE.fullmatch(value):
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"{field}: invalid date") from exc
    return _timestamp(value, field)


def _before_cutoff(value, cutoff, field):
    parsed = _date_or_timestamp(value, field)
    if isinstance(parsed, datetime):
        after = parsed > cutoff
    else:
        after = parsed > cutoff.astimezone(KST).date()
    if after:
        raise ValueError(f"{field}: information published after cutoff is not allowed")
    return parsed


def _url(value, field):
    _text(value, field, 2000)
    parsed = urlsplit(value)
    if (parsed.scheme not in {"https", "http"} or not parsed.hostname
            or parsed.username or parsed.password or any(c.isspace() for c in value)):
        raise ValueError(f"{field}: public http(s) URL without credentials required")


def _paragraphs(value, field, minimum=2, maximum=3):
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ValueError(f"{field}: {minimum}-{maximum} paragraphs required")
    for i, paragraph in enumerate(value):
        _text(paragraph, f"{field}[{i}]", 1800)


def _source(value, field, cutoff, created, verified=True):
    if not isinstance(value, dict):
        raise ValueError(f"{field}: object required")
    _text(value.get("title"), field + ".title", 500)
    _text(value.get("publisher"), field + ".publisher", 160)
    _url(value.get("url"), field + ".url")
    published = _before_cutoff(value.get("published_at"), cutoff, field + ".published_at")
    if not isinstance(published, datetime) and published >= cutoff.astimezone(KST).date() - timedelta(days=1):
        if value.get("available_before_cutoff") is not True:
            raise ValueError(f"{field}: recent date-only source requires available_before_cutoff=true")
        _text(value.get("cutoff_evidence"), field + ".cutoff_evidence", 1000)
    if verified:
        if value.get("verification") not in VERIFICATION_METHODS:
            raise ValueError(f"{field}: full-text/public-source verification required")
        checked = _timestamp(value.get("verified_at"), field + ".verified_at")
        if checked > created:
            raise ValueError(f"{field}: verified_at must be no later than created_at")
        if isinstance(published, datetime) and checked < published:
            raise ValueError(f"{field}: verification cannot predate publication")


def _selection_audit(value, article_count):
    """Check the internal evidence record, not the truth of editorial judgments.

    Coverage is a requirement to review candidates, never an allocation of slots.
    Neither article topics nor the number of articles about a company are capped.
    """
    field = "selection_audit"
    if not isinstance(value, dict):
        raise ValueError(f"{field}: object required")
    coverage = value.get("coverage")
    if not isinstance(coverage, dict):
        raise ValueError(f"{field}.coverage: object required")
    for area in SELECTION_COVERAGE_AREAS:
        area_field = f"{field}.coverage.{area}"
        review = coverage.get(area)
        if not isinstance(review, dict):
            raise ValueError(f"{area_field}: review object required")
        if review.get("result") not in ("reviewed", "no_eligible_candidate"):
            raise ValueError(f"{area_field}.result: reviewed or no_eligible_candidate required")
        _text(review.get("note"), area_field + ".note")
    selected = value.get("selected")
    if not isinstance(selected, list) or len(selected) != article_count:
        raise ValueError(f"{field}.selected: every article must have one selection reason")
    numbers = []
    for index, selection in enumerate(selected):
        selection_field = f"{field}.selected[{index}]"
        if not isinstance(selection, dict) or type(selection.get("article_number")) is not int:
            raise ValueError(f"{selection_field}.article_number: integer article number required")
        numbers.append(selection["article_number"])
        _text(selection.get("reason"), selection_field + ".reason")
    if sorted(numbers) != list(range(1, article_count + 1)):
        raise ValueError(f"{field}.selected: every article must be covered exactly once")
    excluded = value.get("excluded")
    if not isinstance(excluded, list):
        raise ValueError(f"{field}.excluded: list of considered alternatives required")
    for index, exclusion in enumerate(excluded):
        exclusion_field = f"{field}.excluded[{index}]"
        if not isinstance(exclusion, dict):
            raise ValueError(f"{exclusion_field}: object required")
        _text(exclusion.get("title"), exclusion_field + ".title", 500)
        _url(exclusion.get("url"), exclusion_field + ".url")
        _text(exclusion.get("reason"), exclusion_field + ".reason")
    _text(value.get("count_reason"), field + ".count_reason")
    _text(value.get("company_overlap_review"), field + ".company_overlap_review")


def validate_briefing(data):
    """Raise ValueError unless the document is a complete, cutoff-frozen edition.

    Eligibility follows the Daily Desk collection window, not the date of every
    supporting source. Source verification declarations do not replace editorial
    verification by the generation step.
    """
    if not isinstance(data, dict) or type(data.get("schema_version")) is not int or data["schema_version"] != 1:
        raise ValueError("schema_version: integer 1 required")
    if data.get("status") != "ready":
        raise ValueError("status: only ready editions can be rendered or sent")
    issue_date = data.get("date")
    if not isinstance(issue_date, str) or not DATE_RE.fullmatch(issue_date):
        raise ValueError("date: YYYY-MM-DD required")
    try:
        issue_date = date.fromisoformat(issue_date)
    except ValueError as exc:
        raise ValueError("date: invalid calendar date") from exc
    cutoff = _timestamp(data.get("cutoff_at"), "cutoff_at")
    start = _timestamp(data.get("window_start"), "window_start")
    created = _timestamp(data.get("created_at"), "created_at")
    if (cutoff.utcoffset() != timedelta(hours=9) or cutoff.date() != issue_date
            or (cutoff.hour, cutoff.minute, cutoff.second, cutoff.microsecond) != (9, 0, 0, 0)):
        raise ValueError("cutoff_at: issue date at exactly 09:00:00+09:00 required")
    if start.utcoffset() != timedelta(hours=9) or cutoff - start != timedelta(days=1):
        raise ValueError("window_start: exactly 24 hours before cutoff in +09:00 required")
    if created < cutoff:
        raise ValueError("created_at: final edition cannot predate cutoff")
    articles = data.get("articles")
    if not isinstance(articles, list) or not 4 <= len(articles) <= 7:
        raise ValueError("articles: ready edition requires 4-7 verified articles; 6 is the editorial default")
    original_urls = {}
    for number, article in enumerate(articles, 1):
        field = f"articles[{number - 1}]"
        if not isinstance(article, dict) or type(article.get("number")) is not int or article["number"] != number:
            raise ValueError(f"{field}.number: contiguous 1-based article numbers required")
        _text(article.get("title"), field + ".title", 300)
        _text(article.get("category"), field + ".category", 120)
        collected = _timestamp(article.get("collected_at"), field + ".collected_at")
        if not start < collected <= cutoff:
            raise ValueError(f"{field}.collected_at: must lie in (window_start, cutoff_at]")
        published = _before_cutoff(article.get("original_published_at"), cutoff, field + ".original_published_at")
        if isinstance(published, datetime) and published > collected:
            raise ValueError(f"{field}: original publication cannot follow collection")
        if article.get("original_url") is not None:
            _url(article["original_url"], field + ".original_url")
            original_urls.setdefault(article["original_url"], []).append(number)
        _paragraphs(article.get("main_points"), field + ".main_points")
        _paragraphs(article.get("implications"), field + ".implications")
        sources = article.get("sources")
        if not isinstance(sources, list) or not 1 <= len(sources) <= 5:
            raise ValueError(f"{field}.sources: 1-5 verified sources required")
        for i, source in enumerate(sources):
            _source(source, f"{field}.sources[{i}]", cutoff, created)
        references = article.get("references", [])
        if not isinstance(references, list) or len(references) > 5:
            raise ValueError(f"{field}.references: at most 5 optional references allowed")
        for i, reference in enumerate(references):
            _source(reference, f"{field}.references[{i}]", cutoff, created, verified=False)
    groups = data.get("summary_groups")
    if not isinstance(groups, list) or not 1 <= len(groups) <= len(articles):
        raise ValueError("summary_groups: 1 through article-count groups required")
    mentioned = []
    for i, group in enumerate(groups):
        if not isinstance(group, dict):
            raise ValueError(f"summary_groups[{i}]: object required")
        numbers = group.get("article_numbers")
        if not isinstance(numbers, list) or not 1 <= len(numbers) <= 2 or any(type(n) is not int for n in numbers):
            raise ValueError(f"summary_groups[{i}].article_numbers: 1-2 related article numbers required")
        mentioned.extend(numbers)
        _paragraphs(group.get("bullets"), f"summary_groups[{i}].bullets", 2, 2)
    if sorted(mentioned) != list(range(1, len(articles) + 1)):
        raise ValueError("summary_groups: every article must be covered exactly once")
    if issue_date >= SELECTION_AUDIT_REQUIRED_FROM or "selection_audit" in data:
        _selection_audit(data.get("selection_audit"), len(articles))
    _shared_original_reviews(data, original_urls)


def _shared_original_reviews(data, original_urls):
    """A roundup URL is provenance, not necessarily a single event.

    Keep rejecting duplicates by default. Separately verified events may share
    a collection URL only with an explicit, complete editorial evidence record.
    Never rewrite collection URLs or timestamps merely to satisfy uniqueness.
    """
    groups = {url: numbers for url, numbers in original_urls.items() if len(numbers) > 1}
    reviews = data.get("selection_audit", {}).get("shared_original_reviews", [])
    if not isinstance(reviews, list):
        raise ValueError("selection_audit.shared_original_reviews: list required")
    seen = set()
    for review in reviews:
        field = "selection_audit.shared_original_reviews"
        if not isinstance(review, dict):
            raise ValueError(f"{field}: object required")
        url = review.get("original_url")
        _url(url, field + ".original_url")
        numbers = review.get("article_numbers")
        if (url not in groups or url in seen or not isinstance(numbers, list)
                or any(type(n) is not int for n in numbers) or sorted(numbers) != groups[url]):
            raise ValueError(f"{field}: exact shared-URL article group required")
        _text(review.get("reason"), field + ".reason")
        entries = [data["articles"][n - 1] for n in numbers]
        source_sets = [{source["url"] for source in article["sources"]} for article in entries]
        # Each issue needs its own verified document beyond the shared roundup
        # and any background documents also used for the other issues.
        for index, sources in enumerate(source_sets):
            other_sources = set().union(*(s for i, s in enumerate(source_sets) if i != index))
            if not sources - other_sources - {url}:
                raise ValueError(f"{field}: each issue requires a distinct verified source")
        if (len({a["title"].strip() for a in entries}) != len(entries)
                or len({tuple(a["main_points"]) for a in entries}) != len(entries)):
            raise ValueError(f"{field}: repeated title or facts are not independent issues")
        seen.add(url)
    if seen != set(groups):
        raise ValueError("articles: duplicate original article URL requires shared_original_reviews")


def _display_timestamp(value):
    parsed = _date_or_timestamp(value, "display date")
    if isinstance(parsed, datetime):
        return parsed.astimezone(KST).strftime("%Y.%m.%d %H:%M KST")
    return parsed.strftime("%Y.%m.%d")


def _context(data):
    context = deepcopy(data)
    # Internal candidate review must not enter HTML, plain text, or PDF output.
    context.pop("selection_audit", None)
    context["display_date"] = data["date"].replace("-", ".")
    context["cutoff_display"] = _timestamp(data["cutoff_at"], "cutoff_at").strftime("%Y.%m.%d %H:%M")
    context["start_display"] = _timestamp(data["window_start"], "window_start").strftime("%Y.%m.%d %H:%M")
    citation_id = 1
    for article in context["articles"]:
        article.setdefault("references", [])
        for source in article["sources"]:
            source["citation_id"] = citation_id
            source["mark"] = str(citation_id).translate(SUPERSCRIPT)
            source["date_display"] = _display_timestamp(source["published_at"])
            citation_id += 1
        for reference in article["references"]:
            reference["date_display"] = _display_timestamp(reference["published_at"])
    return context


def render_html(data):
    """Return escaped email HTML; logo is the sender's inline cid:nipa-logo."""
    validate_briefing(data)
    from jinja2 import Environment, FileSystemLoader, StrictUndefined
    environment = Environment(loader=FileSystemLoader(ROOT / "templates"),
                              autoescape=True, undefined=StrictUndefined,
                              keep_trailing_newline=True)
    return environment.get_template("briefing.html.j2").render(**_context(data))


def render_text(data):
    validate_briefing(data)
    context = _context(data)
    lines = [f"AI반도체 일일 브리핑[{context['display_date']}]",
             f"기준 시각: {context['cutoff_display']} KST",
             f"분석 구간: {context['start_display']} ~ {context['cutoff_display']} KST", "",
             "1. 오늘의 핵심 요약"]
    for group in context["summary_groups"]:
        for number in group["article_numbers"]:
            lines.append(f"{number:02d} {context['articles'][number - 1]['title']}")
        lines.extend(f"• {bullet}" for bullet in group["bullets"])
        lines.append("")
    lines.append(f"2. 주요 기사 {len(context['articles'])}건")
    for article in context["articles"]:
        lines.extend(["", f"{article['number']:02d} {article['title']}", "주요 내용", *article["main_points"]])
        for reference in article["references"]:
            lines.append(f"참고 : {reference['title']}({reference['publisher']}, {reference['date_display']}) {reference['url']}")
        lines.extend(["시사점", *article["implications"], "발행일 및 출처"])
        lines.extend(f"[{source['citation_id']}] {source['publisher']} · {source['date_display']} {source['url']}"
                     for source in article["sources"])
    lines.extend(["", "3. 출처 기사"])
    for article in context["articles"]:
        for source in article["sources"]:
            lines.extend([f"[{source['citation_id']}] {source['title']}",
                          f"{source['publisher']} · {source['date_display']}",
                          f"Daily Desk {article['category']}", source["url"], ""])
    lines.extend(["Daily Desk 열기: https://dhkim-0711.github.io/daily-desk/",
                  "AI 에이전트가 수집 기사를 분석·정리해 생성한 브리핑입니다.", "NIPA 정보통신산업진흥원 · AI반도체전략팀", ""])
    return "\n".join(lines)


PRINT_CSS = """
@page { size:A4; margin:12mm 12mm 14mm; @bottom-right { content:counter(page) ' / ' counter(pages); font-family:'Noto Sans CJK KR',sans-serif; font-size:8pt; color:#597384; } }
body { font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif !important; }
body > table, body > table > tbody, body > table > tbody > tr, body > table > tbody > tr > td,
body > table > tr, body > table > tr > td,
.email-shell, .email-shell > tbody, .email-shell > tbody > tr, .email-shell > tbody > tr > td,
.email-shell > tr, .email-shell > tr > td { display:block; }
.outer-pad { padding:0 !important; }
.email-shell { width:100% !important; max-width:none !important; text-align:left; }
.article-card { break-inside:avoid; }
.summary-item, .sources-section { break-inside:avoid; }
h2,h3 { break-after:avoid; }
.footer-pad { break-inside:avoid; }
.team-tag { font-family:'Noto Sans KR','Noto Sans CJK KR',sans-serif !important; font-weight:700; }
"""


def render_briefing(data, output_dir):
    """Produce HTML, UTF-8 plain text, and a linked/selectable PDF atomically.

    The PDF renderer may load only the bundled logo. It does not fetch article
    URLs or remote fonts. No output is published if PDF generation fails.
    """
    validate_briefing(data)
    html = render_html(data)
    text = render_text(data)
    from weasyprint import CSS, HTML, default_url_fetcher
    logo = (ROOT / "assets" / "nipa-white.png").resolve()
    if not logo.is_file():
        raise ValueError(f"Approved NIPA logo is missing: {logo}")
    logo_uri = logo.as_uri()
    def local_logo_only(url, *args, **kwargs):
        if url != logo_uri:
            raise ValueError("PDF resource fetch denied; only the bundled NIPA logo is allowed")
        return default_url_fetcher(url, *args, **kwargs)
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    names = {"html": f"daily_desk_{data['date']}_0900.html",
             "text": f"daily_desk_{data['date']}_0900.txt",
             "pdf": f"AI반도체_일일_브리핑_{data['date'].replace('-', '.')}.pdf"}
    with tempfile.TemporaryDirectory(prefix=".render-", dir=output_dir) as temporary:
        stage = Path(temporary)
        (stage / names["html"]).write_text(html, encoding="utf-8")
        (stage / names["text"]).write_text(text, encoding="utf-8")
        HTML(string=html.replace('src="cid:nipa-logo"', f'src="{logo_uri}"'),
             base_url=ROOT.as_uri() + "/", url_fetcher=local_logo_only).write_pdf(
                 stage / names["pdf"], stylesheets=[CSS(string=PRINT_CSS)],
                 presentational_hints=True)
        for name in names.values():
            (stage / name).replace(output_dir / name)
    return {kind: output_dir / name for kind, name in names.items()}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args(argv)
    try:
        with args.input.open(encoding="utf-8") as stream:
            data = json.load(stream)
        validate_briefing(data)
        if args.validate_only:
            print(json.dumps({"valid": True, "date": data["date"]}))
        else:
            if not args.output_dir:
                parser.error("--output-dir is required unless --validate-only is used")
            paths = render_briefing(data, args.output_dir)
            print(json.dumps({kind: str(path) for kind, path in paths.items()}, ensure_ascii=False))
    except (ValueError, OSError) as exc:
        parser.exit(2, f"Invalid briefing: {exc}\n")


if __name__ == "__main__":
    main()
