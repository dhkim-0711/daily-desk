"""Invariant checks for publication eligibility, safe content, and fixed layout."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / "render.py"
spec = importlib.util.spec_from_file_location("briefing_renderer", MODULE)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


def sample_briefing(count=5):
    """Synthetic facts only; never copied from an actual briefing."""
    return {
        "schema_version": 1, "date": "2026-09-29", "status": "ready",
        "cutoff_at": "2026-09-29T09:00:00+09:00",
        "window_start": "2026-09-28T09:00:00+09:00",
        "created_at": "2026-09-29T09:05:00+09:00",
        "summary_groups": [{"article_numbers": list(range(start, min(start + 2, count + 1))),
                            "bullets": ["테스트 요약 문장입니다.", "검증된 사실에 대한 테스트 해석입니다."]}
                           for start in range(1, count + 1, 2)],
        "articles": [{"number": n, "title": f"검증용 합성 기사 {n}", "category": "테스트 분류",
                      "collected_at": "2026-09-29T08:00:00+09:00",
                      "original_published_at": "2026-09-28",
                      "original_url": f"https://example.com/article/{n}",
                      "main_points": ["첫 번째 확인된 테스트 사실입니다.", "두 번째 확인된 테스트 사실입니다."],
                      "implications": ["기술적 의미에 관한 테스트 해석입니다.", "국내 파급 방향에 관한 테스트 해석입니다."],
                      "sources": [{"title": f"Synthetic source {n}", "publisher": "Test Publisher",
                                   "published_at": "2026-09-28", "url": f"https://example.com/source/{n}",
                                   "available_before_cutoff": True, "cutoff_evidence": "Captured at 08:00 KST in the test snapshot.",
                                   "verification": "public_primary", "verified_at": "2026-09-29T09:02:00+09:00"}]}
                     for n in range(1, count + 1)]}


def reviewed_briefing(count=6):
    """New policy edition; the legacy fixture remains compatible with send tests."""
    data = sample_briefing(count)
    data.update(date="2026-09-30", cutoff_at="2026-09-30T09:00:00+09:00",
                window_start="2026-09-29T09:00:00+09:00", created_at="2026-09-30T09:05:00+09:00")
    for article in data["articles"]:
        article["collected_at"] = "2026-09-30T08:00:00+09:00"
        article["original_published_at"] = "2026-09-29"
        for source in article["sources"]:
            source.update(published_at="2026-09-29", verified_at="2026-09-30T09:02:00+09:00")
    count_reasons = {
        4: "Only four independently verified issues qualified in this synthetic candidate set.",
        5: "Only five independently verified issues qualified in this synthetic candidate set.",
        6: "Six distinct issues met the importance and verification criteria.",
        7: "The seventh issue adds a distinct operating software development.",
    }
    data["selection_audit"] = {
        "coverage": {
            "domestic_npu": {"result": "reviewed", "note": "Synthetic domestic NPU candidates reviewed."},
            "domestic_policy_demand": {"result": "reviewed", "note": "Synthetic policy and demand candidates reviewed."},
            "global_accelerators": {"result": "reviewed", "note": "Synthetic global accelerator candidates reviewed."},
            "operating_software": {"result": "no_eligible_candidate", "note": "No additional verified software candidate qualified."},
            "memory_packaging_infrastructure": {"result": "reviewed", "note": "Synthetic infrastructure candidates reviewed."},
        },
        "selected": [{"article_number": n, "reason": f"Unique verified industry development {n}."}
                     for n in range(1, count + 1)],
        "excluded": [{"title": "Synthetic alternative", "url": "https://example.com/alternative",
                      "reason": "Covered the same event as a selected primary source."}],
        "count_reason": count_reasons.get(count, "Invalid count used for a rejection test."),
        "company_overlap_review": "Repeated company mentions were checked for independently meaningful developments.",
    }
    return data


class EligibilityTests(unittest.TestCase):
    def test_complete_four_through_seven(self):
        for count in (4, 5, 6, 7):
            renderer.validate_briefing(sample_briefing(count))
            renderer.validate_briefing(reviewed_briefing(count))

    def test_shortfall_or_unready_fails_closed(self):
        for count in (3, 8):
            with self.assertRaises(ValueError):
                renderer.validate_briefing(sample_briefing(count))
        data = sample_briefing(); data["status"] = "draft"
        with self.assertRaises(ValueError): renderer.validate_briefing(data)

    def test_collection_window_open_start_closed_end(self):
        for timestamp, valid in [("2026-09-28T09:00:00+09:00", False),
                                 ("2026-09-28T09:00:01+09:00", True),
                                 ("2026-09-29T09:00:00+09:00", True),
                                 ("2026-09-29T09:00:01+09:00", False)]:
            data = sample_briefing(); data["articles"][0]["collected_at"] = timestamp
            if valid: renderer.validate_briefing(data)
            else:
                with self.assertRaises(ValueError): renderer.validate_briefing(data)

    def test_cutoff_and_window_cannot_drift(self):
        for key, value in [("cutoff_at", "2026-09-29T09:10:00+09:00"),
                           ("window_start", "2026-09-27T09:00:00+09:00"),
                           ("created_at", "2026-09-29T08:55:00+09:00")]:
            data = sample_briefing(); data[key] = value
            with self.assertRaises(ValueError): renderer.validate_briefing(data)

    def test_older_supporting_source_is_allowed_but_future_is_rejected(self):
        data = sample_briefing()
        source = data["articles"][0]["sources"][0]
        source["published_at"] = "2026-06-11"
        renderer.validate_briefing(data)
        source["published_at"] = "2026-09-29T09:01:00+09:00"
        with self.assertRaises(ValueError): renderer.validate_briefing(data)

    def test_recent_date_only_requires_cutoff_evidence(self):
        data = sample_briefing(); source = data["articles"][0]["sources"][0]
        source["published_at"] = "2026-09-29"
        source.pop("available_before_cutoff"); source.pop("cutoff_evidence")
        with self.assertRaises(ValueError): renderer.validate_briefing(data)
        source.update(available_before_cutoff=True, cutoff_evidence="Captured in the 08:00 KST source snapshot.")
        renderer.validate_briefing(data)
        source["published_at"] = "2026-09-28"
        source.pop("available_before_cutoff")
        with self.assertRaises(ValueError): renderer.validate_briefing(data)

    def test_title_only_or_missing_citations_rejected(self):
        for key, value in [("sources", []), ("main_points", ["A title only"]), ("implications", [])]:
            data = sample_briefing(); data["articles"][0][key] = value
            with self.assertRaises(ValueError): renderer.validate_briefing(data)
        data = sample_briefing(); data["articles"][0]["sources"][0]["verification"] = "rss_title"
        with self.assertRaises(ValueError): renderer.validate_briefing(data)

    def test_summary_has_no_missing_or_duplicate_articles(self):
        for numbers in ([1, 2, 3, 4], [1, 1, 2, 3, 4, 5]):
            data = sample_briefing(); data["summary_groups"][0]["article_numbers"] = numbers
            with self.assertRaises(ValueError): renderer.validate_briefing(data)

    def test_javascript_data_and_credential_urls_rejected(self):
        for url in ["javascript:alert(1)", "data:text/html,evil", "https://user:secret@example.com/", "file:///etc/passwd"]:
            data = sample_briefing(); data["articles"][0]["sources"][0]["url"] = url
            with self.assertRaises(ValueError): renderer.validate_briefing(data)


class SelectionAuditTests(unittest.TestCase):
    def test_effective_date_keeps_legacy_editions_renderable(self):
        renderer.validate_briefing(sample_briefing())
        data = reviewed_briefing()
        data.pop("selection_audit")
        with self.assertRaisesRegex(ValueError, "selection_audit"):
            renderer.validate_briefing(data)
        # The requirement also applies after its first effective date.
        data.update(date="2026-10-01", cutoff_at="2026-10-01T09:00:00+09:00",
                    window_start="2026-09-30T09:00:00+09:00", created_at="2026-10-01T09:05:00+09:00")
        for article in data["articles"]:
            article["collected_at"] = "2026-10-01T08:00:00+09:00"
        with self.assertRaisesRegex(ValueError, "selection_audit"):
            renderer.validate_briefing(data)

    def test_optional_legacy_audit_is_validated_if_present(self):
        data = sample_briefing()
        data["selection_audit"] = reviewed_briefing(5)["selection_audit"]
        renderer.validate_briefing(data)
        data["selection_audit"]["count_reason"] = " "
        with self.assertRaisesRegex(ValueError, "count_reason"):
            renderer.validate_briefing(data)

    def test_every_coverage_area_requires_a_review_and_note(self):
        for area in reviewed_briefing()["selection_audit"]["coverage"]:
            for problem in ("missing", "bad_result", "empty_note"):
                with self.subTest(area=area, problem=problem):
                    data = reviewed_briefing()
                    coverage = data["selection_audit"]["coverage"]
                    if problem == "missing": coverage.pop(area)
                    elif problem == "bad_result": coverage[area]["result"] = "not_checked"
                    else: coverage[area]["note"] = "\t "
                    with self.assertRaisesRegex(ValueError, f"coverage.{area}"):
                        renderer.validate_briefing(data)

    def test_selected_reasons_cover_each_article_exactly_once(self):
        for problem in ("missing", "duplicate", "out_of_range", "boolean_number", "empty_reason"):
            with self.subTest(problem=problem):
                data = reviewed_briefing()
                selected = data["selection_audit"]["selected"]
                if problem == "missing": selected.pop()
                elif problem == "duplicate": selected[-1]["article_number"] = 1
                elif problem == "out_of_range": selected[-1]["article_number"] = 7
                elif problem == "boolean_number": selected[0]["article_number"] = True
                else: selected[-1]["reason"] = " "
                with self.assertRaisesRegex(ValueError, "selection_audit.selected"):
                    renderer.validate_briefing(data)

    def test_count_and_company_review_cannot_be_blank(self):
        for field in ("count_reason", "company_overlap_review"):
            data = reviewed_briefing()
            data["selection_audit"][field] = ""
            with self.assertRaisesRegex(ValueError, field):
                renderer.validate_briefing(data)

    def test_excluded_candidates_require_usable_url_and_reason(self):
        for key, value in (("url", "javascript:alert(1)"), ("url", "https://user:secret@example.com/"),
                           ("title", ""), ("reason", " ")):
            with self.subTest(key=key, value=value):
                data = reviewed_briefing()
                data["selection_audit"]["excluded"][0][key] = value
                with self.assertRaisesRegex(ValueError, "selection_audit.excluded"):
                    renderer.validate_briefing(data)
        data = reviewed_briefing()
        data["selection_audit"]["excluded"] = []
        renderer.validate_briefing(data)

    def test_structural_evidence_does_not_impose_category_or_company_quotas(self):
        data = reviewed_briefing()
        for article in data["articles"]:
            article["title"] = f"Same Company independent development {article['number']}"
            article["category"] = "Same category"
        renderer.validate_briefing(data)


class LayoutTests(unittest.TestCase):
    def test_six_and_seven_articles_keep_complete_numbering_and_fixed_cards(self):
        for count in (6, 7):
            with self.subTest(count=count):
                data = reviewed_briefing(count)
                html = renderer.render_html(data)
                text = renderer.render_text(data)
                self.assertEqual(html.count('class="article-card"'), count)
                self.assertIn(f"2. 주요 기사 {count}건", html)
                self.assertIn(f"2. 주요 기사 {count}건", text)
                for number in range(1, count + 1):
                    self.assertEqual(text.splitlines().count(f"{number:02d} 검증용 합성 기사 {number}"), 2)
                    self.assertIn(f'>{number:02d}</span>', html)
                    self.assertIn(f"Synthetic source {number}", text)
                self.assertIn('src="cid:nipa-logo"', html)

    def test_selection_audit_never_enters_email_text_or_pdf_html(self):
        data = sample_briefing()
        expected_html, expected_text = renderer.render_html(data), renderer.render_text(data)
        data["selection_audit"] = reviewed_briefing(5)["selection_audit"]
        data["selection_audit"]["count_reason"] = "INTERNAL-SELECTION-REVIEW-MUST-NOT-APPEAR"
        # PDF generation consumes the same HTML; no internal audit reaches it.
        self.assertEqual(renderer.render_html(data), expected_html)
        self.assertEqual(renderer.render_text(data), expected_text)
        self.assertNotIn("selection_audit", renderer._context(data))

    def test_escape_content_and_preserve_approved_layout(self):
        data = sample_briefing()
        data["articles"][0]["title"] = '<script>alert("x")</script> & 검증'
        data["articles"][0]["sources"][0]["url"] = 'https://example.com/?q="onmouseover="evil'
        html = renderer.render_html(data)
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)
        self.assertIn("&#34;onmouseover=&#34;", html)
        self.assertEqual(html.count('class="article-card"'), 5)
        self.assertIn('bgcolor="#15364a"', html)
        self.assertIn("implications-pad", html)
        self.assertIn('src="cid:nipa-logo"', html)
        self.assertIn("Noto Sans KR", html)
        self.assertIn("AI반도체전략팀", html)
        self.assertIn("DAILY DESK / MORNING BRIEFING", html)
        self.assertNotIn("{{", html)
        self.assertNotIn("{%", html)

    def test_html_is_deterministic_and_does_not_mutate_input(self):
        data = sample_briefing(); original = deepcopy(data)
        self.assertEqual(renderer.render_html(data), renderer.render_html(data))
        self.assertEqual(data, original)

    def test_optional_reference_only_when_present_and_no_invented_time(self):
        data = sample_briefing(); html = renderer.render_html(data)
        self.assertNotIn("참고 :", html)
        self.assertNotIn("2026.09.28 00:00", html)
        data["articles"][0]["references"] = [{"title": "Additional statistic", "publisher": "Research Institute",
            "published_at": "2025-01-01", "url": "https://example.com/report"}]
        html = renderer.render_html(data)
        self.assertEqual(html.count("참고 :"), 1)
        self.assertIn("Additional statistic", renderer.render_text(data))


if __name__ == "__main__":
    unittest.main()
