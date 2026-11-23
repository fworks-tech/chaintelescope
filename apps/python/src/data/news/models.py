from datetime import datetime

from pydantic import BaseModel, Field


class FeedItem(BaseModel):
    id: str
    source: str
    published_at: datetime
    title: str
    url: str
    tags: list[str] = Field(default_factory=list)
