#!/usr/bin/env python3
"""Deliver a validated, same-day Daily Desk edition once, with durable evidence.

SMTP acceptance is not treated as proof of a Sent-mail copy. An interrupted or
ambiguous attempt is reconciled using Gmail IMAP and is never blindly retried.
Only the three fields in DAILY_DESK_MAIL_CONFIG contain mail credentials or
addresses; none is written to logs or the public delivery-state record.
"""
from __future__ import annotations

import argparse
import base64
import contextlib
from datetime import date, datetime, time
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import format_datetime, getaddresses
import hashlib
import imaplib
import json
import os
from pathlib import Path
import re
import smtplib
import ssl
import sys
import tempfile
import time as clock
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent.parent
SEOUL = ZoneInfo("Asia/Seoul")
TIMEOUT = 25
ADDRESS = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


class DeliveryError(Exception):
    """A fixed code safe to print; never wrap network exception messages."""

    def __init__(self, code: str, exit_code: int = 2):
        self.code, self.exit_code = code, exit_code
        super().__init__(code)


def now_kst() -> datetime:
    return datetime.now(SEOUL)


def stamp() -> str:
    return now_kst().isoformat(timespec="seconds")


def canonical(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def read_config(environ: Any = None) -> dict[str, str]:
    env = os.environ if environ is None else environ
    try:
        cfg = json.loads(env["DAILY_DESK_MAIL_CONFIG"])
        if not isinstance(cfg, dict) or set(cfg) != {"sender", "recipient", "app_password"}:
            raise ValueError()
        if not all(isinstance(cfg[k], str) for k in cfg):
            raise ValueError()
        if any(not ADDRESS.fullmatch(cfg[k]) for k in ("sender", "recipient")):
            raise ValueError()
        if not cfg["app_password"].strip() or any(c in cfg["app_password"] for c in "\r\n\x00"):
            raise ValueError()
        return cfg
    except (KeyError, ValueError, TypeError):
        raise DeliveryError("MAIL_CONFIG_INVALID") from None


def edition_date(value: str | None, *, dry_run: bool = False, now: datetime | None = None) -> date:
    today = (now or now_kst()).astimezone(SEOUL).date()
    try:
        result = date.fromisoformat(value) if value else today
        if value and result.isoformat() != value:
            raise ValueError()
    except ValueError:
        raise DeliveryError("DATE_INVALID") from None
    if result != today and not dry_run:
        raise DeliveryError("DATE_NOT_TODAY")
    return result


def gate(edition: date, now: datetime | None = None) -> str | None:
    current = (now or now_kst()).astimezone(SEOUL)
    if edition != current.date():
        raise DeliveryError("DATE_NOT_TODAY")
    return "too_early" if current.time().replace(tzinfo=None) < (time(9, 50) if edition >= date(2026, 10, 7) else time(9, 10)) else None


def load_briefing(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        if path.stat().st_size > 2_000_000:
            raise ValueError()
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (OSError, ValueError):
        raise DeliveryError("BRIEFING_INVALID") from None


class GitHubState:
    """Contents API compare-and-swap writes; a failed write prevents SMTP."""

    def __init__(self, edition: date, environ: Any = None):
        env = os.environ if environ is None else environ
        self.token = env.get("GITHUB_TOKEN", "")
        repo = env.get("GITHUB_REPOSITORY", "")
        self.branch = env.get("GITHUB_REF_NAME", "main")
        if not self.token or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
            raise DeliveryError("STATE_CONFIG_INVALID")
        self.url = f"https://api.github.com/repos/{repo}/contents/briefings/state/{edition.isoformat()}.json"
        self.sha: str | None = None

    def _request(self, method: str, payload: Any = None) -> Any:
        url = self.url + ("?ref=" + quote(self.branch, safe="") if method == "GET" else "")
        req = Request(url, method=method, data=None if payload is None else canonical(payload), headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "daily-desk-delivery",
        })
        try:
            with urlopen(req, timeout=TIMEOUT) as response:
                return json.load(response)
        except HTTPError as exc:
            if method == "GET" and exc.code == 404:
                return None
            raise DeliveryError("STATE_WRITE_FAILED" if method == "PUT" else "STATE_READ_FAILED") from None
        except Exception:
            raise DeliveryError("STATE_WRITE_FAILED" if method == "PUT" else "STATE_READ_FAILED") from None

    def read(self) -> dict[str, Any] | None:
        result = self._request("GET")
        if result is None:
            self.sha = None
            return None
        try:
            self.sha = result["sha"]
            value = json.loads(base64.b64decode(result["content"]))
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except (KeyError, TypeError, ValueError):
            raise DeliveryError("STATE_INVALID") from None

    def write(self, value: dict[str, Any]) -> None:
        payload = {
            "message": f"Record Daily Desk delivery {value['date']} {value['status']} [skip ci]",
            "content": base64.b64encode(canonical(value) + b"\n").decode("ascii"),
            "branch": self.branch,
        }
        if self.sha:
            payload["sha"] = self.sha
        result = self._request("PUT", payload)
        try:
            self.sha = result["content"]["sha"]
        except (KeyError, TypeError):
            raise DeliveryError("STATE_WRITE_FAILED") from None


class GmailSent:
    def __init__(self, cfg: dict[str, str]):
        self.cfg = cfg
        self.conn: imaplib.IMAP4_SSL | None = None

    def __enter__(self) -> "GmailSent":
        try:
            self.conn = imaplib.IMAP4_SSL("imap.gmail.com", 993, ssl_context=ssl.create_default_context(), timeout=TIMEOUT)
            self.conn.login(self.cfg["sender"], self.cfg["app_password"])
            status, rows = self.conn.list()
            if status != "OK":
                raise ValueError()
            folder = None
            for row in rows or []:
                if isinstance(row, bytes) and re.search(rb"\\Sent(?:[ )])", row, re.I):
                    match = re.match(rb'^\([^)]*\)\s+(?:"[^"]*"|NIL)\s+(.+)$', row)
                    if match:
                        folder = match[1].decode("ascii")
                        break
            if not folder or self.conn.select(folder, readonly=True)[0] != "OK":
                raise ValueError()
            return self
        except Exception:
            self.__exit__(None, None, None)
            raise DeliveryError("GMAIL_READ_AUTH_FAILED") from None

    def __exit__(self, *args: Any) -> None:
        if self.conn:
            with contextlib.suppress(Exception):
                self.conn.logout()

    def _find(self, query: str, subject: str, message_id: str | None = None,
              exclude_message_id: str | None = None) -> bool:
        assert self.conn is not None
        # Bytes preserve UTF-8 Korean subjects; quoted escaping stays inside the
        # single X-GM-RAW query argument and never changes the IMAP command.
        literal = ('"' + query.replace("\\", "\\\\").replace('"', '\\"') + '"').encode("utf-8")
        try:
            status, rows = self.conn.uid("search", "CHARSET", "UTF-8", "X-GM-RAW", literal)
            if status != "OK" or not rows:
                raise ValueError()
            for uid in rows[0].split():
                status, parts = self.conn.uid("fetch", uid, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT TO FROM)])")
                if status != "OK":
                    raise ValueError()
                headers = next((part[1] for part in parts if isinstance(part, tuple)), None)
                if headers is None:
                    raise ValueError()
                msg = BytesParser(policy=policy.default).parsebytes(headers)
                if exclude_message_id and str(msg.get("Message-ID", "")).strip() == exclude_message_id:
                    continue
                recipients = {address.lower() for _, address in getaddresses(msg.get_all("To", []))}
                senders = {address.lower() for _, address in getaddresses(msg.get_all("From", []))}
                if (str(msg.get("Subject", "")) == subject
                        and self.cfg["recipient"].lower() in recipients
                        and self.cfg["sender"].lower() in senders
                        and (message_id is None or str(msg.get("Message-ID", "")).strip() == message_id)):
                    if message_id is not None:
                        status, body_parts = self.conn.uid("fetch", uid, "(BODY.PEEK[])")
                        if status != "OK":
                            raise ValueError()
                        raw = next((part[1] for part in body_parts if isinstance(part, tuple)), None)
                        if raw is None:
                            raise ValueError()
                        full_message = BytesParser(policy=policy.default).parsebytes(raw)
                        if not verified_mime(full_message, subject):
                            continue
                    return True
            return False
        except Exception:
            raise DeliveryError("GMAIL_SENT_CHECK_FAILED") from None

    def contains_id(self, message_id: str, subject: str) -> bool:
        return self._find("rfc822msgid:" + message_id.strip("<>"), subject, message_id)

    def contains_legacy(self, subject: str, exclude_message_id: str | None = None) -> bool:
        return self._find(f'to:{self.cfg["recipient"]} subject:"{subject}"', subject,
                          exclude_message_id=exclude_message_id)


