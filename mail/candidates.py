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
from render import cutoff_for_date

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


def packet(day, root=ROOT):
    cutoff = cutoff_for_date(date.fromisoformat(day))
    oldest = cutoff - timedelta(hours=48)
    months = sorted({cutoff.strftime('%Y-%m'), (cutoff - timedelta(hours=72)).strftime('%Y-%m')})
    candidates, excluded, input_count = [], [], 0
    for month in months:
        path = root / 'docs/data/archive' / f'{month}.json'
        if not path.exists():
            raise ValueError(f'MISSING_ARCHIVE_MONTH:{month}')
        for article in json.loads(path.read_text())['articles']:
            collected = stamp(article.get('firstSeenAt'))
            published = stamp(article.get('publishedAt'))
            # Only actual pre-cutoff discoveries. Post-cutoff findings stay tomorrow's candidates.
            if not collected or not cutoff - timedelta(hours=72) < collected <= cutoff:
                continue
            input_count += 1
            if not published or not oldest < published <= cutoff:
                excluded.append({'title': article.get('title'), 'url': article.get('link'),
                                 'reason': 'publication_unknown' if not published else 'outside_48h'})
                continue
            candidates.append({**article,
                               'selection_tier': 'primary' if published > cutoff - timedelta(hours=24) else 'supplement',
                               'publication_time_iso': published.isoformat()})
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
            health.extend(r for r in json.loads(path.read_text())['runs'] if oldest < stamp(r['collected_at']) <= cutoff)
    return {'date': day, 'cutoff_at': cutoff.isoformat(),
            'candidate_counts': {'discovered': input_count, 'time_eligible': len(candidates)},
            'candidates': candidates, 'time_excluded': excluded,
            'history_review': {'start_date': (cutoff.date() - timedelta(days=14)).isoformat(),
                               'end_date': (cutoff.date() - timedelta(days=1)).isoformat(),
                               'checked_dates': checked_dates},
            'previous_events': history, 'collection_health': health,
            'notes': ['Exact matches are hints only. Read all previous events for semantic duplicates.',
                      'Resolve event first-publication separately: a new roundup does not renew old events.',
                      'Complete independent_events/verified counts only after actual editorial review.',
                      'No health log means collection health is unknown, not zero errors.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--date', required=True)
    args = parser.parse_args()
    print(json.dumps(packet(args.date), ensure_ascii=False, indent=2))
