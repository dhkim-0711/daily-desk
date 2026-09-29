"""Delivery-safety boundaries; all network operations are substituted."""
from contextlib import redirect_stderr
from datetime import date, datetime
from email.message import EmailMessage
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch


MAIL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MAIL))
spec = importlib.util.spec_from_file_location("deliver", MAIL / "deliver.py")
deliver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deliver)


class MemoryState:
    def __init__(self, value=None):
        self.value = value
        self.writes = []

    def read(self):
        return None if self.value is None else self.value.copy()

    def write(self, value):
        self.value = value.copy()
        self.writes.append(value.copy())


class DeliverySafetyTests(unittest.TestCase):
    def setUp(self):
        self.today = date(2026, 9, 29)
        self.now = datetime(2026, 9, 29, 9, 10, tzinfo=deliver.SEOUL)
        self.cfg = {"sender": "sender@gmail.com", "recipient": "reader@example.com", "app_password": "never-show-this"}
        self.key = hashlib.sha256(self.cfg["recipient"].encode()).hexdigest()
        self.message_id = f"<daily-desk.2026-09-29.{self.key[:24]}@daily-desk.invalid>"

    def state(self, status):
        return {"date": "2026-09-29", "recipient_key": self.key, "message_id": self.message_id,
                "content_hash": "old-content", "status": status}

    def test_send_gate_and_stale_dates(self):
        self.assertEqual(deliver.gate(self.today, self.now.replace(minute=9)), "too_early")
        self.assertIsNone(deliver.gate(self.today, self.now))
        with self.assertRaisesRegex(deliver.DeliveryError, "DATE_NOT_TODAY"):
            deliver.edition_date("2026-09-28", now=self.now)
        self.assertEqual(deliver.edition_date("2026-09-28", dry_run=True, now=self.now), date(2026, 9, 28))

    def test_missing_artifact_waits_without_config_or_network(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(deliver, "ROOT", Path(folder)), \
                patch.object(deliver, "now_kst", return_value=self.now), \
                patch.object(deliver, "smtp_connect") as smtp:
            self.assertEqual(deliver.run([])["status"], "not_ready")
            smtp.assert_not_called()

    def test_preflight_skips_matching_local_sent_state(self):
        renderer = SimpleNamespace(validate_briefing=lambda data: None, render_briefing=MagicMock())
        with tempfile.TemporaryDirectory() as folder, patch.object(deliver, "ROOT", Path(folder)), \
                patch.object(deliver, "now_kst", return_value=self.now), \
                patch.object(deliver, "load_briefing", return_value={"date": "2026-09-29"}), \
                patch.dict(deliver.os.environ, {"DAILY_DESK_MAIL_CONFIG": json.dumps(self.cfg)}, clear=True), \
                patch.dict(sys.modules, {"render": renderer}), patch.object(deliver, "GitHubState") as remote:
            path = Path(folder) / "briefings" / "state" / "2026-09-29.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(self.state("sent")), encoding="utf-8")
            self.assertEqual(deliver.run(["--preflight"])["status"], "already_sent")
            renderer.render_briefing.assert_not_called()
            remote.assert_not_called()

    def test_preflight_does_not_hide_recipient_or_state_conflicts(self):
        renderer = SimpleNamespace(validate_briefing=lambda data: None, render_briefing=MagicMock())
        with tempfile.TemporaryDirectory() as folder, patch.object(deliver, "ROOT", Path(folder)), \
                patch.object(deliver, "now_kst", return_value=self.now), \
                patch.object(deliver, "load_briefing", return_value={"date": "2026-09-29"}), \
                patch.dict(deliver.os.environ, {"DAILY_DESK_MAIL_CONFIG": json.dumps(self.cfg)}, clear=True), \
                patch.dict(sys.modules, {"render": renderer}):
            path = Path(folder) / "briefings" / "state" / "2026-09-29.json"
            path.parent.mkdir(parents=True)
            conflicting = self.state("sent")
            conflicting["recipient_key"] = hashlib.sha256(b"different@example.com").hexdigest()
            for body in (json.dumps(conflicting), "not JSON", json.dumps(self.state("uncertain"))):
                with self.subTest(body=body):
                    path.write_text(body, encoding="utf-8")
                    self.assertEqual(deliver.run(["--preflight"])["status"], "ready")

    def test_invalid_config_does_not_leak(self):
        bad = json.dumps({**self.cfg, "recipient": "reader@example.com\r\nBcc: other@example.com"})
        output = io.StringIO()
        with patch.dict(deliver.os.environ, {"DAILY_DESK_MAIL_CONFIG": bad}, clear=True), redirect_stderr(output):
            self.assertEqual(deliver.main(["--check-config"]), 2)
        self.assertIn("MAIL_CONFIG_INVALID", output.getvalue())
        self.assertNotIn("never-show", output.getvalue())
        self.assertNotIn("@", output.getvalue())

    def test_uncertain_record_never_blindly_resends(self):
        for status in ("sending", "uncertain"):
            with self.subTest(status=status), patch.object(deliver, "now_kst", return_value=self.now), \
                    patch.object(deliver, "GmailSent") as sent, patch.object(deliver, "smtp_connect") as smtp:
                sent.return_value.__enter__.return_value.contains_id.return_value = False
                sent.return_value.__enter__.return_value.contains_legacy.return_value = False
                with self.assertRaisesRegex(deliver.DeliveryError, "DELIVERY_UNCERTAIN"):
                    deliver.deliver({}, self.today, {}, self.cfg, MemoryState(self.state(status)))
                smtp.assert_not_called()

    def test_reconciliation_marks_sent_without_resending(self):
        store = MemoryState(self.state("uncertain"))
        with patch.object(deliver, "now_kst", return_value=self.now), patch.object(deliver, "GmailSent") as sent, \
                patch.object(deliver, "smtp_connect") as smtp:
            sent.return_value.__enter__.return_value.contains_id.return_value = True
            self.assertEqual(deliver.deliver({}, self.today, {}, self.cfg, store), "already_sent")
            self.assertEqual(store.value["status"], "sent")
            smtp.assert_not_called()

    def test_exact_legacy_edition_prevents_duplicate(self):
        store = MemoryState()
        with patch.object(deliver, "now_kst", return_value=self.now), patch.object(deliver, "GmailSent") as sent, \
                patch.object(deliver, "smtp_connect") as smtp:
            sent.return_value.__enter__.return_value.contains_id.return_value = False
            sent.return_value.__enter__.return_value.contains_legacy.return_value = True
            self.assertEqual(deliver.deliver({}, self.today, {}, self.cfg, store), "already_sent")
            smtp.assert_not_called()
            serialized = json.dumps(store.value)
            self.assertNotIn(self.cfg["recipient"], serialized)
            self.assertNotIn(self.cfg["sender"], serialized)
            self.assertNotIn(self.cfg["app_password"], serialized)

    def test_failed_durable_write_prevents_send(self):
        store = MemoryState()
        store.write = MagicMock(side_effect=deliver.DeliveryError("STATE_WRITE_FAILED"))
        with patch.object(deliver, "now_kst", return_value=self.now), patch.object(deliver, "GmailSent") as sent, \
                patch.object(deliver, "build_message", return_value=b"message"), patch.object(deliver, "smtp_connect") as smtp:
            sent.return_value.__enter__.return_value.contains_id.return_value = False
            sent.return_value.__enter__.return_value.contains_legacy.return_value = False
            with self.assertRaisesRegex(deliver.DeliveryError, "STATE_WRITE_FAILED"):
                deliver.deliver({}, self.today, {}, self.cfg, store)
            smtp.return_value.sendmail.assert_not_called()

    def test_sent_copy_requires_html_and_expected_pdf(self):
        subject = deliver.subject_for(self.today)
        message = EmailMessage()
        message.set_content("Briefing")
        message.add_alternative("<p>Briefing</p>", subtype="html")
        self.assertFalse(deliver.verified_mime(message, subject))
        message.add_attachment(b"%PDF-1.7\nverified test", maintype="application", subtype="pdf",
                               filename="AI반도체_일일_브리핑_2026.09.29.pdf")
        self.assertTrue(deliver.verified_mime(message, subject))
        message.add_attachment(b"MD must not be attached", maintype="text", subtype="plain", filename="briefing.md")
        self.assertFalse(deliver.verified_mime(message, subject))

    def test_send_acceptance_without_sent_proof_stays_uncertain(self):
        store = MemoryState()
        with patch.object(deliver, "now_kst", return_value=self.now), patch.object(deliver, "GmailSent") as sent, \
                patch.object(deliver, "build_message", return_value=b"message"), patch.object(deliver, "smtp_connect") as smtp, \
                patch.object(deliver.clock, "sleep"):
            sent.return_value.__enter__.return_value.contains_id.return_value = False
            sent.return_value.__enter__.return_value.contains_legacy.return_value = False
            smtp.return_value.sendmail.return_value = {}
            with self.assertRaisesRegex(deliver.DeliveryError, "DELIVERY_UNCERTAIN"):
                deliver.deliver({}, self.today, {}, self.cfg, store)
            smtp.return_value.sendmail.assert_called_once()
            self.assertEqual([s["status"] for s in store.writes], ["sending", "uncertain"])


if __name__ == "__main__":
    unittest.main()
