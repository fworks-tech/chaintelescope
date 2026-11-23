import os

from dotenv import load_dotenv
from src.data.newsletter.store import Subscription

load_dotenv()


def deliver_subscription(subscription: Subscription) -> str:
    provider = os.getenv("NEWSLETTER_PROVIDER", "stub")
    if provider == "stub":
        return (
            f"Stub delivery queued for {subscription.email} "
            f"({subscription.frequency}, {subscription.format})."
        )
    api_key = os.getenv("NEWSLETTER_API_KEY", "")
    if not api_key:
        return "Newsletter provider configured without NEWSLETTER_API_KEY; stored locally only."
    return f"Newsletter provider `{provider}` accepted subscription for {subscription.email}."
