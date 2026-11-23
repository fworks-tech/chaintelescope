from src.app_shell import render_sidebar_filters
from src.views.risk_view import render_risk_page

time_window, watchlist, market_source, trend_filter = render_sidebar_filters()
render_risk_page(time_window, watchlist, market_source, trend_filter)
