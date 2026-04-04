"""
Foundit — Item Schemas
Pydantic request/response models for items
"""

from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class ItemCreate(BaseModel):
    type: str  # 'lost' | 'found'
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    location: Optional[str] = None
    date_reported: Optional[date] = None


class ItemResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    type: str
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    location: Optional[str] = None
    image_url: Optional[str] = None
    status: str
    date_reported: Optional[date] = None
    created_at: Optional[datetime] = None


class ItemList(BaseModel):
    items: list[ItemResponse]
    total: int
    page: int
    limit: int
