#!/usr/bin/env python3
"""Render an approved Daily Desk edition for the connected GPT Gmail sender.

This process has no mail credentials and never sends mail. It publishes one
self-contained MIME JSON bundle using GitHub Contents compare-and-swap. The
sender owns delivery state and must verify the source/bundle after its claim.
"""
from __future__ import annotations

import argparse
import base64
from datetime import date, datetime, time
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from render import cutoff_for_date, render_briefing, validate_briefing

ROOT = Path(__file__).resolve().parent.parent
SEOUL = ZoneInfo("Asia/Seoul")
MAX_SOURCE_BYTES = 2_000_000
MAX_BUNDLE_BYTES = 6_000_000
BLOCKED_STATES = {"sending", "sent", "uncertain"}
SHA256 = re.compile(r"[0-9a-f]{64}\Z")


class PrepareError(Exception):
    """Only fixed, nonsensitive codes are written to workflow output."""


def now_kst() -> datetime:
    return datetime.now(SEOUL)


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def timestamp(value: Any) -> datetime:
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if "T" not in value or result.tzinfo is None or result.utcoffset() is None:
            raise ValueError()
        return result
    except (ValueError, TypeError, AttributeError):
        raise PrepareError("TIMESTAMP_INVALID") from None


def edition_date(value: str | None, *, dry_run=False, now=None) -> date:
    today = (now or now_kst()).astimezone(SEOUL).date()
    try:
        result = date.fromisoformat(value) if value else today
        if value and result.isoformat() != value:
            raise ValueError()
    except (ValueError, TypeError):
        raise PrepareError("DATE_INVALID") from None
    if result != today and not dry_run:
        raise PrepareError("DATE_NOT_TODAY")
    return result


def generation_gate(edition: date, *, now=None) -> str | None:
    current = (now or now_kst()).astimezone(SEOUL)
    if edition != current.date():
        raise PrepareError("DATE_NOT_TODAY")
    return "too_early" if current < cutoff_for_date(edition) else None


def validate_source(data: Any, edition: date, *, now=None) -> None:
    try:
        validate_briefing(data)
    except Exception:
        raise PrepareError("BRIEFING_INVALID") from None
    if data["date"] != edition.isoformat():
        raise PrepareError("BRIEFING_DATE_MISMATCH")
    if timestamp(data["created_at"]) > (now or now_kst()):
        raise PrepareError("BRIEFING_CREATED_IN_FUTURE")


def renderer_hash() -> str:
    """Include all bundled inputs that can change the delivered design."""
    paths = ("mail/render.py", "mail/prepare.py", "mail/requirements.txt",
             "mail/templates/briefing.html.j2", "mail/assets/nipa-white.png")
    hasher = hashlib.sha256()
    for path in paths:
        hasher.update(path.encode("utf-8") + b"\0")
        hasher.update((ROOT / path).read_bytes())
        hasher.update(b"\0")
    return hasher.hexdigest()


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: Any) -> bytes:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise PrepareError("BUNDLE_INVALID")
    try:
        decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        if _encode(decoded) != value:
            raise ValueError()
        return decoded
    except ValueError:
        raise PrepareError("BUNDLE_INVALID") from None


def build_bundle(data: dict[str, Any], edition: date, files: dict[str, Path], *, now=None) -> dict[str, Any]:
    current = now or now_kst()
    validate_source(data, edition, now=current)
    html = Path(files["html"]).read_text(encoding="utf-8")
    pdf = Path(files["pdf"]).read_bytes()
    logo = (ROOT / "mail" / "assets" / "nipa-white.png").read_bytes()
    payload = {"mime_type": "multipart/mixed", "parts": [
        {"mime_type": "multipart/related", "parts": [
            {"mime_type": "text/html", "charset": "utf-8", "body": {"content": html}},
            {"mime_type": "image/png", "filename": "nipa-white.png", "content_disposition": "inline",
             "content_id": "<nipa-logo>", "body": {"base64_url_content": _encode(logo)}}]},
        {"mime_type": "application/pdf", "filename": f"AI반도체_일일_브리핑_{edition:%Y.%m.%d}.pdf",
         "content_disposition": "attachment", "body": {"base64_url_content": _encode(pdf)}}]}
    bundle = {"schema_version": 1, "status": "rendered", "date": edition.isoformat(),
              "cutoff_at": data["cutoff_at"], "subject": f"AI반도체 일일 브리핑[{edition:%Y.%m.%d}]",
              "source_sha256": digest(canonical(data)), "renderer_sha256": renderer_hash(),
              "rendered_at": current.isoformat(timespec="seconds"), "payload": payload,
              "pdf_sha256": digest(pdf), "pdf_bytes": len(pdf),
              "html_sha256": digest(html.encode("utf-8")), "payload_sha256": digest(canonical(payload))}
    validate_bundle(bundle, edition, now=current)
    return bundle


