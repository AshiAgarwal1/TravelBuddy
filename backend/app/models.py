from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Integer, Float, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    city: Mapped[str] = mapped_column(String(200))
    country: Mapped[str] = mapped_column(String(100), default="")
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    days: Mapped[int] = mapped_column(Integer)
    budget: Mapped[str] = mapped_column(String(30))
    group: Mapped[str] = mapped_column(String(50))
    interests: Mapped[list] = mapped_column(JSON, default=list)
    title: Mapped[str] = mapped_column(String(300), default="")
    plan: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CacheEntry(Base):
    """Persistent copy of upstream responses (OSM places etc.) so restarts do not re-query public services."""
    __tablename__ = "cache_entries"

    key: Mapped[str] = mapped_column(String(300), primary_key=True)
    value: Mapped[object] = mapped_column(JSON, default=dict)
    stored_at: Mapped[float] = mapped_column(Float, default=0.0)
    expires_at: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    stale_until: Mapped[float] = mapped_column(Float, default=0.0)