def verified_mime(message: EmailMessage, subject: str) -> bool:
    """Confirm the Sent copy contains HTML plus exactly the expected PDF."""
    edition = re.search(r"\[(\d{4}\.\d{2}\.\d{2})\]$", subject)
    if not edition:
        return False
    attachments = [part for part in message.walk() if part.get_content_disposition() == "attachment"]
    if len(attachments) != 1:
        return False
    pdf = attachments[0]
    return (any(part.get_content_type() == "text/html" and part.get_payload(decode=True) for part in message.walk())
            and pdf.get_content_type() == "application/pdf"
            and pdf.get_filename() == f"AI반도체_일일_브리핑_{edition[1]}.pdf"
            and (pdf.get_payload(decode=True) or b"").startswith(b"%PDF-"))


def smtp_connect(cfg: dict[str, str]) -> smtplib.SMTP_SSL:
    conn = None
    try:
        conn = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=TIMEOUT, context=ssl.create_default_context())
        conn.login(cfg["sender"], cfg["app_password"])
        return conn
    except Exception:
        if conn:
            with contextlib.suppress(Exception):
                conn.close()
        raise DeliveryError("GMAIL_SEND_AUTH_FAILED") from None


def build_message(cfg: dict[str, str], edition: date, files: dict[str, Path], message_id: str) -> bytes:
    try:
        msg = EmailMessage(policy=policy.SMTP)
        msg["From"], msg["To"] = cfg["sender"], cfg["recipient"]
        msg["Subject"] = subject_for(edition)
        msg["Date"], msg["Message-ID"] = format_datetime(now_kst()), message_id
        msg.set_content(Path(files["text"]).read_text(encoding="utf-8"))
        msg.add_alternative(Path(files["html"]).read_text(encoding="utf-8"), subtype="html")
        logo = ROOT / "mail" / "assets" / "nipa-white.png"
        msg.get_payload()[-1].add_related(logo.read_bytes(), maintype="image", subtype="png", cid="<nipa-logo>", disposition="inline")
        msg.add_attachment(Path(files["pdf"]).read_bytes(), maintype="application", subtype="pdf", filename=f"AI반도체_일일_브리핑_{edition:%Y.%m.%d}.pdf")
        return msg.as_bytes()
    except Exception:
        raise DeliveryError("MESSAGE_BUILD_FAILED") from None


