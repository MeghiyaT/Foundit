"""
Foundit — OTP Service
Generate, hash, and verify 6-digit one-time passwords.
Sends OTP emails via Resend.
"""

import secrets
import hashlib
import logging
from datetime import datetime, timedelta, timezone

import resend
from config import get_settings

logger = logging.getLogger(__name__)

OTP_EXPIRY_MINUTES = 15


def generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP."""
    return f"{secrets.randbelow(1000000):06d}"


def hash_otp(otp: str) -> str:
    """Hash an OTP using SHA-256 (fast, sufficient for short-lived tokens)."""
    return hashlib.sha256(otp.encode()).hexdigest()


def verify_otp(otp: str, otp_hash: str, expires_at: datetime) -> bool:
    """Return True if the OTP matches the hash and hasn't expired."""
    now = datetime.now(tz=timezone.utc)
    # Ensure expires_at is timezone-aware for comparison
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        logger.warning(f"OTP expired at {expires_at}, now is {now}")
        return False
    result = hash_otp(otp) == otp_hash
    if not result:
        logger.warning("OTP hash mismatch")
    return result


def otp_expires_at() -> datetime:
    """Return the expiry timestamp for a new OTP."""
    return datetime.now(tz=timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)


def send_otp_email(to_email: str, otp: str, item_title: str) -> bool:
    """
    Send OTP email via Resend.
    Returns True on success, False on failure.
    OTP is always logged to terminal for debugging.
    """
    # Always log to terminal first — never lose the OTP
    logger.info(f"[OTP] *** Verification code for {to_email}: {otp} ***")

    settings = get_settings()
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set. Skipping email send.")
        return True

    resend.api_key = settings.RESEND_API_KEY

    html_body = f"""
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fff; border: 1px solid #E5E5EA; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 28px;">
        <div style="width: 48px; height: 48px; background: #2563EB; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
          <span style="color: white; font-size: 22px;">🔍</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; color: #1A1A1A; margin: 0;">Foundit</h1>
      </div>
      <h2 style="font-size: 18px; font-weight: 600; color: #1A1A1A; margin-bottom: 8px;">Your verification code</h2>
      <p style="font-size: 15px; color: #6B6B7B; margin-bottom: 24px; line-height: 1.6;">
        You're claiming <strong style="color: #1A1A1A;">{item_title}</strong>. Use this code to verify your identity:
      </p>
      <div style="background: #F5F5F7; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 36px; font-weight: 800; color: #2563EB; letter-spacing: 0.25em;">{otp}</span>
      </div>
      <p style="font-size: 13px; color: #9CA3AF; text-align: center;">
        Expires in {OTP_EXPIRY_MINUTES} minutes · Do not share this code with anyone.
      </p>
    </div>
    """

    try:
        params: resend.Emails.SendParams = {
            "from": "Foundit <onboarding@resend.dev>",
            "to": [to_email],
            "subject": f"Your Foundit verification code: {otp}",
            "html": html_body,
        }
        result = resend.Emails.send(params)
        logger.info(f"OTP email sent to {to_email} (id={result.get('id', '?')}). Code: {otp}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP email: {e}")
        logger.info(f"[FALLBACK] OTP for {to_email}: {otp}")
        return False
