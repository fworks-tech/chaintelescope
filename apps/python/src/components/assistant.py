import os

import requests
import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError

from src.views import cached_dashboard_snapshot

DOMAIN_KEYWORDS_ALLOWLIST = {"ai", "etf", "btc", "eth", "sol", "bnb", "xrp", "rsi"}
MIN_TOKEN_LENGTH = 3
MAX_SMART_MATCHES = 5
MAX_HISTORY_MESSAGES = 6


def _normalize_history(messages):
    history = []
    for msg in messages or []:
        role = msg.get("role")
        content = msg.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            history.append({"role": role, "content": content.strip()})
    return history


def _smart_context_search(prompt, context):
    tokens = [t.strip(".,:;!?()[]{}\"'").lower() for t in prompt.split()]
    tokens = [t for t in tokens if t in DOMAIN_KEYWORDS_ALLOWLIST or len(t) >= MIN_TOKEN_LENGTH]
    if not tokens:
        return []

    candidates = [
        f"Watchlist: {', '.join(context['watchlist']) if context['watchlist'] else 'none'}",
        *context["kpis"],
        *context["alerts"],
        *context["news"],
        *(
            f"Trending {row['Asset']}: {row['7D Change']} | {row['Sentiment']} | Risk {row['Risk']}"
            for row in context["trending_top3"]
        ),
    ]

    matches = []
    lowered_candidates = [(text, text.lower()) for text in candidates]
    for text, lowered in lowered_candidates:
        if any(token in lowered for token in tokens):
            matches.append(text)
        if len(matches) >= MAX_SMART_MATCHES:
            break
    return matches[:MAX_SMART_MATCHES]


def _read_secret_or_env(name, default=None):
    try:
        if name in st.secrets:
            return st.secrets[name]
    except StreamlitSecretNotFoundError:
        pass
    return os.getenv(name, default)


def _build_context(time_window, watchlist, market_source="auto", trend_filter="all"):
    snapshot = cached_dashboard_snapshot(time_window, watchlist, market_source, trend_filter)
    top_trending = snapshot.trending.head(3).to_dict("records")
    kpis = [f"{item['label']}: {item['value']} ({item['delta']})" for item in snapshot.kpis]
    return {
        "time_window": time_window,
        "watchlist": watchlist,
        "kpis": kpis,
        "alerts": snapshot.alerts,
        "news": snapshot.news,
        "trending_top3": top_trending,
    }


def _fallback_response(context, reason):
    watchlist = ", ".join(context["watchlist"]) if context["watchlist"] else "no assets selected"
    top_names = ", ".join(row["Asset"] for row in context["trending_top3"])
    kpis = context.get("kpis", [])
    lead_kpi = kpis[0] if kpis else "KPI snapshot unavailable"
    alert_examples = context["alerts"][:2] if context["alerts"] else ["none"]
    return (
        "I can still summarize the current dashboard context:\n"
        f"- Watchlist: {watchlist}\n"
        f"- Time window: {context['time_window']}\n"
        f"- KPI snapshot: {lead_kpi}\n"
        f"- Top trending assets: {top_names}\n"
        f"- Active alert examples: {alert_examples[0]}; {alert_examples[1] if len(alert_examples) > 1 else 'none'}\n\n"
        f"GPT provider is unavailable ({reason}). Set `OPENAI_API_KEY` in environment or Streamlit secrets to enable live responses."
    )


def _query_model(prompt, context, history=None):
    api_key = _read_secret_or_env("OPENAI_API_KEY", "")
    if not api_key:
        return _fallback_response(context, "missing credentials")

    base_url = _read_secret_or_env("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = _read_secret_or_env("OPENAI_MODEL", "gpt-4o-mini")
    try:
        timeout_seconds = float(_read_secret_or_env("OPENAI_TIMEOUT_SECONDS", 15))
    except (TypeError, ValueError):
        timeout_seconds = 15

    system_prompt = (
        "You are Ceremco AI, an in-app crypto dashboard assistant. "
        "Answer briefly using only the provided dashboard context (watchlist, KPIs, alerts, news, trending). "
        "If the answer is missing from context, say it is not available yet. "
        "Do not provide financial advice, trade execution instructions, or unverified claims. "
        "Offer practical next-step suggestions based on the shown dashboard panels."
    )

    relevant_matches = _smart_context_search(prompt, context)
    user_prompt = (
        f"Question: {prompt}\n\n"
        f"Context:\n"
        f"- Time Window: {context['time_window']}\n"
        f"- Watchlist: {', '.join(context['watchlist']) if context['watchlist'] else 'none'}\n"
        f"- KPIs: {', '.join(context['kpis'])}\n"
        f"- Alerts: {', '.join(context['alerts'])}\n"
        f"- News: {', '.join(context['news'])}\n"
        f"- Trending Top3: {context['trending_top3']}\n"
        f"- Smart Matches: {relevant_matches if relevant_matches else 'none'}\n"
    )

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    conversation = _normalize_history(history)[-MAX_HISTORY_MESSAGES:]
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            *conversation,
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 250,
    }

    try:
        response = requests.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=body,
            timeout=timeout_seconds,
        )
        if response.status_code == 429:
            return _fallback_response(context, "rate limited")
        response.raise_for_status()
        payload = response.json()
        content = payload["choices"][0]["message"]["content"].strip()
        return content if content else _fallback_response(context, "empty response")
    except requests.Timeout:
        return _fallback_response(context, "request timeout")
    except requests.RequestException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code:
            return _fallback_response(context, f"provider HTTP {status_code}")
        return _fallback_response(context, "network/provider request failed")
    except (KeyError, ValueError, TypeError):
        return _fallback_response(context, "provider response parse failed")


def render_assistant_panel(time_window, watchlist, market_source="auto", trend_filter="all"):
    with st.container(border=True):
        st.subheader("AI Assistant")
        st.caption(
            "Dashboard-grounded help for watchlist, KPIs, alerts, and news. Not financial advice."
        )

        if "assistant_messages" not in st.session_state:
            st.session_state.assistant_messages = []

        context = _build_context(time_window, watchlist, market_source, trend_filter)
        for msg in st.session_state.assistant_messages:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])

        prompt = st.chat_input("Ask about the current dashboard context")
        if prompt:
            history = st.session_state.assistant_messages.copy()
            st.session_state.assistant_messages.append({"role": "user", "content": prompt})
            answer = _query_model(prompt, context, history=history)
            st.session_state.assistant_messages.append({"role": "assistant", "content": answer})
            st.rerun()