def subject_for(edition: date) -> str:
    return f"AI반도체 일일 브리핑[{edition:%Y.%m.%d}]"


def recipient_identity(cfg: dict[str, str], edition: date) -> tuple[str, str]:
    key = hashlib.sha256(cfg["recipient"].lower().encode()).hexdigest()
    return key, f"<daily-desk.{edition.isoformat()}.{key[:24]}@daily-desk.invalid>"


def local_sent_matches(cfg: dict[str, str], edition: date) -> bool:
    """A checked-out verified Sent record can skip expensive rendering.

    Any missing, corrupt, or conflicting record goes through the authoritative
    remote reconciliation path; the local optimization never hides a conflict.
    """
    try:
        path = ROOT / "briefings" / "state" / f"{edition.isoformat()}.json"
        state = json.loads(path.read_text(encoding="utf-8"))
        key, message_id = recipient_identity(cfg, edition)
        return (isinstance(state, dict) and state.get("status") == "sent"
                and state.get("date") == edition.isoformat()
                and state.get("recipient_key") == key
                and state.get("message_id") == message_id)
    except (OSError, ValueError):
        return False


def deliver(data: dict[str, Any], edition: date, files: dict[str, Path], cfg: dict[str, str], store: Any) -> str:
    # Recheck immediately before mail activity; a long render may cross midnight.
    if gate(edition):
        return "too_early"
    recipient_key, message_id = recipient_identity(cfg, edition)
    subject = subject_for(edition)
    state = store.read()
    if state is not None:
        if (state.get("date") != edition.isoformat() or state.get("recipient_key") != recipient_key
                or state.get("status") not in {"sending", "sent", "uncertain"}
                or state.get("message_id") != message_id):
            raise DeliveryError("STATE_CONFLICT")
        if state["status"] == "sent":
            return "already_sent"
    else:
        state = {"version": 1, "date": edition.isoformat(), "recipient_key": recipient_key,
                 "content_hash": hashlib.sha256(canonical(data)).hexdigest(), "message_id": message_id}

    with GmailSent(cfg) as sent:
        found_id = sent.contains_id(message_id, subject)
        found_legacy = False if found_id else sent.contains_legacy(subject, exclude_message_id=message_id)
        found = found_id or found_legacy
    if found:
        if found_legacy:
            # A previous manual edition has no trusted link to this artifact.
            # Record duplicate suppression without claiming its body hash.
            state["candidate_content_hash"] = state.get("content_hash")
            state["content_hash"] = None
        state.update(status="sent", updated_at=stamp(), verified_at=stamp(),
                     evidence="legacy_subject_match" if found_legacy else "gmail_sent")
        store.write(state)
        return "already_sent"
    if state.get("status") in {"sending", "uncertain"}:
        # Absence from an eventually consistent Sent index does not prove that
        # SMTP did not deliver. Keep the durable barrier for manual review.
        raise DeliveryError("DELIVERY_UNCERTAIN", 3)

    payload = build_message(cfg, edition, files, message_id)
    smtp = smtp_connect(cfg)
    try:
        if gate(edition):
            return "too_early"
        state.update(status="sending", updated_at=stamp(), attempted_at=stamp())
        store.write(state)  # MUST succeed before any SMTP send operation.
        try:
            refused = smtp.sendmail(cfg["sender"], [cfg["recipient"]], payload)
            if refused:
                raise ValueError()
        except Exception:
            state.update(status="uncertain", updated_at=stamp())
            with contextlib.suppress(DeliveryError):
                store.write(state)
            raise DeliveryError("DELIVERY_UNCERTAIN", 3) from None
    finally:
        with contextlib.suppress(Exception):
            smtp.quit()

    # Gmail may index its Sent copy briefly after SMTP acceptance.
    for delay in (0, 2, 4):
        if delay:
            clock.sleep(delay)
        try:
            with GmailSent(cfg) as sent:
                found = sent.contains_id(message_id, subject)
            if found:
                state.update(status="sent", updated_at=stamp(), verified_at=stamp(), evidence="gmail_sent")
                store.write(state)
                return "sent"
        except DeliveryError:
            continue
    state.update(status="uncertain", updated_at=stamp())
    with contextlib.suppress(DeliveryError):
        store.write(state)
    raise DeliveryError("DELIVERY_UNCERTAIN", 3)


