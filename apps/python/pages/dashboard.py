from src.app_shell import render_sidebar_filters
from src.views.dashboard_view import render_dashboard_page

time_window, watchlist, market_source, trend_filter = render_sidebar_filters()
render_dashboard_page(time_window, watchlist, market_source, trend_filter)
