"""
Foundit — OTP Service
Generate, hash, and verify 6-digit one-time passwords.
Sends OTP emails via Resend.
"""

import secrets
import hashlib
import base64
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
    """
    Hash an OTP using scrypt with a random per-OTP 16-byte salt.
    Returns a string in format: base64(salt)$hex(hash)
    This prevents rainbow-table attacks on the 6-digit OTP space.
    """
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        otp.encode(),
        salt=salt,
        n=16384,  # CPU/memory cost factor (N)
        r=8,       # Block size
        p=1,       # Parallelization
        maxmem=0,
        dklen=32,  # 256-bit output
    )
    return f"{base64.b64encode(salt).decode()}${derived.hex()}"


def verify_otp(otp: str, stored: str, expires_at: datetime) -> bool:
    """
    Return True if the OTP matches the stored scrypt hash and hasn't expired.
    stored must be in format: base64(salt)$hex(hash)
    Also supports legacy SHA-256 hashes for backward compatibility during migration.
    """
    now = datetime.now(tz=timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        logger.warning("OTP expired")
        return False

    # Legacy SHA-256 verification (fallback for existing OTPs)
    if "$" not in stored:
        result = hashlib.sha256(otp.encode()).hexdigest() == stored
        if not result:
            logger.warning("OTP hash mismatch (legacy)")
        return result

    # Scrypt verification
    try:
        salt_b64, hash_hex = stored.split("$", 1)
        salt = base64.b64decode(salt_b64)
        derived = hashlib.scrypt(
            otp.encode(),
            salt=salt,
            n=16384,
            r=8,
            p=1,
            maxmem=0,
            dklen=32,
        )
        result = derived.hex() == hash_hex
        if not result:
            logger.warning("OTP hash mismatch (scrypt)")
        return result
    except Exception:
        logger.exception("Failed to verify OTP hash")
        return False


def otp_expires_at() -> datetime:
    """Return the expiry timestamp for a new OTP."""
    return datetime.now(tz=timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)


def send_otp_email(to_email: str, otp: str, item_title: str) -> bool:
    """
    Send OTP email via Resend.
    Returns True on success, False on failure.
    OTP is always logged to terminal for debugging.
    """
    # Log that an OTP was generated (never log the code itself in production)
    logger.info(f"[OTP] Verification code generated for {to_email}")

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
            "subject": "Your Foundit verification code",
            "html": html_body,
        }
        result = resend.Emails.send(params)
        logger.info(f"OTP email sent to {to_email} (id={result.get('id', '?')})")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP email: {e}")
        # In development only — log OTP for debugging
        logger.debug(f"[DEV] OTP for {to_email}: {otp}")
        return False
