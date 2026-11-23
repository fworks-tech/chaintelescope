from src.app_shell import render_sidebar_filters
from src.views.alerts_view import render_alerts_page

time_window, watchlist, market_source, trend_filter = render_sidebar_filters()
render_alerts_page(time_window, watchlist, market_source, trend_filter)
