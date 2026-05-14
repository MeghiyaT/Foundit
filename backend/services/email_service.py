"""
Foundit — Email Notification Service
Uses Resend (https://resend.com) to send transactional emails.

Triggered by:
  - AI match found        → notify both item owners
  - New message received  → notify recipient
  - Claim initiated       → notify admin
  - Claim approved        → notify finder (they can now complete)
  - Claim completed       → notify owner (item returned!)
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Lazy import — Resend is optional. System works without it.
_resend = None

def _get_resend():
    global _resend
    if _resend is not None:
        return _resend
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key or api_key.startswith("re_your"):
        return None
    try:
        import resend as r
        r.api_key = api_key
        _resend = r
        return _resend
    except ImportError:
        logger.warning("resend package not installed. Run: pip install resend")
        return None


FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
FROM_EMAIL = "Foundit <notifications@foundit.app>"


def _send(to: str, subject: str, html: str) -> bool:
    """Send a single email. Returns True on success, False on failure (never raises)."""
    r = _get_resend()
    if not r:
        logger.debug("Email skipped (Resend not configured): %s → %s", subject, to)
        return False
    if not to or "@" not in to or "@clerk.local" in to:
        return False
    try:
        r.Emails.send({
            "from": FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        })
        logger.info("Email sent: '%s' → %s", subject, to)
        return True
    except Exception as e:
        logger.error("Failed to send email '%s' to %s: %s", subject, to, e)
        return False


# ─── HTML Template helper ────────────────────────────────────────────────────

def _email_html(title: str, body: str, cta_text: str = "", cta_url: str = "") -> str:
    cta_block = ""
    if cta_text and cta_url:
        cta_block = f"""
        <div style="margin: 28px 0; text-align: center;">
          <a href="{cta_url}"
             style="display:inline-block; padding:12px 28px; background:#2563eb; color:white;
                    font-size:15px; font-weight:600; border-radius:8px; text-decoration:none;">
            {cta_text}
          </a>
        </div>"""
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
    <!-- Header -->
    <div style="background:#2563eb;padding:24px 32px;">
      <span style="font-size:22px;font-weight:800;color:white;letter-spacing:-0.5px;">🔍 Foundit</span>
    </div>
    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#f1f5f9;">{title}</h2>
      <div style="font-size:15px;color:#94a3b8;line-height:1.7;">{body}</div>
      {cta_block}
      <hr style="border:none;border-top:1px solid #334155;margin:28px 0;">
      <p style="margin:0;font-size:12px;color:#475569;">
        You're receiving this because you have an item on <a href="{FRONTEND_URL}" style="color:#2563eb;">Foundit</a>.
        Items are automatically matched using AI — no action needed from you to keep matching active.
      </p>
    </div>
  </div>
</body>
</html>"""


# ─── Public notification functions ───────────────────────────────────────────

def notify_match_found(
    owner_email: str,
    owner_item_title: str,
    matched_item_title: str,
    similarity_pct: int,
    item_id: str,
) -> None:
    """Notify item owner that an AI match was found."""
    _send(
        to=owner_email,
        subject=f"🎯 Match found for your lost item: {owner_item_title}",
        html=_email_html(
            title="We found a potential match!",
            body=f"""
              Our AI matched your lost item <strong style="color:#f1f5f9;">{owner_item_title}</strong>
              with a found item: <strong style="color:#f1f5f9;">{matched_item_title}</strong>.
              <br><br>
              <span style="background:#1d4ed8;color:white;padding:3px 10px;border-radius:20px;font-size:13px;font-weight:700;">
                {similarity_pct}% similar
              </span>
              <br><br>
              Click below to view the match and message the finder.
            """,
            cta_text="View Match →",
            cta_url=f"{FRONTEND_URL}/items/{item_id}",
        ),
    )


def notify_new_message(
    receiver_email: str,
    sender_name: str,
    item_title: str,
    message_preview: str,
    item_id: str,
    sender_id: str,
) -> None:
    """Notify user they received a new message about an item."""
    preview = message_preview[:120] + ("…" if len(message_preview) > 120 else "")
    _send(
        to=receiver_email,
        subject=f"💬 New message about: {item_title}",
        html=_email_html(
            title=f"New message from {sender_name}",
            body=f"""
              <strong style="color:#f1f5f9;">{sender_name}</strong> sent you a message
              about <strong style="color:#f1f5f9;">{item_title}</strong>:
              <br><br>
              <div style="background:#0f172a;border-left:3px solid #2563eb;padding:12px 16px;border-radius:0 8px 8px 0;
                          font-style:italic;color:#cbd5e1;">
                "{preview}"
              </div>
              <br>
              Reply directly in the app to coordinate the handover.
            """,
            cta_text="Open Messages →",
            cta_url=f"{FRONTEND_URL}/messages",
        ),
    )


def notify_claim_initiated(
    admin_email: str,
    item_title: str,
    owner_email: str,
    claim_id: str,
) -> None:
    """Notify admin that a claim is waiting for approval."""
    _send(
        to=admin_email,
        subject=f"⚠️ Claim needs approval: {item_title}",
        html=_email_html(
            title="A claim needs your approval",
            body=f"""
              A new claim has been initiated for <strong style="color:#f1f5f9;">{item_title}</strong>
              by <strong style="color:#f1f5f9;">{owner_email}</strong>.
              <br><br>
              Please review and approve or reject this claim in the admin dashboard.
              The claim expires in <strong style="color:#f1f5f9;">1 hour</strong>.
            """,
            cta_text="Review in Admin Dashboard →",
            cta_url=f"{FRONTEND_URL}/admin",
        ),
    )


def notify_claim_approved(
    finder_email: str,
    item_title: str,
    claim_id: str,
    secret_code_hint: str = "",
) -> None:
    """Notify finder that admin approved — they can now complete the claim."""
    _send(
        to=finder_email,
        subject=f"✅ Claim approved — ready to hand over: {item_title}",
        html=_email_html(
            title="Your claim has been approved!",
            body=f"""
              The admin has approved the claim for <strong style="color:#f1f5f9;">{item_title}</strong>.
              <br><br>
              The owner has a <strong style="color:#f1f5f9;">6-character secret code</strong>.
              When you meet in person, ask for the code, enter it in the app, and complete the
              handover to earn your <strong style="color:#f1f5f9;">FNDT reward tokens</strong>.
              <br><br>
              ⏱ You have <strong style="color:#f59e0b;">1 hour</strong> to complete this.
            """,
            cta_text="Complete Claim →",
            cta_url=f"{FRONTEND_URL}/messages",
        ),
    )


def notify_claim_completed(
    owner_email: str,
    item_title: str,
    finder_name: str,
    reward_amount: Optional[float] = None,
) -> None:
    """Notify owner that their item has been returned."""
    reward_line = ""
    if reward_amount:
        reward_line = f"<br>The finder earned <strong style='color:#f1f5f9;'>{int(reward_amount)} FNDT</strong> tokens for their honesty."
    _send(
        to=owner_email,
        subject=f"🎉 Item returned: {item_title}",
        html=_email_html(
            title="Your item has been returned!",
            body=f"""
              Great news! <strong style="color:#f1f5f9;">{finder_name}</strong> has completed
              the handover for <strong style="color:#f1f5f9;">{item_title}</strong>.
              <br><br>
              The handover has been recorded on the Sepolia blockchain as proof of transfer.
              {reward_line}
              <br><br>
              Thanks for using Foundit 🙌
            """,
            cta_text="View My Items →",
            cta_url=f"{FRONTEND_URL}/my-items",
        ),
    )
