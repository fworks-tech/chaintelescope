from dataclasses import dataclass


@dataclass(frozen=True)
class AlertRule:
    id: str
    description: str
    threshold: float
    confidence: str = "medium"


DEFAULT_RULES = [
    AlertRule(
        id="drawdown",
        description="Primary asset drawdown exceeds threshold",
        threshold=0.08,
        confidence="high",
    ),
    AlertRule(
        id="momentum",
        description="Primary asset momentum exceeds threshold",
        threshold=0.05,
        confidence="medium",
    ),
]


def evaluate_alert_rules(time_window: str, watchlist: list[str], prices: list[float]) -> list[str]:
    del time_window
    if not prices:
        return ["No price data available for alert evaluation."]

    primary = watchlist[0] if watchlist else "BTC"
    start = prices[0]
    end = prices[-1]
    change = (end - start) / start if start else 0.0
    alerts = []

    for rule in DEFAULT_RULES:
        if rule.id == "drawdown" and change <= -rule.threshold:
            alerts.append(
                f"{primary} drawdown {change:.1%} triggered rule `{rule.id}` ({rule.confidence} confidence)"
            )
        if rule.id == "momentum" and change >= rule.threshold:
            alerts.append(
                f"{primary} momentum {change:.1%} triggered rule `{rule.id}` ({rule.confidence} confidence)"
            )

    if not alerts:
        alerts.append(f"No active threshold alerts for {primary} in the selected window.")
    return alerts
