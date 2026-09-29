"""MIME handoff and publication boundaries; no real mail or network calls."""
import base64
from copy import deepcopy
from datetime import date, datetime
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

MAIL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MAIL))
import prepare
from test_render import sample_briefing


class MemoryRemote:
    def __init__(self, source, existing=None, state=None):
        self.source, self.existing, self.state = source, existing, state
        self.reads, self.writes = [], []
        self.on_read = None

    def read(self, path):
        self.reads.append(path)
        if self.on_read:
            self.on_read(self, path)
        kind = path.split('/')[1]
        value = {'ready': self.source, 'rendered': self.existing, 'state': self.state}[kind]
        return deepcopy(value), 'a' * 40 if value is not None else None

    def write_bundle(self, edition, bundle, sha):
        self.writes.append((edition, deepcopy(bundle), sha))


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.today = date(2026, 9, 29)
        self.now = datetime(2026, 9, 29, 9, 6, tzinfo=prepare.SEOUL)
        self.source = sample_briefing()
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.directory = Path(self.folder.name)
        self.files = {'html': self.directory / 'test.html', 'pdf': self.directory / 'test.pdf'}
        self.files['html'].write_text('<html><img src="cid:nipa-logo"><p>검증</p></html>', encoding='utf-8')
        self.files['pdf'].write_bytes(b'%PDF-1.7\n' + b'0' * 120 + b'\n%%EOF\n')
        self.bundle = prepare.build_bundle(self.source, self.today, self.files, now=self.now)

    def test_bundle_has_only_html_logo_and_exact_pdf(self):
        prepare.validate_bundle(self.bundle, self.today, now=self.now)
        payload = self.bundle['payload']
        self.assertEqual(payload['mime_type'], 'multipart/mixed')
        self.assertEqual(len(payload['parts']), 2)
        self.assertEqual(payload['parts'][0]['parts'][0]['charset'], 'utf-8')
        self.assertEqual(payload['parts'][0]['parts'][1]['content_id'], '<nipa-logo>')
        self.assertEqual(payload['parts'][1]['filename'], 'AI반도체_일일_브리핑_2026.09.29.pdf')
        self.assertEqual(self.bundle['source_sha256'], prepare.digest(prepare.canonical(self.source)))
        self.assertEqual(self.bundle['payload_sha256'], prepare.digest(prepare.canonical(payload)))
        self.assertEqual(self.bundle['pdf_bytes'], len(self.files['pdf'].read_bytes()))
        for field in ('sender', 'recipient', 'app_password'):
            self.assertNotIn(field, self.bundle)

    def test_wrong_date_cutoff_and_future_render_fail_closed(self):
        for key, value in [('date', '2026-09-28'), ('cutoff_at', '2026-09-29T09:10:00+09:00'),
                           ('cutoff_at', '2026-09-29T00:00:00+00:00'),
                           ('rendered_at', '2026-09-29T09:07:00+09:00'),
                           ('subject', 'Different subject'), ('schema_version', True)]:
            with self.subTest(key=key):
                bundle = deepcopy(self.bundle); bundle[key] = value
                with self.assertRaisesRegex(prepare.PrepareError, 'BUNDLE_INVALID'):
                    prepare.validate_bundle(bundle, self.today, now=self.now)

    def test_tampered_or_extra_attachment_is_rejected(self):
        variants = []
        bundle = deepcopy(self.bundle); bundle['payload']['parts'].append(deepcopy(bundle['payload']['parts'][1])); variants.append(bundle)
        bundle = deepcopy(self.bundle); bundle['payload']['parts'][1]['filename'] = 'briefing.md'; variants.append(bundle)
        bundle = deepcopy(self.bundle); bundle['payload']['parts'][0]['parts'][0]['body']['content'] += 'tampered'; variants.append(bundle)
        bundle = deepcopy(self.bundle); bundle['pdf_bytes'] += 1; variants.append(bundle)
        bundle = deepcopy(self.bundle); bundle['payload']['parts'][1]['body']['base64_url_content'] += '='; variants.append(bundle)
        bundle = deepcopy(self.bundle); bundle['payload']['parts'][0]['parts'][1]['body']['base64_url_content'] = prepare._encode(b'bad logo'); variants.append(bundle)
        for bundle in variants:
            with self.subTest(bundle_hash=bundle['pdf_bytes']), self.assertRaises(prepare.PrepareError):
                prepare.validate_bundle(bundle, self.today, now=self.now)

    def test_pdf_signature_and_eof_required_even_with_consistent_hashes(self):
        for invalid in [b'not a PDF' * 20, b'%PDF-1.7\n' + b'0' * 120, b'%PDF-1.7\n%%EOF']:
            self.files['pdf'].write_bytes(invalid)
            with self.assertRaisesRegex(prepare.PrepareError, 'BUNDLE_INVALID'):
                prepare.build_bundle(self.source, self.today, self.files, now=self.now)

    def test_readiness_starts_at_nine_not_nine_ten(self):
        self.assertEqual(prepare.generation_gate(self.today, now=self.now.replace(hour=8, minute=59)), 'too_early')
        self.assertIsNone(prepare.generation_gate(self.today, now=self.now.replace(minute=0)))
        with self.assertRaisesRegex(prepare.PrepareError, 'DATE_NOT_TODAY'):
            prepare.generation_gate(date(2026, 9, 28), now=self.now)
        with self.assertRaisesRegex(prepare.PrepareError, 'DATE_NOT_TODAY'):
            prepare.edition_date('2026-09-28', now=self.now)
        self.assertEqual(prepare.edition_date('2026-09-28', dry_run=True, now=self.now), date(2026, 9, 28))

    def test_source_date_filename_and_future_creation_checked(self):
        with self.assertRaisesRegex(prepare.PrepareError, 'BRIEFING_DATE_MISMATCH'):
            prepare.validate_source(self.source, date(2026, 9, 28), now=self.now)
        data = deepcopy(self.source); data['created_at'] = '2026-09-29T09:07:00+09:00'
        with self.assertRaisesRegex(prepare.PrepareError, 'BRIEFING_CREATED_IN_FUTURE'):
            prepare.validate_source(data, self.today, now=self.now)

    def test_same_content_skips_but_changed_renderer_or_source_does_not(self):
        self.assertTrue(prepare.matching_bundle(self.bundle, self.source, self.today, now=self.now))
        source = deepcopy(self.source); source['articles'][0]['title'] += ' changed'
        self.assertFalse(prepare.matching_bundle(self.bundle, source, self.today, now=self.now))
        with patch.object(prepare, 'renderer_hash', return_value='0' * 64):
            self.assertFalse(prepare.matching_bundle(self.bundle, self.source, self.today, now=self.now))

    def test_delivery_states_block_rendering_except_safe_pre_send_failure(self):
        for status in ('sending', 'sent', 'uncertain'):
            self.assertEqual(prepare.blocked_state({'date': '2026-09-29', 'status': status}, self.today), 'delivery_' + status)
        self.assertIsNone(prepare.blocked_state({'date': '2026-09-29', 'status': 'safe_pre_send_failure'}, self.today))
        with self.assertRaisesRegex(prepare.PrepareError, 'DELIVERY_STATE_INVALID'):
            prepare.blocked_state({'date': '2026-09-29', 'status': 'unknown'}, self.today)

    def test_local_preflight_no_render_or_network(self):
        ready = self.directory / 'briefings/ready/2026-09-29.json'
        ready.parent.mkdir(parents=True)
        ready.write_bytes(prepare.canonical(self.source))
        with patch.object(prepare, 'ROOT', self.directory), patch.object(prepare, 'now_kst', return_value=self.now), \
                patch.object(prepare, 'render_briefing') as render, patch.object(prepare, 'GitHubContents') as remote:
            self.assertEqual(prepare.run(['--preflight'])['status'], 'ready')
            ready.unlink()
            self.assertEqual(prepare.run(['--preflight'])['status'], 'not_ready')
            render.assert_not_called(); remote.assert_not_called()

    def test_local_terminal_state_skips_before_render_or_source_read(self):
        state = self.directory / 'briefings/state/2026-09-29.json'
        state.parent.mkdir(parents=True)
        state.write_text('{"date":"2026-09-29","status":"sent"}', encoding='utf-8')
        with patch.object(prepare, 'ROOT', self.directory), patch.object(prepare, 'now_kst', return_value=self.now), \
                patch.object(prepare, 'render_briefing') as render:
            self.assertEqual(prepare.run([])['status'], 'delivery_sent')
            render.assert_not_called()

    def test_publish_reads_authoritative_source_and_state_then_creates_cas(self):
        remote = MemoryRemote(self.source)
        with patch.object(prepare, 'now_kst', return_value=self.now):
            self.assertEqual(prepare.publish(self.bundle, self.today, remote), 'published')
        self.assertEqual(len(remote.writes), 1)
        self.assertIsNone(remote.writes[0][2])
        self.assertEqual(remote.reads[-2:], ['briefings/ready/2026-09-29.json', 'briefings/state/2026-09-29.json'])

    def test_publish_existing_same_content_is_skipped(self):
        remote = MemoryRemote(self.source, existing=self.bundle)
        with patch.object(prepare, 'now_kst', return_value=self.now):
            self.assertEqual(prepare.publish(self.bundle, self.today, remote), 'already_rendered')
        self.assertEqual(remote.writes, [])

    def test_publish_changed_source_during_render_or_final_read_is_rejected(self):
        for change_at in (1, 2):
            remote = MemoryRemote(self.source)
            def change(store, path):
                if path.startswith('briefings/ready/') and store.reads.count(path) == change_at:
                    store.source = deepcopy(store.source)
                    store.source['articles'][0]['title'] += ' changed'
            remote.on_read = change
            with patch.object(prepare, 'now_kst', return_value=self.now), self.assertRaisesRegex(prepare.PrepareError, 'SOURCE_CHANGED_RETRY'):
                prepare.publish(self.bundle, self.today, remote)
            self.assertEqual(remote.writes, [])

    def test_publish_sender_claim_during_render_or_final_read_is_respected(self):
        for change_at in (1, 2):
            for status in ('sending', 'sent', 'uncertain'):
                remote = MemoryRemote(self.source)
                def claim(store, path):
                    if path.startswith('briefings/state/') and store.reads.count(path) == change_at:
                        store.state = {'date': '2026-09-29', 'status': status}
                remote.on_read = claim
                with patch.object(prepare, 'now_kst', return_value=self.now):
                    self.assertEqual(prepare.publish(self.bundle, self.today, remote), 'delivery_' + status)
                self.assertEqual(remote.writes, [])

    def test_publish_replacement_carries_observed_sha_and_cas_conflict_stops(self):
        old = deepcopy(self.bundle); old['source_sha256'] = '0' * 64
        remote = MemoryRemote(self.source, existing=old)
        with patch.object(prepare, 'now_kst', return_value=self.now):
            self.assertEqual(prepare.publish(self.bundle, self.today, remote), 'published')
        self.assertEqual(remote.writes[0][2], 'a' * 40)
        remote = MemoryRemote(self.source, existing=old)
        remote.write_bundle = Mock(side_effect=prepare.PrepareError('PUBLISH_CONFLICT_RETRY'))
        with patch.object(prepare, 'now_kst', return_value=self.now), self.assertRaisesRegex(prepare.PrepareError, 'PUBLISH_CONFLICT_RETRY'):
            prepare.publish(self.bundle, self.today, remote)
        remote.write_bundle.assert_called_once()

    def test_midnight_crossing_blocks_publication(self):
        remote = MemoryRemote(self.source)
        with patch.object(prepare, 'now_kst', return_value=self.now.replace(day=30, hour=0)), \
                self.assertRaisesRegex(prepare.PrepareError, 'DATE_NOT_TODAY'):
            prepare.publish(self.bundle, self.today, remote)
        self.assertEqual(remote.writes, [])

    def test_github_contents_writes_only_rendered_path_with_cas(self):
        remote = prepare.GitHubContents({'GITHUB_TOKEN': 'test-secret', 'GITHUB_REPOSITORY': 'test/repo'})
        with patch.object(remote, '_request', return_value={'content': {'sha': 'b' * 40}}) as request:
            remote.write_bundle(self.today, self.bundle, 'a' * 40)
        method, path, payload = request.call_args.args
        self.assertEqual(method, 'PUT')
        self.assertEqual(path, '/contents/briefings/rendered/2026-09-29.json')
        self.assertEqual(payload['sha'], 'a' * 40)
        self.assertEqual(json.loads(base64.b64decode(payload['content'])), self.bundle)
        self.assertNotIn('test-secret', payload['content'])

    def test_github_large_bundle_blob_fallback_and_conflict_code(self):
        remote = prepare.GitHubContents({'GITHUB_TOKEN': 'test-secret', 'GITHUB_REPOSITORY': 'test/repo'})
        contents = {'sha': 'a' * 40, 'size': 1_200_000, 'encoding': 'none', 'content': ''}
        blob = {'encoding': 'base64', 'content': base64.b64encode(prepare.canonical(self.bundle)).decode()}
        with patch.object(remote, '_request', side_effect=[contents, blob]) as request:
            value, sha = remote.read('briefings/rendered/2026-09-29.json')
        self.assertEqual(value, self.bundle)
        self.assertEqual(request.call_args.args[1], '/git/blobs/' + 'a' * 40)
        with patch.object(prepare, 'urlopen', side_effect=HTTPError('https://example.com', 409, 'Conflict', {}, None)), \
                self.assertRaisesRegex(prepare.PrepareError, 'PUBLISH_CONFLICT_RETRY'):
            remote._request('PUT', '/contents/test', {})

    def test_atomic_local_write_publishes_complete_bundle_without_temporaries(self):
        path = self.directory / 'rendered/2026-09-29.json'
        prepare.atomic_write(path, self.bundle)
        self.assertEqual(json.loads(path.read_bytes()), self.bundle)
        self.assertEqual(list(path.parent.iterdir()), [path])


if __name__ == '__main__':
    unittest.main()
