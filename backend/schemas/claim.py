"""
Foundit — Claim Schemas
Pydantic models for claims and OTP verification
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ClaimCreate(BaseModel):
    item_id: str


class ClaimVerify(BaseModel):
    otp: str


class ClaimResponse(BaseModel):
    id: str
    item_id: str
    claimant_id: str
    verified: bool
    nft_tx_hash: Optional[str] = None
    created_at: Optional[datetime] = None
