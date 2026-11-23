import json
import os
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger

load_dotenv()

DATA_DIR = Path(os.getenv("NEWSLETTER_DATA_DIR", "data"))
SUBSCRIPTIONS_FILE = DATA_DIR / "newsletter_subscriptions.json"


@dataclass
class Subscription:
    email: str
    frequency: str
    format: str
    created_at: str


def _ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not SUBSCRIPTIONS_FILE.exists():
        SUBSCRIPTIONS_FILE.write_text("[]", encoding="utf-8")


def list_subscriptions() -> list[Subscription]:
    _ensure_store()
    try:
        payload = json.loads(SUBSCRIPTIONS_FILE.read_text(encoding="utf-8"))
        return [Subscription(**item) for item in payload]
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load subscriptions: {}", exc)
        return []


def save_subscription(email: str, frequency: str, format: str) -> Subscription | None:
    _ensure_store()
    record = Subscription(
        email=email.strip().lower(),
        frequency=frequency,
        format=format,
        created_at=datetime.now(UTC).isoformat(),
    )
    try:
        subscriptions = list_subscriptions()
        subscriptions = [item for item in subscriptions if item.email != record.email]
        subscriptions.append(record)
        SUBSCRIPTIONS_FILE.write_text(
            json.dumps([asdict(item) for item in subscriptions], indent=2),
            encoding="utf-8",
        )
        return record
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to save subscription: {}", exc)
        return None
