from pydantic import BaseModel, Field


class MarketSeries(BaseModel):
    asset: str
    dates: list[str]
    prices: list[float]
    source: str = "mock"


class MarketConfig(BaseModel):
    provider: str = Field(default="auto")
    request_timeout_seconds: float = Field(default=10.0)