def run(argv: list[str] | None = None) -> dict[str, Any]:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--preflight", action="store_true", help="Check gates, artifact, and configuration without network access")
    modes.add_argument("--check-config", action="store_true", help="Authenticate to Gmail without sending or writing state")
    modes.add_argument("--dry-run", action="store_true", help="Validate and render only, without network access or mail credentials")
    parser.add_argument("--date", help="YYYY-MM-DD; must be today except for dry runs")
    parser.add_argument("--output-dir", type=Path, help="Retain rendered output in this directory; normal sends otherwise use temporary files")
    args = parser.parse_args(argv)
    if args.check_config:
        cfg = read_config()
        with GmailSent(cfg):
            pass
        smtp = smtp_connect(cfg)
        with contextlib.suppress(Exception):
            smtp.quit()
        return {"status": "config_verified", "sent": False}

    edition = edition_date(args.date, dry_run=args.dry_run)
    base = {"date": edition.isoformat()}
    if not args.dry_run:
        blocked = gate(edition)
        if blocked:
            return {**base, "status": blocked}
    data = load_briefing(ROOT / "briefings" / "ready" / f"{edition.isoformat()}.json")
    if data is None:
        if args.dry_run:
            raise DeliveryError("BRIEFING_MISSING")
        return {**base, "status": "not_ready"}
    try:
        from render import render_briefing, validate_briefing
        validate_briefing(data)
    except Exception:
        raise DeliveryError("BRIEFING_INVALID") from None
    # The artifact's declared date must agree with its filename as well.
    if data.get("date") != edition.isoformat():
        raise DeliveryError("BRIEFING_DATE_MISMATCH")
    if args.preflight:
        cfg_present = bool(os.environ.get("DAILY_DESK_MAIL_CONFIG"))
        if cfg_present:
            cfg = read_config()
            if local_sent_matches(cfg, edition):
                return {**base, "status": "already_sent", "mail_config_present": True}
        return {**base, "status": "ready", "mail_config_present": cfg_present}
    if args.dry_run:
        output = args.output_dir or ROOT / "mail" / "output" / edition.isoformat()
        try:
            render_briefing(data, output)
        except Exception:
            raise DeliveryError("RENDER_FAILED") from None
        return {**base, "status": "rendered", "sent": False}
    cfg = read_config()
    store = GitHubState(edition)
    output_context = (contextlib.nullcontext(args.output_dir) if args.output_dir
                      else tempfile.TemporaryDirectory(prefix="daily-desk-mail-"))
    with output_context as output:
        try:
            files = render_briefing(data, Path(output))
        except Exception:
            raise DeliveryError("RENDER_FAILED") from None
        status = deliver(data, edition, files, cfg, store)
    return {**base, "status": status}


def main(argv: list[str] | None = None) -> int:
    try:
        print(json.dumps(run(argv), ensure_ascii=False, sort_keys=True))
        return 0
    except DeliveryError as exc:
        print(json.dumps({"status": "error", "code": exc.code}), file=sys.stderr)
        return exc.exit_code
    except Exception:
        print('{"status":"error","code":"UNEXPECTED_ERROR"}', file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
