"""Publication cutoff and missing-morning-collection regressions."""
from datetime import datetime, timedelta
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from test_render import renderer
from test_expanded_selection import expanded, extra_search
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import candidates


def edition():
    d=expanded()
    def shift(v):
        if isinstance(v,dict): return {k:shift(x) for k,x in v.items()}
        if isinstance(v,list): return [shift(x) for x in v]
        if isinstance(v,str) and v.startswith('2026-10-06T'):
            return (datetime.fromisoformat(v)+timedelta(days=2,minutes=30)).isoformat()
        return v
    d=shift(d)
    d.update(date='2026-10-08',window_start='2026-10-07T09:30:00+09:00',created_at='2026-10-08T10:40:00+09:00')
    d['selection_audit']['history_review'].update(start_date='2026-09-24',end_date='2026-10-07',checked_dates=['2026-10-07'])
    extra_search(d)
    return d


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        history=self.root/'history';history.mkdir()
        old=expanded()
        for a in old['articles']:
            a['title']='Old '+a['title'];a['event_id']='old-'+a['event_id'];a['original_url']+='/old'
            for source in a['sources']:source['url']+='/old'
        (history/'2026-10-07.json').write_text(json.dumps(old))
    def validate(self,d): renderer.validate_briefing(d,history_dir=self.root/'history')
    def late(self):
        d=edition();a=d['articles'][0]
        a.update(collected_at='2026-10-08T10:22:00+09:00',original_published_at='2026-10-08T09:00:00+09:00',event_first_published_at='2026-10-08T09:00:00+09:00')
        a['sources'][0].update(published_at='2026-10-08T09:00:00+09:00',verified_at='2026-10-08T10:30:00+09:00',available_before_cutoff=True,cutoff_evidence='Synthetic unchanged full text published at 09:00 KST; checked against the 09:01 official release https://example.com/release; no post-cutoff facts used.')
        return d
    def test_lisa_su_style_late_discovery_keeps_real_timestamp(self):
        d=self.late();self.validate(d)
        self.assertEqual(d['articles'][0]['collected_at'],'2026-10-08T10:22:00+09:00')
    def test_late_discovery_requires_evidence_and_ordered_times(self):
        for key,value in [('available_before_cutoff',False),('cutoff_evidence',''),('verified_at','2026-10-08T10:00:00+09:00')]:
            d=self.late();d['articles'][0]['sources'][0][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError): self.validate(d)
        d=self.late();d['articles'][0]['collected_at']='2026-10-08T10:41:00+09:00'
        with self.assertRaises(ValueError):self.validate(d)
        d=self.late();d['created_at']='2026-10-09T10:40:00+09:00';d['articles'][0]['collected_at']='2026-10-09T10:22:00+09:00'
        with self.assertRaises(ValueError):self.validate(d)
    def test_new_facts_after_cutoff_remain_rejected(self):
        for key in ['original_published_at','event_first_published_at']:
            d=self.late();d['articles'][0][key]='2026-10-08T09:30:01+09:00'
            with self.subTest(key=key),self.assertRaises(ValueError):self.validate(d)
        d=self.late();d['articles'][0]['sources'][0]['published_at']='2026-10-08T09:30:01+09:00'
        with self.assertRaises(ValueError):self.validate(d)
    def test_six_articles_still_require_final_search(self):
        d=edition();self.validate(d);del d['selection_audit']['additional_search']
        with self.assertRaisesRegex(ValueError,'additional_search'): self.validate(d)
        extra_search(d);d['selection_audit']['additional_search']['areas']['domestic_npu']['status']='failed'
        with self.assertRaises(ValueError):self.validate(d)
    def test_packet_recovers_late_reports_and_reports_morning_gap(self):
        folder=self.root/'docs/data/archive';folder.mkdir(parents=True)
        rows=[dict(title=name,link='https://example.com/'+name,publishedAt=pub,firstSeenAt=seen) for name,pub,seen in [
          ('late','2026-10-08T09:00:00+09:00','2026-10-08T10:22:00+09:00'),
          ('new_fact_after_cutoff','2026-10-08T09:31:00+09:00','2026-10-08T10:22:00+09:00'),
          ('future_discovery','2026-10-08T09:00:00+09:00','2026-10-08T11:00:00+09:00')]]
        (folder/'2026-10.json').write_text(json.dumps({'articles':rows}))
        p=candidates.packet('2026-10-08',self.root,datetime.fromisoformat('2026-10-08T10:40:00+09:00'))
        self.assertEqual([a['title'] for a in p['candidates']],['late'])
        self.assertEqual(p['candidates'][0]['collection_status'],'late_requires_cutoff_evidence')
        self.assertFalse(p['morning_collection']['pre_cutoff_run_recorded'])
        self.assertIsNone(p['morning_collection']['latest_collection_at'])
        # Every listed part must be read; a missing part is an error, not an empty archive.
        (folder/'2026-10.json').unlink()
        (folder/'index.json').write_text(json.dumps({'months':[{'month':'2026-10','parts':['p1.json','p2.json']}]}))
        (folder/'p1.json').write_text(json.dumps({'articles':rows[:1]}));(folder/'p2.json').write_text(json.dumps({'articles':rows[1:]}))
        self.assertEqual(len(candidates.archive_articles(self.root,'2026-10')),3)
        (folder/'p2.json').unlink()
        with self.assertRaises(ValueError):candidates.archive_articles(self.root,'2026-10')
