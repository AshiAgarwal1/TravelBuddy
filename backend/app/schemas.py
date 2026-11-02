from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class Prefs(BaseModel):
    """Traveller preferences. Stored only in the browser; sent with requests that benefit from them."""
    budget: Literal["budget", "mid-range", "luxury"] | None = None
    diet: list[str] = Field(default_factory=list, max_length=6)          # vegetarian, vegan, halal, kosher, gluten-free
    cuisines: list[str] = Field(default_factory=list, max_length=10)     # free text, e.g. "ramen", "tapas"
    interests: list[str] = Field(default_factory=list, max_length=12)
    pace: Literal["relaxed", "balanced", "packed"] | None = None
    approach: Literal["local", "mixed", "classic"] | None = None         # local-first vs well-known highlights
    companions: str | None = Field(default=None, max_length=30)         # solo, couple, friends, family, business
    step_free: bool = False

    def is_set(self) -> bool:
        return bool(self.budget or self.diet or self.cuisines or self.interests or self.pace
                    or self.approach or self.companions or self.step_free)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    city: str
    country: str = ""
    lat: float | None = None
    lon: float | None = None
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    prefs: Prefs | None = None


class TripRequest(BaseModel):
    city: str
    country: str = ""
    lat: float | None = None
    lon: float | None = None
    days: int = Field(ge=1, le=10)
    budget: Literal["budget", "mid-range", "luxury"] = "mid-range"
    group: str = "solo"
    interests: list[str] = Field(default_factory=list, max_length=12)
    notes: str = Field(default="", max_length=600)
    prefs: Prefs | None = None


class TripUpdate(BaseModel):
    title: str = Field(max_length=300)
    plan: dict


class TripOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    city: str
    country: str
    lat: float | None
    lon: float | None
    days: int
    budget: str
    group: str
    interests: list
    title: str
    plan: dict
    created_at: datetime
    updated_at: datetime


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    source: str
    target: str