def validate_bundle(bundle: Any, edition: date, *, now=None) -> None:
    """Require precisely one HTML body, approved inline logo, and one PDF."""
    try:
        if (not isinstance(bundle, dict) or type(bundle.get("schema_version")) is not int
                or bundle["schema_version"] != 1 or bundle.get("status") != "rendered"
                or bundle.get("date") != edition.isoformat()
                or bundle.get("subject") != f"AI반도체 일일 브리핑[{edition:%Y.%m.%d}]"):
            raise ValueError()
        cutoff = timestamp(bundle["cutoff_at"])
        expected = cutoff_for_date(edition)
        if cutoff != expected or cutoff.utcoffset() != expected.utcoffset():
            raise ValueError()
        rendered_at = timestamp(bundle["rendered_at"])
        if not cutoff <= rendered_at <= (now or now_kst()):
            raise ValueError()
        for field in ("source_sha256", "renderer_sha256", "pdf_sha256", "html_sha256", "payload_sha256"):
            if not isinstance(bundle.get(field), str) or not SHA256.fullmatch(bundle[field]):
                raise ValueError()
        payload = bundle["payload"]
        if set(payload) != {"mime_type", "parts"} or payload["mime_type"] != "multipart/mixed" or len(payload["parts"]) != 2:
            raise ValueError()
        related, pdf_part = payload["parts"]
        if set(related) != {"mime_type", "parts"} or related["mime_type"] != "multipart/related" or len(related["parts"]) != 2:
            raise ValueError()
        html_part, logo_part = related["parts"]
        if (set(html_part) != {"mime_type", "charset", "body"} or html_part["mime_type"] != "text/html"
                or html_part["charset"] != "utf-8" or set(html_part["body"]) != {"content"}):
            raise ValueError()
        html = html_part["body"]["content"]
        if not isinstance(html, str) or not html.strip() or 'src="cid:nipa-logo"' not in html:
            raise ValueError()
        if (set(logo_part) != {"mime_type", "filename", "content_disposition", "content_id", "body"}
                or logo_part["mime_type"] != "image/png" or logo_part["filename"] != "nipa-white.png"
                or logo_part["content_disposition"] != "inline" or logo_part["content_id"] != "<nipa-logo>"
                or set(logo_part["body"]) != {"base64_url_content"}):
            raise ValueError()
        if _decode(logo_part["body"]["base64_url_content"]) != (ROOT / "mail/assets/nipa-white.png").read_bytes():
            raise ValueError()
        if (set(pdf_part) != {"mime_type", "filename", "content_disposition", "body"}
                or pdf_part["mime_type"] != "application/pdf" or pdf_part["content_disposition"] != "attachment"
                or pdf_part["filename"] != f"AI반도체_일일_브리핑_{edition:%Y.%m.%d}.pdf"
                or set(pdf_part["body"]) != {"base64_url_content"}):
            raise ValueError()
        pdf = _decode(pdf_part["body"]["base64_url_content"])
        if (len(pdf) < 100 or not pdf.startswith(b"%PDF-") or b"%%EOF" not in pdf[-1024:]
                or type(bundle["pdf_bytes"]) is not int or bundle["pdf_bytes"] != len(pdf)
                or bundle["pdf_sha256"] != digest(pdf) or bundle["html_sha256"] != digest(html.encode("utf-8"))
                or bundle["payload_sha256"] != digest(canonical(payload))
                or len(canonical(bundle)) > MAX_BUNDLE_BYTES):
            raise ValueError()
    except (ValueError, KeyError, TypeError, OSError, PrepareError):
        raise PrepareError("BUNDLE_INVALID") from None


