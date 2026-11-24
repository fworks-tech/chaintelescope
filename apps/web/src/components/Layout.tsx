import type { JSX } from "react";
import { AppBar, Box, Container, Toolbar, Typography } from "@mui/material";
import { NavLink, Outlet } from "react-router-dom";
import BrandMark from "./BrandMark.tsx";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/news", label: "News" },
  { to: "/alerts", label: "Alerts" },
  { to: "/risk", label: "Risk" },
  { to: "/newsletter", label: "Newsletter" },
];

/**
 * App shell: sticky translucent header aligned to the content column, a nav
 * that wraps instead of overflowing, and the page container.
 *
 * Nav state is expressed with `aria-current="page"` (which NavLink sets) rather
 * than a CSS-only `.active` class, so screen readers announce the current page
 * and the visual state cannot drift from the semantic one.
 */
export default function Layout(): JSX.Element {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <AppBar
        sx={{
          /* Sticky on desktop only: on a phone it would eat a sixth of the
             viewport, and the nav is one tap away anyway. */
          position: { xs: "static", md: "sticky" },
          backgroundColor: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid",
          borderColor: "divider",
          color: "text.primary",
        }}
      >
        <Container maxWidth="lg">
          <Toolbar
            disableGutters
            sx={{
              minHeight: { xs: 58, md: 68 },
              flexWrap: "wrap",
              rowGap: { xs: 0.5, md: 0 },
              columnGap: 2,
              py: { xs: 1, md: 0 },
            }}
          >
            <Box
              component={NavLink}
              to="/"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1.25,
                minHeight: 40,
                textDecoration: "none",
                color: "inherit",
                borderRadius: 2,
              }}
            >
              <BrandMark />
              <Box>
                <Typography
                  sx={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                  }}
                >
                  ChainTelescope
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    display: { xs: "none", sm: "block" },
                    fontSize: "0.625rem",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    lineHeight: 1.4,
                  }}
                >
                  Market intelligence
                </Typography>
              </Box>
            </Box>

            <Box
              component="nav"
              aria-label="Primary"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 0.25, sm: 0.5 },
                flexWrap: "wrap",
                ml: { md: "auto" },
                width: { xs: "100%", md: "auto" },
                order: { xs: 3, md: 2 },
              }}
            >
              {links.map((link) => (
                <Box
                  key={link.to}
                  component={NavLink}
                  to={link.to}
                  end={link.to === "/"}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 40,
                    px: { xs: 1.25, sm: 1.5 },
                    borderRadius: "10px",
                    fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                    fontWeight: 600,
                    lineHeight: 1.2,
                    color: "text.primary",
                    textDecoration: "none",
                    transition: "background-color 120ms ease, color 120ms ease",
                    "&:hover": { backgroundColor: "#e8edff" },
                    '&[aria-current="page"]': {
                      backgroundColor: "primary.main",
                      color: "primary.contrastText",
                      boxShadow: "0 6px 16px rgba(59, 91, 255, 0.26)",
                      "&:hover": { backgroundColor: "primary.dark" },
                    },
                  }}
                >
                  {link.label}
                </Box>
              ))}
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      <Container
        maxWidth="lg"
        component="main"
        sx={{ flex: 1, pt: { xs: 2.5, md: 4 }, pb: 6 }}
      >
        <Outlet />
      </Container>
    </Box>
  );
}
