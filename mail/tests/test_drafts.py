"""Synthetic checkpoint tests; no network, production writes, rendering or email."""
from copy import deepcopy
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from drafts import (DraftError, KST, build_draft, resume_context, validate_draft, read_json)

DAY = '2026-10-12'
EARLY = datetime(2026, 10, 12, 9, 26, tzinfo=KST)
AFTER = datetime(2026, 10, 12, 9, 40, tzinfo=KST)


def research():
    return {'candidates': [{'title': '합성 후보', 'original_url': 'https://example.org/news',
                            'collected_at': '2026-10-12T09:25:00+09:00'}],
            'partial_articles': [], 'partial_summary_groups': [], 'review_records': [],
            'pending_checks': ['09:30 이후 다섯 영역 보완 검색 및 최신 이력 대조']}


class DraftTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.draft = build_draft(DAY, research(), now=EARLY)

    def write(self, kind, value, day=DAY):
        path = self.root / 'briefings' / kind / f'{day}.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
        return path

    def test_early_build_preserves_research_without_ready_status(self):
        self.assertEqual(self.draft['status'], 'draft')
        self.assertIs(self.draft['deliverable'], False)
        self.assertIs(self.draft['requires_post_cutoff_review'], True)
        self.assertEqual(self.draft['research'], research())
        self.assertEqual(self.draft['created_at'], EARLY.isoformat())
        self.assertNotIn('schema_version', self.draft)

    def test_early_inspection_loads_saved_checkpoint(self):
        self.write('drafts', self.draft)
        result = resume_context(DAY, self.root, now=EARLY)
        self.assertEqual(result['action'], 'prepare_draft')
        self.assertEqual(result['draft'], self.draft)

    def test_post_cutoff_resumes_without_automatic_promotion(self):
        self.write('drafts', self.draft)
        result = resume_context(DAY, self.root, now=AFTER)
        self.assertEqual(result['action'], 'resume_after_cutoff')
        self.assertEqual(result['draft']['research'], research())
        self.assertFalse((self.root / 'briefings/ready').exists())

    def test_exact_cutoff_allows_resume(self):
        self.write('drafts', self.draft)
        result = resume_context(DAY, self.root, now=AFTER.replace(minute=30))
        self.assertEqual(result['action'], 'resume_after_cutoff')

    def test_no_draft_is_not_no_candidates(self):
        self.assertEqual(resume_context(DAY, self.root, now=EARLY)['action'], 'prepare_draft')
        self.assertEqual(resume_context(DAY, self.root, now=AFTER)['action'], 'start_final_research')

    def test_previous_day_checkpoint_never_reused(self):
        self.write('drafts', self.draft)
        result = resume_context(DAY, self.root, now=AFTER + timedelta(days=1))
        self.assertEqual(result['action'], 'historical_read_only')
        self.assertIsNone(result['draft'])
        with self.assertRaisesRegex(DraftError, 'DATE_NOT_TODAY'):
            build_draft(DAY, research(), now=AFTER + timedelta(days=1))

    def test_delivery_states_block_before_draft_read(self):
        for status in ('sending', 'sent', 'uncertain', 'unknown_state'):
            self.write('state', {'date': DAY, 'status': status})
            path = self.write('drafts', {})
            path.write_text('{broken')
            self.assertEqual(resume_context(DAY, self.root, now=AFTER)['action'], 'blocked_delivery_state')

    def test_safe_pre_send_failure_can_resume(self):
        self.write('state', {'date': DAY, 'status': 'safe_pre_send_failure'})
        self.write('drafts', self.draft)
        self.assertEqual(resume_context(DAY, self.root, now=AFTER)['action'], 'resume_after_cutoff')

    def test_ready_presence_requires_validation_not_rewrite(self):
        self.write('drafts', self.draft)
        self.write('ready', {'status': 'ready'})
        result = resume_context(DAY, self.root, now=AFTER)
        self.assertEqual(result['action'], 'validate_existing_ready_first')
        self.assertIsNone(result['draft'])

    def test_state_mismatch_fails_closed(self):
        self.write('state', {'date': '2026-10-11', 'status': 'safe_pre_send_failure'})
        with self.assertRaisesRegex(DraftError, 'STATE_INVALID'):
            resume_context(DAY, self.root, now=AFTER)

    def test_malformed_checkpoint_is_error_not_absence(self):
        path = self.write('drafts', self.draft)
        path.write_text('{broken')
        with self.assertRaisesRegex(DraftError, 'UNREADABLE_OR_INVALID'):
            resume_context(DAY, self.root, now=AFTER)

    def test_content_sha_matches_git_blob_for_cas(self):
        path = self.write('drafts', self.draft)
        raw = path.read_bytes()
        expected = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        self.assertEqual(resume_context(DAY, self.root, now=AFTER)['draft_blob_sha'], expected)

    def test_update_preserves_creation_and_actual_collection_time(self):
        updated = build_draft(DAY, research(), existing=self.draft, now=AFTER)
        self.assertEqual(updated['created_at'], self.draft['created_at'])
        self.assertEqual(updated['updated_at'], AFTER.isoformat())
        self.assertEqual(updated['research']['candidates'][0]['collected_at'], research()['candidates'][0]['collected_at'])

    def test_wrong_status_or_deliverable_is_rejected(self):
        for key, value in [('status', 'ready'), ('deliverable', True), ('requires_post_cutoff_review', False),
                           ('draft_schema_version', True)]:
            bad = deepcopy(self.draft)
            bad[key] = value
            with self.assertRaises(DraftError):
                validate_draft(bad, DAY, now=AFTER)

    def test_cutoff_and_window_cannot_move(self):
        for key in ('cutoff_at', 'window_start'):
            bad = deepcopy(self.draft)
            bad[key] = '2026-10-12T09:40:00+09:00'
            with self.assertRaisesRegex(DraftError, 'WINDOW_INVALID'):
                validate_draft(bad, DAY, now=AFTER)

    def test_future_and_naive_timestamps_rejected(self):
        for value in ('2026-10-12T12:00:00+09:00', '2026-10-12T09:26:00'):
            bad = deepcopy(self.draft)
            bad['updated_at'] = value
            with self.assertRaises(DraftError):
                validate_draft(bad, DAY, now=AFTER)

    def test_sensitive_content_rejected(self):
        for value in ('someone@example.org', 'ghp_' + 'a' * 36):
            bad = research()
            bad['pending_checks'] = [value]
            with self.assertRaisesRegex(DraftError, 'SENSITIVE_DATA'):
                build_draft(DAY, bad, now=EARLY)

    def test_payload_and_raw_full_text_fields_rejected(self):
        for key in ('payload', 'original_full_text', 'api_key'):
            bad = research()
            bad['candidates'] = [{key: 'not permitted'}]
            with self.assertRaisesRegex(DraftError, 'FORBIDDEN_FIELD'):
                build_draft(DAY, bad, now=EARLY)

    def test_duplicate_keys_and_nan_rejected(self):
        path = self.root / 'input.json'
        for text in ('{"status":"draft","status":"ready"}', '{"n":NaN}'):
            path.write_text(text)
            with self.assertRaises(DraftError):
                read_json(path)

    def test_empty_research_can_record_unfinished_work_truthfully(self):
        value = {key: [] for key in research()}
        value['pending_checks'] = ['수집 기록 조회 미완료']
        built = build_draft(DAY, value, now=EARLY)
        self.assertEqual(built['research']['partial_articles'], [])

    def test_build_does_not_mutate_caller(self):
        value = research()
        result = build_draft(DAY, value, now=EARLY)
        result['research']['candidates'].clear()
        self.assertEqual(len(value['candidates']), 1)

    def test_cli_validation_does_not_write_any_repo_file(self):
        path = self.write('drafts', self.draft)
        before = {str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        run = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / 'drafts.py'),
                              'validate', '--date', DAY, '--root', str(self.root),
                              '--input', str(path), '--as-of', AFTER.isoformat()], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)['status'], 'draft_valid')
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_cli_build_is_blocked_by_ready_or_delivery_state(self):
        path = self.root / 'research.json'
        path.write_text(json.dumps(research()))
        self.write('ready', {'status': 'ready'})
        run = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / 'drafts.py'),
                              'build', '--date', DAY, '--root', str(self.root),
                              '--input', str(path), '--as-of', AFTER.isoformat()], capture_output=True, text=True)
        self.assertEqual(run.returncode, 2)
        self.assertIn('DRAFT_WRITE_BLOCKED', run.stderr)
        self.assertEqual(run.stdout, '')


if __name__ == '__main__':
    unittest.main()
