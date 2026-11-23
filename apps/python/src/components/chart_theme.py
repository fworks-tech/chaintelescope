CHART_FONT_COLOR = "#475569"
CHART_GRID_COLOR = "#e2e8f0"


def chart_layout(height: int) -> dict:
    return dict(
        height=height,
        margin=dict(l=0, r=0, t=8, b=0),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color=CHART_FONT_COLOR),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
        xaxis=dict(showgrid=True, gridcolor=CHART_GRID_COLOR, zeroline=False),
        yaxis=dict(showgrid=True, gridcolor=CHART_GRID_COLOR, zeroline=False),
    )
