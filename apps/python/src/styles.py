import streamlit as st

GLOBAL_STYLE = """
<style>
:root {
  --bg: #eef2f8;
  --panel: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --accent: #3b5bff;
  --accent-soft: #94a3ff;
  --ok: #12b76a;
  --warn: #f79009;
  --bad: #f04438;
  --border: #d8dee9;
  --sidebar-bg: #ffffff;
  --sidebar-text: #0f172a;
  --sidebar-muted: #475569;
  --sidebar-border: #cbd5e1;
  --sidebar-control: #f8fafc;
  --sidebar-accent: #3b5bff;
}

html, body, [data-testid="stAppViewContainer"] {
  background: radial-gradient(circle at 10% 0%, #e8eeff 0%, var(--bg) 45%, #f7f9fc 100%);
  color: var(--text);
}

[data-testid="stMainBlockContainer"] {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

[data-testid="stMainBlockContainer"] h2,
[data-testid="stMainBlockContainer"] h3 {
  color: var(--text);
  letter-spacing: -0.02em;
}

[data-testid="stMainBlockContainer"] [data-testid="stCaptionContainer"] p {
  color: var(--muted);
}

[data-testid="stVerticalBlockBorderWrapper"] {
  background: var(--panel);
  border-color: var(--border) !important;
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
}

.kpi-value {
  font-size: 1.65rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text);
}

.kpi-delta {
  font-size: 0.95rem;
  font-weight: 600;
}

.feed-item {
  margin: 0.35rem 0;
  color: var(--text);
  line-height: 1.45;
}

section[data-testid="stSidebar"],
[data-testid="stSidebar"] {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%) !important;
  border-right: 1px solid var(--sidebar-border);
  box-shadow: 8px 0 24px rgba(15, 23, 42, 0.06);
  color: var(--sidebar-text) !important;
}

section[data-testid="stSidebar"] > div,
[data-testid="stSidebar"] > div,
[data-testid="stSidebarUserContent"],
[data-testid="stSidebarContent"] {
  background: transparent !important;
}

[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p,
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] li,
[data-testid="stSidebar"] label,
[data-testid="stSidebar"] h1,
[data-testid="stSidebar"] h2,
[data-testid="stSidebar"] h3,
[data-testid="stSidebar"] h4 {
  color: var(--sidebar-text) !important;
}

[data-testid="stSidebar"] .stCaption,
[data-testid="stSidebar"] [data-testid="stCaptionContainer"],
[data-testid="stSidebar"] [data-testid="stCaptionContainer"] p {
  color: var(--sidebar-muted) !important;
}

[data-testid="stSidebarNav"] a,
[data-testid="stSidebar"] nav a,
[data-testid="stSidebar"] a:not([aria-current="page"]) {
  color: #1e293b !important;
  font-weight: 600;
  border-radius: 10px;
}

[data-testid="stSidebarNav"] a[aria-current="page"],
[data-testid="stSidebar"] nav a[aria-current="page"] {
  color: #ffffff !important;
  background: var(--sidebar-accent) !important;
  border: 1px solid #2f49d8 !important;
}

[data-testid="stSidebarNav"] a:hover,
[data-testid="stSidebar"] nav a:hover {
  color: var(--sidebar-text) !important;
  background: #e8edff !important;
}

[data-testid="stSidebar"] div[data-baseweb="select"]:not(:has(span[data-baseweb="tag"])) > div,
[data-testid="stSidebar"] div[data-baseweb="input"] > div,
[data-testid="stSidebar"] input {
  background-color: var(--sidebar-control) !important;
  color: var(--sidebar-text) !important;
  border-color: var(--sidebar-border) !important;
}

[data-testid="stSidebar"] div[data-baseweb="select"]:has(span[data-baseweb="tag"]) {
  background-color: var(--sidebar-control) !important;
  border-color: var(--sidebar-border) !important;
}

[data-testid="stSidebar"] div[data-baseweb="select"]:has(span[data-baseweb="tag"]) > div,
[data-testid="stSidebar"] div[data-baseweb="select"]:has(span[data-baseweb="tag"]) > div > div {
  background-color: transparent !important;
  padding-left: 0.75rem !important;
  padding-right: 0.25rem !important;
  box-sizing: border-box !important;
  overflow: visible !important;
}

[data-testid="stSidebar"] div[data-baseweb="select"]:has(span[data-baseweb="tag"]) input {
  background-color: transparent !important;
  margin-left: 0.25rem !important;
  min-width: 0.25rem !important;
}

[data-testid="stSidebar"] span[data-baseweb="tag"] {
  background-color: #e8edff !important;
  color: #1e3a8a !important;
  border: 1px solid #bfd0ff !important;
  margin-left: 0.15rem !important;
  overflow: visible !important;
}

[data-testid="stSidebar"] span[data-baseweb="tag"] > span[title] {
  overflow: visible !important;
  min-width: max-content !important;
  max-width: none !important;
  display: inline-block !important;
}

[data-testid="stSidebar"] svg {
  color: var(--sidebar-muted) !important;
}

.card, .panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
}

.small {
  color: var(--muted);
  font-size: 0.85rem;
}

.val {
  font-size: 1.4rem;
  font-weight: 700;
}
</style>
"""


def inject_global_styles():
    st.markdown(GLOBAL_STYLE, unsafe_allow_html=True)
