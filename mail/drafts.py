#!/usr/bin/env python3
"""Non-deliverable research checkpoints. No network, rendering, or mail calls.

GitHub writes are performed by the generator with the current blob SHA after
re-reading delivery state and ready. This module never writes a ready edition.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
AREAS = ('domestic_npu', 'domestic_policy_demand', 'global_accelerators',
         'operating_software', 'memory_packaging_infrastructure')
MAX_BYTES = 1_000_000
TOP_KEYS = {'draft_schema_version', 'status', 'deliverable', 'date', 'cutoff_at',
            'window_start', 'created_at', 'updated_at', 'requires_post_cutoff_review', 'research'}
RESEARCH_KEYS = {'candidates', 'partial_articles', 'partial_summary_groups',
                 'review_records', 'pending_checks'}
FORBIDDEN_KEYS = {'password', 'api_key', 'access_token', 'refresh_token', 'authorization',
                  'recipient', 'recipients', 'from_address', 'email', 'cc', 'bcc',
                  'raw_mime', 'payload', 'html_body', 'body_file', 'attachment_files',
                  'raw_body', 'full_body', 'original_full_text'}
EMAIL = re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', re.I)
SECRET = re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b')


class DraftError(ValueError):
    """Fixed error codes; never echo the checkpoint or personal information."""


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if 'T' not in value or parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError()
        return parsed
    except (ValueError, AttributeError, TypeError):
        raise DraftError('DRAFT_TIMESTAMP_INVALID') from None


def edition_date(value):
    try:
        day = date.fromisoformat(value)
        if day.isoformat() != value:
            raise ValueError()
        return day
    except (ValueError, TypeError):
        raise DraftError('DRAFT_DATE_INVALID') from None


def cutoff(day):
    day = edition_date(day)
    return datetime(day.year, day.month, day.day, 9, 30 if day >= date(2026, 10, 7) else 0, tzinfo=KST)


def current_time(now=None):
    value = now if now is not None else datetime.now(KST)
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise DraftError('DRAFT_TIMESTAMP_INVALID')
    return value.astimezone(KST)


def read_json(path):
    try:
        raw = path.read_bytes()
        if len(raw) > MAX_BYTES:
            raise DraftError('DRAFT_FILE_TOO_LARGE')
        def no_constant(_):
            raise ValueError()
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError()
                result[key] = value
            return result
        return json.loads(raw, parse_constant=no_constant, object_pairs_hook=unique), raw
    except (OSError, ValueError, UnicodeError) as exc:
        if isinstance(exc, DraftError):
            raise
        raise DraftError('DRAFT_FILE_UNREADABLE_OR_INVALID') from None


def check_public_data(value):
    try:
        encoded = json.dumps(value, ensure_ascii=False, allow_nan=False)
    except (ValueError, TypeError):
        raise DraftError('DRAFT_DATA_INVALID') from None
    if len(encoded.encode('utf-8')) > MAX_BYTES:
        raise DraftError('DRAFT_FILE_TOO_LARGE')
    if EMAIL.search(encoded) or SECRET.search(encoded):
        raise DraftError('DRAFT_SENSITIVE_DATA')
    def walk(item):
        if isinstance(item, dict):
            if any(not isinstance(k, str) or k.lower() in FORBIDDEN_KEYS for k in item):
                raise DraftError('DRAFT_FORBIDDEN_FIELD')
            for child in item.values():
                walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)
    walk(value)


def validate_draft(data, day, *, now=None):
    current = current_time(now)
    expected = cutoff(day)
    if not isinstance(data, dict) or set(data) != TOP_KEYS:
        raise DraftError('DRAFT_SCHEMA_INVALID')
    if (type(data['draft_schema_version']) is not int or data['draft_schema_version'] != 1
            or data['status'] != 'draft' or data['deliverable'] is not False
            or data['requires_post_cutoff_review'] is not True):
        raise DraftError('DRAFT_NOT_NONDELIVERABLE')
    if data['date'] != day:
        raise DraftError('DRAFT_DATE_MISMATCH')
    for key, instant in [('cutoff_at', expected), ('window_start', expected - timedelta(days=1))]:
        observed = timestamp(data[key])
        if observed != instant or observed.utcoffset() != timedelta(hours=9):
            raise DraftError('DRAFT_WINDOW_INVALID')
    created, updated = timestamp(data['created_at']), timestamp(data['updated_at'])
    if not created <= updated <= current:
        raise DraftError('DRAFT_TIME_ORDER_INVALID')
    if any(t.astimezone(KST).date() != expected.date() for t in (created, updated)):
        raise DraftError('DRAFT_DATE_MISMATCH')
    research = data['research']
    if not isinstance(research, dict) or set(research) != RESEARCH_KEYS:
        raise DraftError('DRAFT_RESEARCH_INVALID')
    if any(not isinstance(research[key], list) for key in RESEARCH_KEYS):
        raise DraftError('DRAFT_RESEARCH_INVALID')
    if any(not isinstance(v, str) or not v.strip() for v in research['pending_checks']):
        raise DraftError('DRAFT_PENDING_CHECK_INVALID')
    check_public_data(data)
    return data


def resume_context(day, root=ROOT, *, now=None):
    """Read state first; a ready file is a validation gate, not proof of completion."""
    current = current_time(now)
    deadline = cutoff(day)
    if current.date() != deadline.date():
        return {'action': 'historical_read_only', 'date': day, 'draft': None}
    state_path = Path(root) / 'briefings/state' / f'{day}.json'
    if state_path.exists():
        state, _ = read_json(state_path)
        if not isinstance(state, dict) or state.get('date') != day or not isinstance(state.get('status'), str):
            raise DraftError('DRAFT_STATE_INVALID')
        if state['status'] != 'safe_pre_send_failure':
            return {'action': 'blocked_delivery_state', 'date': day, 'draft': None}
    ready_path = Path(root) / 'briefings/ready' / f'{day}.json'
    if ready_path.exists():
        return {'action': 'validate_existing_ready_first', 'date': day, 'draft': None}
    path = Path(root) / 'briefings/drafts' / f'{day}.json'
    draft, blob_sha = None, None
    if path.exists():
        draft, raw = read_json(path)
        validate_draft(draft, day, now=current)
        blob_sha = hashlib.sha1(b'blob ' + str(len(raw)).encode('ascii') + b'\0' + raw).hexdigest()
    action = 'prepare_draft' if current < deadline else ('resume_after_cutoff' if draft else 'start_final_research')
    return {'action': action, 'date': day, 'cutoff_at': deadline.isoformat(),
            'draft_path': f'briefings/drafts/{day}.json', 'draft_blob_sha': blob_sha,
            'requires_post_cutoff_review': True, 'draft': draft}


def build_draft(day, research, *, existing=None, now=None):
    """Prepare a checkpoint; no claim that partial research is verified or complete."""
    current = current_time(now)
    deadline = cutoff(day)
    if current.date() != deadline.date():
        raise DraftError('DRAFT_DATE_NOT_TODAY')
    if existing is not None:
        validate_draft(existing, day, now=current)
    result = {'draft_schema_version': 1, 'status': 'draft', 'deliverable': False,
              'date': day, 'cutoff_at': deadline.isoformat(),
              'window_start': (deadline - timedelta(days=1)).isoformat(),
              'created_at': existing['created_at'] if existing else current.isoformat(),
              'updated_at': current.isoformat(), 'requires_post_cutoff_review': True,
              'research': deepcopy(research)}
    validate_draft(result, day, now=current)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('inspect', 'build', 'validate'))
    parser.add_argument('--date', required=True)
    parser.add_argument('--input', help='Research object for build; complete draft for validate')
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--as-of', help='Reproducible tests only; production must use the actual clock')
    args = parser.parse_args()
    try:
        now = timestamp(args.as_of) if args.as_of else current_time()
        context = resume_context(args.date, args.root, now=now)
        if args.command == 'inspect':
            output = context
        else:
            if not args.input:
                raise DraftError('DRAFT_INPUT_REQUIRED')
            data, _ = read_json(Path(args.input))
            if args.command == 'validate':
                validate_draft(data, args.date, now=now)
                output = {'status': 'draft_valid', 'date': args.date, 'deliverable': False}
            else:
                if context['action'] not in ('prepare_draft', 'resume_after_cutoff', 'start_final_research'):
                    raise DraftError('DRAFT_WRITE_BLOCKED')
                output = build_draft(args.date, data, existing=context['draft'], now=now)
        print(json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False))
        return 0
    except DraftError as exc:
        print(json.dumps({'status': 'error', 'code': str(exc)}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
