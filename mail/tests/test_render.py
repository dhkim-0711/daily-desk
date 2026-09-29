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


class EligibilityTests(unittest.TestCase):
    def test_complete_four_or_five(self):
        for count in (4, 5):
            renderer.validate_briefing(sample_briefing(count))

    def test_shortfall_or_unready_fails_closed(self):
        for count in (3, 6):
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


class LayoutTests(unittest.TestCase):
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
