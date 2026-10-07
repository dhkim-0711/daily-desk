"""09:30 migration boundaries, persisted cutoff, and historical compatibility."""
from copy import deepcopy
from datetime import date, datetime
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import candidates
import prepare
import check_delivery
from test_expanded_selection import expanded
from test_render import renderer, sample_briefing


def new_edition():
    d = expanded()
    d.update(date='2026-10-07', cutoff_at='2026-10-07T09:30:00+09:00',
             window_start='2026-10-06T09:30:00+09:00', created_at='2026-10-07T09:40:00+09:00')
    for a in d['articles']:
        a.update(collected_at='2026-10-07T09:25:00+09:00', original_published_at='2026-10-07T09:15:00+09:00',
                 event_first_published_at='2026-10-07T09:15:00+09:00')
        for s in a['sources']:
            s.update(published_at='2026-10-07T09:15:00+09:00', verified_at='2026-10-07T09:35:00+09:00')
    d['selection_audit']['history_review'].update(start_date='2026-09-23', end_date='2026-10-06', checked_dates=['2026-10-06'])
    return d


class TimingTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        history=self.root/"history";history.mkdir()
        old=sample_briefing()
        for a in old["articles"]:
            a["title"]="Old "+a["title"];a["original_url"]=a["original_url"]+"/old"
            for source in a["sources"]: source["url"]+="/old"
        (history/"2026-10-06.json").write_text(json.dumps(old))
    def validate(self,d): renderer.validate_briefing(d,history_dir=self.root/'history')

    def test_migration_accepts_new_window_and_keeps_historical_cutoff(self):
        self.validate(new_edition())
        renderer.validate_briefing(sample_briefing())
        for field,value in [('cutoff_at','2026-10-07T09:00:00+09:00'),
                            ('window_start','2026-10-06T09:00:00+09:00'),
                            ('created_at','2026-10-07T09:29:59+09:00')]:
            d=new_edition();d[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):self.validate(d)
        self.assertEqual(renderer.cutoff_for_date(date(2026,10,6)).minute,0)

    def test_actual_collection_and_publication_stop_at_0930(self):
        d=new_edition(); d['articles'][0]['collected_at']='2026-10-07T09:30:00+09:00'; self.validate(d)
        d['articles'][0]['collected_at']='2026-10-07T09:30:01+09:00'
        d['articles'][0]['sources'][0].pop('cutoff_evidence',None)
        with self.assertRaises(ValueError): self.validate(d)
        d=new_edition();d['articles'][0]['event_first_published_at']='2026-10-07T09:30:01+09:00'
        with self.assertRaises(ValueError):self.validate(d)

    def test_candidate_packet_includes_new_half_hour_and_flags_late_discoveries(self):
        folder=self.root/'docs/data/archive';folder.mkdir(parents=True)
        articles=[dict(title=name,link='https://example.com/'+name,publishedAt='2026-10-07T09:10:00+09:00',firstSeenAt=stamp)
                  for name,stamp in [('included','2026-10-07T09:29:59+09:00'),('late','2026-10-07T09:30:01+09:00')]]
        (folder/'2026-10.json').write_text(json.dumps({'articles':articles}))
        packet=candidates.packet('2026-10-07',self.root,datetime.fromisoformat('2026-10-07T09:40:00+09:00'))
        self.assertEqual(packet['cutoff_at'],'2026-10-07T09:30:00+09:00')
        self.assertEqual([a['title'] for a in packet['candidates']],['included','late'])

    def test_generation_gate_and_html_pdf_handoff_share_cutoff(self):
        edition=date(2026,10,7)
        self.assertEqual(prepare.generation_gate(edition,now=datetime.fromisoformat('2026-10-07T09:29:59+09:00')),'too_early')
        self.assertIsNone(prepare.generation_gate(edition,now=datetime.fromisoformat('2026-10-07T09:30:00+09:00')))
        d=new_edition()
        original=renderer.validate_briefing
        with patch.object(renderer,'validate_briefing',side_effect=lambda data: original(data,history_dir=self.root/'history')):
            html=renderer.render_html(d)
        self.assertIn('2026.10.07 · 09:30 기준',html)
        self.assertNotIn('· 09:00 기준',html)
        files={'html':self.root/'test.html','pdf':self.root/'test.pdf'}
        files['html'].write_text(html);files['pdf'].write_bytes(b'%PDF-1.7\n'+b'0'*120+b'\n%%EOF\n')
        now=datetime.fromisoformat('2026-10-07T09:45:00+09:00')
        with patch.object(prepare,'validate_briefing',side_effect=self.validate):
            bundle=prepare.build_bundle(d,edition,files,now=now)
        prepare.validate_bundle(bundle,edition,now=now)
        bundle['cutoff_at']='2026-10-07T09:00:00+09:00'
        with self.assertRaises(prepare.PrepareError):prepare.validate_bundle(bundle,edition,now=now)

    def test_watchdog_waits_until_after_first_catchup(self):
        self.assertTrue(check_delivery.inspect(self.root,datetime.fromisoformat('2026-10-07T11:04:59+09:00'))['ok'])
        self.assertEqual(check_delivery.inspect(self.root,datetime.fromisoformat('2026-10-07T11:05:00+09:00'))['status'],'manuscript_missing')