def load_document(path: Path, maximum=MAX_BUNDLE_BYTES) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        if path.stat().st_size > maximum:
            raise ValueError()
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, OSError):
        raise PrepareError("DOCUMENT_INVALID") from None


def blocked_state(state: Any, edition: date) -> str | None:
    if state is None:
        return None
    if (not isinstance(state, dict) or state.get("date") != edition.isoformat()
            or state.get("status") not in BLOCKED_STATES | {"safe_pre_send_failure"}):
        raise PrepareError("DELIVERY_STATE_INVALID")
    if state["status"] == "safe_pre_send_failure":
        return None
    return "delivery_" + state["status"]


def matching_bundle(bundle: Any, data: dict[str, Any], edition: date, *, now=None) -> bool:
    if bundle is None:
        return False
    try:
        validate_bundle(bundle, edition, now=now)
    except PrepareError:
        return False
    return (bundle["source_sha256"] == digest(canonical(data))
            and bundle["renderer_sha256"] == renderer_hash())


class GitHubContents:
    """Read authoritative source/state; CAS only the rendered artifact."""

    def __init__(self, environ=None):
        env = os.environ if environ is None else environ
        self.token = env.get("GITHUB_TOKEN", "")
        repo = env.get("GITHUB_REPOSITORY", "")
        self.branch = env.get("GITHUB_REF_NAME", "main")
        if not self.token or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo) or self.branch != "main":
            raise PrepareError("GITHUB_CONFIG_INVALID")
        self.base = f"https://api.github.com/repos/{repo}"

    def _request(self, method: str, path: str, value=None):
        req = Request(self.base + path, method=method, data=None if value is None else canonical(value), headers={
            "Authorization": "Bearer " + self.token, "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "daily-desk-renderer"})
        try:
            with urlopen(req, timeout=25) as response:
                return json.load(response)
        except HTTPError as exc:
            if method == "GET" and exc.code == 404:
                return None
            if method == "PUT" and exc.code in {409, 422}:
                raise PrepareError("PUBLISH_CONFLICT_RETRY") from None
            raise PrepareError("GITHUB_WRITE_FAILED" if method == "PUT" else "GITHUB_READ_FAILED") from None
        except Exception:
            raise PrepareError("GITHUB_WRITE_FAILED" if method == "PUT" else "GITHUB_READ_FAILED") from None

    def read(self, path: str) -> tuple[dict[str, Any] | None, str | None]:
        result = self._request("GET", f"/contents/{quote(path, safe='/')}?ref={quote(self.branch, safe='')}")
        if result is None:
            return None, None
        try:
            sha = result["sha"]
            if not re.fullmatch(r"[0-9a-f]{40}", sha):
                raise ValueError()
            maximum = MAX_SOURCE_BYTES if path.startswith("briefings/ready/") else MAX_BUNDLE_BYTES
            if result.get("size", maximum + 1) > maximum:
                raise ValueError()
            # Contents omits inline content above 1 MiB. Read the exact blob SHA.
            if result.get("encoding") == "none":
                result = self._request("GET", f"/git/blobs/{sha}")
            if result["encoding"] != "base64":
                raise ValueError()
            raw = base64.b64decode(result["content"], validate=False)
            if len(raw) > maximum:
                raise ValueError()
            value = json.loads(raw)
            if not isinstance(value, dict):
                raise ValueError()
            return value, sha
        except (ValueError, TypeError, KeyError):
            raise PrepareError("REMOTE_DOCUMENT_INVALID") from None

    def write_bundle(self, edition: date, bundle: dict[str, Any], sha: str | None):
        payload = {"message": f"Prepare Daily Desk mail {edition.isoformat()} [skip ci]",
                   "branch": self.branch, "content": base64.b64encode(canonical(bundle) + b"\n").decode("ascii")}
        if sha is not None:
            payload["sha"] = sha
        result = self._request("PUT", f"/contents/briefings/rendered/{edition.isoformat()}.json", payload)
        if not isinstance(result, dict) or not result.get("content", {}).get("sha"):
            raise PrepareError("GITHUB_WRITE_FAILED")


def atomic_write(path: Path, bundle: dict[str, Any]):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".bundle-", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(canonical(bundle) + b"\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def publish(bundle: dict[str, Any], edition: date, remote: Any) -> str:
    """Reconcile after rendering, then atomically replace the target blob only."""
    if generation_gate(edition):
        return "too_early"
    validate_bundle(bundle, edition)
    source, _ = remote.read(f"briefings/ready/{edition.isoformat()}.json")
    if source is None:
        raise PrepareError("SOURCE_REMOVED_RETRY")
    validate_source(source, edition)
    if digest(canonical(source)) != bundle["source_sha256"]:
        raise PrepareError("SOURCE_CHANGED_RETRY")
    existing, sha = remote.read(f"briefings/rendered/{edition.isoformat()}.json")
    state, _ = remote.read(f"briefings/state/{edition.isoformat()}.json")
    blocked = blocked_state(state, edition)
    if blocked:
        return blocked
    if matching_bundle(existing, source, edition):
        return "already_rendered"
    # The sender also verifies hashes after its durable sending claim because
    # Contents cannot transactionally update two independent paths.
    latest_source, _ = remote.read(f"briefings/ready/{edition.isoformat()}.json")
    latest_state, _ = remote.read(f"briefings/state/{edition.isoformat()}.json")
    blocked = blocked_state(latest_state, edition)
    if blocked:
        return blocked
    if latest_source is None or digest(canonical(latest_source)) != bundle["source_sha256"]:
        raise PrepareError("SOURCE_CHANGED_RETRY")
    if generation_gate(edition):
        return "too_early"
    remote.write_bundle(edition, bundle, sha)
    return "published"


def run(argv=None) -> dict[str, Any]:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--preflight", action="store_true", help="Inspect local readiness without network access")
    modes.add_argument("--publish", action="store_true", help="Read main and CAS-publish a MIME bundle to GitHub")
    modes.add_argument("--dry-run", action="store_true", help="Render locally; historical dates allowed, never publish")
    parser.add_argument("--date", help="YYYY-MM-DD; today unless --dry-run")
    parser.add_argument("--output-dir", type=Path, help="Keep HTML/PDF and the MIME bundle here")
    args = parser.parse_args(argv)
    edition = edition_date(args.date, dry_run=args.dry_run)
    result = {"date": edition.isoformat(), "sent": False}
    if not args.dry_run:
        blocked = generation_gate(edition)
        if blocked:
            return {**result, "status": blocked}
    remote = GitHubContents() if args.publish else None
    paths = {kind: f"briefings/{kind}/{edition.isoformat()}.json" for kind in ("ready", "state", "rendered")}
    def read(kind):
        maximum = MAX_SOURCE_BYTES if kind == "ready" else MAX_BUNDLE_BYTES
        return remote.read(paths[kind])[0] if remote else load_document(ROOT / paths[kind], maximum)
    blocked = blocked_state(read("state"), edition)
    if blocked:
        return {**result, "status": blocked}
    source = read("ready")
    if source is None:
        return {**result, "status": "not_ready"}
    validate_source(source, edition)
    if matching_bundle(read("rendered"), source, edition):
        return {**result, "status": "already_rendered"}
    if args.preflight:
        return {**result, "status": "ready"}
    with tempfile.TemporaryDirectory(prefix="daily-desk-render-") as temporary:
        output = args.output_dir or Path(temporary)
        try:
            files = render_briefing(source, output)
            bundle = build_bundle(source, edition, files)
        except PrepareError:
            raise
        except Exception:
            raise PrepareError("RENDER_FAILED") from None
        status = publish(bundle, edition, remote) if remote else "rendered"
        if status in {"rendered", "published"}:
            target = args.output_dir / f"{edition.isoformat()}.json" if args.output_dir else ROOT / paths["rendered"]
            atomic_write(target, bundle)
    return {**result, "status": status}


def main(argv=None):
    try:
        print(json.dumps(run(argv), ensure_ascii=False, sort_keys=True))
        return 0
    except PrepareError as exc:
        print(json.dumps({"status": "error", "code": str(exc)}), file=sys.stderr)
        return 2
    except Exception:
        print('{"status":"error","code":"UNEXPECTED_ERROR"}', file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
