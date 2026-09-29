#!/usr/bin/env python3
"""Independent read-only delivery watchdog; never sends or resets a claim."""
from datetime import datetime
import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent

def inspect(root=ROOT, now=None):
    current = (now or datetime.now(ZoneInfo('Asia/Seoul'))).astimezone(ZoneInfo('Asia/Seoul'))
    day = current.date().isoformat()
    if (current.hour, current.minute) < (10, 25):
        return {'date': day, 'status': 'before_watch_window', 'ok': True}
    path = root / 'briefings' / 'state' / (day + '.json')
    try:
        state = json.loads(path.read_text()) if path.is_file() else None
    except (ValueError, OSError):
        return {'date': day, 'status': 'state_invalid', 'ok': False}
    if state:
        if state.get('date') != day:
            return {'date': day, 'status': 'state_date_mismatch', 'ok': False}
        if state.get('status') == 'sent' and state.get('verified_at') and state.get('evidence'):
            return {'date': day, 'status': 'sent_verified_record', 'ok': True}
        if state.get('status') in ('sending', 'uncertain'):
            return {'date': day, 'status': 'delivery_needs_reconciliation', 'ok': False}
    if not (root / 'briefings' / 'ready' / (day + '.json')).is_file():
        status = 'manuscript_missing'
    elif not (root / 'briefings' / 'rendered' / (day + '.json')).is_file():
        status = 'rendered_bundle_missing'
    else:
        status = 'gmail_delivery_unconfirmed'
    return {'date': day, 'status': status, 'ok': False}

if __name__ == '__main__':
    result = inspect()
    print(json.dumps(result))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as f:
            f.write('## Daily Desk independent delivery watch\n')
            f.write(f"Edition: {result['date']}\n\nStatus: **{result['status']}**\n")
            if not result['ok']:
                f.write('\nGmail delivery is not confirmed. ChatGPT sender catch-up must reconcile Sent mail. This job never sends mail or resets a sending/uncertain state.\n')
    if not result['ok']:
        print('::error title=Daily Desk delivery unconfirmed::' + result['status'])
        raise SystemExit(1)
