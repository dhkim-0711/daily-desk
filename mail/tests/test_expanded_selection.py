"""Regression checks for the newly authorized time/history/shortfall policy."""
from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from test_render import renderer, reviewed_briefing


def expanded(count=6):
    data = reviewed_briefing(count)
    data.update(date='2026-10-06', cutoff_at='2026-10-06T09:00:00+09:00',
                window_start='2026-10-05T09:00:00+09:00', created_at='2026-10-06T09:10:00+09:00')
    for a in data['articles']:
        a.update(collected_at='2026-10-06T08:00:00+09:00', original_published_at='2026-10-06T07:00:00+09:00',
                 event_id=f'unique-event-{a["number"]}', event_first_published_at='2026-10-06T07:00:00+09:00',
                 event_evidence_url=a['sources'][0]['url'], selection_tier='primary')
        for source in a['sources']:
            source.update(published_at='2026-10-06T07:00:00+09:00', verified_at='2026-10-06T09:05:00+09:00')
    audit = data['selection_audit']
    audit.update(candidate_counts=dict(discovered=30, time_eligible=20, independent_events=10, verified=count, selected=count, basis='Synthetic archive'),
                 history_review=dict(start_date='2026-09-22', end_date='2026-10-05', checked_dates=['2026-10-05'], note='Read previous edition'),
                 event_reviews=[dict(article_number=i, result='new_event', previous_editions=[], note='Distinct new contract') for i in range(1, count+1)])
    return data


def extra_search(data):
    data['selection_audit']['additional_search'] = dict(completed=True, alternative_sources='No blocked source after public primary checks',
        areas={k: dict(status='reviewed', queries='Actual synthetic query', official_sources='https://example.com/newsroom', result='No additional independent events')
               for k in renderer.SELECTION_COVERAGE_AREAS})


class ExpandedSelectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.history = Path(self.temp.name)
        self.old = reviewed_briefing(4)
        for a in self.old['articles']:
            a.update(title='Historical '+a['title'], original_url=a['original_url']+'/old')
            a['sources'][0]['url'] += '/old'
        (self.history/'2026-10-05.json').write_text(json.dumps(self.old))

    def tearDown(self): self.temp.cleanup()
    def validate(self, d): renderer.validate_briefing(d, history_dir=self.history)

    def test_six_new_events_pass_and_missing_history_fails(self):
        d=expanded(); self.validate(d)
        d['selection_audit']['history_review']['checked_dates']=['2026-10-04']
        with self.assertRaisesRegex(ValueError, 'checked dates'): self.validate(d)

    def test_shortfall_requires_completed_search_not_access_failure(self):
        d=expanded(4)
        with self.assertRaisesRegex(ValueError, 'additional_search'): self.validate(d)
        extra_search(d); self.validate(d)
        d['selection_audit']['additional_search']['areas']['operating_software']['status']='access_failed'
        with self.assertRaisesRegex(ValueError, 'additional_search'): self.validate(d)

    def test_48h_supplement_and_real_collection_are_independent(self):
        d=expanded(); a=d['articles'][0]
        a.update(event_first_published_at='2026-10-04T10:00:00+09:00', original_published_at='2026-10-04T10:00:00+09:00',
                 collected_at='2026-10-04T11:00:00+09:00', selection_tier='supplement')
        extra_search(d); self.validate(d)
        for field, bad in [('event_first_published_at','2026-10-04T09:00:00+09:00'),
                           ('collected_at','2026-10-06T09:00:01+09:00')]:
            invalid=deepcopy(d);invalid['articles'][0][field]=bad
            with self.assertRaises(ValueError):self.validate(invalid)

    def test_repeated_event_and_known_prior_source_require_new_facts(self):
        d=expanded(); d['articles'][0]['sources'][0]['url']=self.old['articles'][0]['sources'][0]['url']
        d['articles'][0]['event_evidence_url']=d['articles'][0]['sources'][0]['url']
        with self.assertRaisesRegex(ValueError, 'previous edition'):self.validate(d)
        row=d['selection_audit']['event_reviews'][0]
        row.update(result='material_update',previous_editions=['2026-10-05'],new_fact='New confirmed production milestone',evidence_url=d['articles'][0]['sources'][0]['url'])
        self.validate(d)
        d['articles'][1]['event_id']=d['articles'][0]['event_id']
        with self.assertRaisesRegex(ValueError,'event_id'):self.validate(d)

    def test_old_supporting_source_cannot_be_relabelled_as_a_new_event(self):
        d=expanded();d['articles'][0]['sources'][0]['published_at']='2026-09-22'
        with self.assertRaisesRegex(ValueError,'old supporting source'):self.validate(d)

    def test_candidate_funnel_counts_cannot_claim_unverified_selections(self):
        d=expanded();d['selection_audit']['candidate_counts']['verified']=5
        with self.assertRaisesRegex(ValueError,'candidate_counts'):self.validate(d)
