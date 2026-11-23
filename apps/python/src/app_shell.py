import streamlit as st

from src.data.assets import DEFAULT_WATCHLIST, WATCHLIST_OPTIONS

TIME_WINDOWS = ["24H", "7D", "30D", "90D"]
MARKET_SOURCE_OPTIONS = {
    "Auto (best available)": "auto",
    "Binance": "binance",
    "CoinGecko": "coingecko",
    "Coinbase": "coinbase",
    "Mock (local)": "mock",
}
TREND_FILTER_OPTIONS = {
    "All watchlist": "all",
    "Top Gainers": "top_gainers",
    "Top Losers": "top_losers",
    "Hot": "hot",
}


def render_sidebar_filters():
    with st.sidebar:
        st.markdown("## Filters")
        time_window = st.selectbox("Time Window", TIME_WINDOWS, index=2)
        watchlist = st.multiselect("Watchlist", WATCHLIST_OPTIONS, default=list(DEFAULT_WATCHLIST))
        source_label = st.selectbox("Source", list(MARKET_SOURCE_OPTIONS), index=0)
        trend_label = st.selectbox("Trend", list(TREND_FILTER_OPTIONS), index=0)
        market_source = MARKET_SOURCE_OPTIONS[source_label]
        trend_filter = TREND_FILTER_OPTIONS[trend_label]
    return time_window, watchlist, market_source, trend_filter
