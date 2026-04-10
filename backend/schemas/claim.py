"""
Foundit — Claim Schemas
Pydantic models for blockchain-based claims
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ClaimCreate(BaseModel):
    """Owner initiates a claim for an item."""
    item_id: str
    finder_id: str          # The user who found the item
    owner_wallet: str       # Owner's MetaMask wallet address


class ClaimComplete(BaseModel):
    """Finder completes the claim with the secret code and blockchain tx."""
    secret_code: str        # Raw secret code shared in person
    tx_hash: str            # Blockchain transaction hash
    finder_wallet: str      # Finder's MetaMask wallet address


class ClaimApprove(BaseModel):
    """Admin approves a claim (body can be empty, using for consistency)."""
    pass


class ClaimResponse(BaseModel):
    id: str
    item_id: str
    claimant_id: str        # Owner who initiated
    finder_id: Optional[str] = None
    status: str = "pending"
    secret_code: Optional[str] = None  # Only returned to the owner on creation
    tx_hash: Optional[str] = None
    reward_amount: Optional[float] = None
    expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    owner_wallet: Optional[str] = None
    finder_wallet: Optional[str] = None
