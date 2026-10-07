#!/usr/bin/env python3
"""Read-only candidate packet: full archives, time windows, collection health, history.

Outputs metadata and previous briefing summaries, never a ready edition or mail.
No network calls or paid AI APIs. Run after updating the checkout from main.
"""
import argparse
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import json
from pathlib import Path
import re
from render import cutoff_for_date, PUBLICATION_CUTOFF_FROM

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))


def stamp(value):
    if not value:
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        try:
            result = parsedate_to_datetime(value)
        except (ValueError, TypeError):
            return None
    return result if result.tzinfo else None


def archive_articles(root, month):
    folder = root / 'docs/data/archive'
    path = folder / f'{month}.json'
    if path.exists():
        return json.loads(path.read_text())['articles']
    index_path = folder / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    entry = next((m for m in index.get('months', []) if m.get('month') == month), {})
    parts = entry.get('parts', [])
    if not parts or any(not (folder / part).is_file() for part in parts):
        raise ValueError(f'MISSING_ARCHIVE_MONTH_OR_PART:{month}')
    return [a for part in parts for a in json.loads((folder / part).read_text())['articles']]


def packet(day, root=ROOT, as_of=None):
    cutoff = cutoff_for_date(date.fromisoformat(day))
    observed = as_of or datetime.now(KST)
    if observed.tzinfo is None:
        raise ValueError('as_of must include timezone')
    recovery = cutoff.date() >= PUBLICATION_CUTOFF_FROM
    discovery_end = min(observed, cutoff.replace(hour=23, minute=59, second=59, microsecond=999999)) if recovery else cutoff
    oldest = cutoff - timedelta(hours=48)
    months = sorted({cutoff.strftime('%Y-%m'), (cutoff - timedelta(hours=72)).strftime('%Y-%m')})
    candidates, excluded, input_count = [], [], 0
    for month in months:
        for article in archive_articles(root, month):
            collected = stamp(article.get('firstSeenAt'))
            published = stamp(article.get('publishedAt'))
            if not collected or not cutoff - timedelta(hours=72) < collected <= discovery_end:
                continue
            input_count += 1
            if not published or not oldest < published <= cutoff:
                excluded.append({'title': article.get('title'), 'url': article.get('link'),
                                 'reason': 'publication_unknown' if not published else 'outside_48h'})
                continue
            candidates.append({**article,
                               'selection_tier': 'primary' if published > cutoff - timedelta(hours=24) else 'supplement',
                               'publication_time_iso': published.isoformat(),
                               'collection_status': 'late_requires_cutoff_evidence' if collected > cutoff else 'pre_cutoff'})
    candidates.sort(key=lambda a: (a['selection_tier'] != 'primary', -stamp(a['publication_time_iso']).timestamp()))
    history, checked_dates = [], []
    for offset in range(14, 0, -1):
        historical_day = (cutoff.date() - timedelta(days=offset)).isoformat()
        path = root / 'briefings/ready' / f'{historical_day}.json'
        if not path.exists():
            continue
        edition = json.loads(path.read_text())
        checked_dates.append(historical_day)
        for article in edition['articles']:
            history.append({'date': historical_day, 'number': article['number'], 'title': article['title'],
                            'event_id': article.get('event_id'), 'main_points': article['main_points'],
                            'urls': list({article.get('original_url', ''), *[s['url'] for s in article['sources']]} - {''})})
    normalize = lambda value: re.sub(r'[^\w]', '', value.lower())
    for candidate in candidates:
        candidate['exact_history_matches'] = [
            {'date': h['date'], 'number': h['number'], 'title': h['title']}
            for h in history if candidate.get('link') in h['urls'] or normalize(candidate['title']) == normalize(h['title'])]
    health = []
    for offset in (2, 1, 0):
        logday = (cutoff.date() - timedelta(days=offset)).isoformat()
        path = root / 'docs/data/collection' / f'{logday}.json'
        if path.exists():
            health.extend(r for r in json.loads(path.read_text())['runs'] if stamp(r.get('collected_at')) and oldest < stamp(r['collected_at']) <= discovery_end)
    morning = [r for r in health if cutoff.replace(hour=9, minute=20) <= stamp(r['collected_at']) <= cutoff]
    return {'date': day, 'cutoff_at': cutoff.isoformat(), 'observed_at': observed.isoformat(),
            'morning_collection': {'pre_cutoff_run_recorded': bool(morning),
                                   'latest_collection_at': max((r['collected_at'] for r in health), key=stamp, default=None),
                                   'final_search_required': True,
                                   'note': 'Check per-source failures/empty results; a run timestamp alone does not prove completion or full coverage.'},
            'candidate_counts': {'discovered': input_count, 'time_eligible': len(candidates)},
            'candidates': candidates, 'time_excluded': excluded,
            'history_review': {'start_date': (cutoff.date() - timedelta(days=14)).isoformat(),
                               'end_date': (cutoff.date() - timedelta(days=1)).isoformat(),
                               'checked_dates': checked_dates},
            'previous_events': history, 'collection_health': health,
            'notes': ['Exact matches are hints only. Read all previous events for semantic duplicates.',
                      'Resolve event first-publication separately: a new roundup does not renew old events.',
                      'Complete independent_events/verified counts only after actual editorial review.',
                      'No health log means collection health is unknown, not zero errors.',
                      'Late discoveries require verified pre-cutoff facts; metadata eligibility is not publication approval.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--date', required=True)
    parser.add_argument('--as-of', help='Optional timezone-aware observation timestamp for reproducible reviews')
    args = parser.parse_args()
    observed = stamp(args.as_of) if args.as_of else None
    if args.as_of and observed is None:
        parser.error('--as-of requires a timestamp with timezone')
    print(json.dumps(packet(args.date, as_of=observed), ensure_ascii=False, indent=2))
