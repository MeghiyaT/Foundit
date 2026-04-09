"""
Foundit — Message Schemas
Pydantic models for direct messaging between users
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MessageCreate(BaseModel):
    item_id: str
    receiver_id: str
    content: str


class MessageResponse(BaseModel):
    id: str
    item_id: str
    sender_id: str
    receiver_id: str
    content: str
    sender_email: Optional[str] = None
    receiver_email: Optional[str] = None
    item_title: Optional[str] = None
    created_at: Optional[datetime] = None
