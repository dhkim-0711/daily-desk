"""Keep historical editions valid and require the approved new structure."""
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from test_render import renderer, sample_briefing, reviewed_briefing
from test_expanded_selection import expanded, extra_search


def approved():
    data = expanded()
    data.update(date='2026-11-03', cutoff_at='2026-11-03T09:30:00+09:00',
                window_start='2026-11-02T09:30:00+09:00', created_at='2026-11-03T09:40:00+09:00')
    for article in data['articles']:
        article.update(collected_at='2026-11-03T08:00:00+09:00',
                       original_published_at='2026-11-03T07:00:00+09:00',
                       event_first_published_at='2026-11-03T07:00:00+09:00',
                       importance=['기존 시험 단계를 넘어 상용 고객 확대의 산업적 의미'])
        for source in article['sources']:
            source.update(published_at='2026-11-03T07:00:00+09:00', verified_at='2026-11-03T09:35:00+09:00')
    data['summary_groups'] = [dict(article_numbers=[n], bullets=['확인된 신규 사실과 수치 요약', '별도의 핵심 변화와 산업적 의미']) for n in range(1, 7)]
    data['selection_audit']['history_review'].update(start_date='2026-10-20', end_date='2026-11-02', checked_dates=['2026-11-02'])
    extra_search(data)
    return data


class ApprovedStructureTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        history = self.root / 'briefings' / 'ready'
        history.mkdir(parents=True)
        old = reviewed_briefing()
        for article in old['articles']:
            article['title'] = 'Historical ' + article['title']
            article['original_url'] += '/old'
            article['sources'][0]['url'] += '/old'
        (history / '2026-11-02.json').write_text(json.dumps(old))
        mail = self.root / 'mail'
        mail.mkdir()
        (mail / 'templates').symlink_to(renderer.ROOT / 'templates', target_is_directory=True)
        self.addCleanup(patch.stopall)
        patch.object(renderer, 'ROOT', mail).start()

    def test_new_content_present_in_email_pdf_source_and_plain_text(self):
        data = approved()
        html = renderer.render_html(data)
        text = renderer.render_text(data)
        self.assertEqual(html.count('class="summary-copy"'), 12)
        self.assertEqual(html.count('importance-pad'), 6)
        self.assertEqual(text.count('\n중요성\n'), 6)
        self.assertLess(text.index('주요 내용'), text.index('중요성'))
        self.assertLess(text.index('중요성'), text.index('\n시사점\n'))
        self.assertIn('src="cid:nipa-logo"', html)

    def test_new_edition_rejects_missing_importance_and_grouped_summaries(self):
        data = approved()
        data['articles'][0].pop('importance')
        with self.assertRaisesRegex(ValueError, 'importance'):
            renderer.validate_briefing(data)
        data = approved()
        data['summary_groups'][0]['article_numbers'] = [1, 2]
        del data['summary_groups'][1]
        with self.assertRaisesRegex(ValueError, 'one article per group'):
            renderer.validate_briefing(data)
        data = approved()
        data['summary_groups'][0]['bullets'] = ['요약 한 항목']
        with self.assertRaisesRegex(ValueError, 'bullets'):
            renderer.validate_briefing(data)

    def test_legacy_edition_does_not_gain_empty_importance(self):
        data = sample_briefing()
        self.assertNotIn('importance-pad', renderer.render_html(data))
        self.assertNotIn('\n중요성\n', renderer.render_text(data))
        self.assertEqual(renderer.APPROVED_STRUCTURE_FROM, date(2026, 11, 3))
