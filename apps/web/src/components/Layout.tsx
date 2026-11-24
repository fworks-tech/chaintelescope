import { AppBar, Button, Container, Toolbar, Typography } from "@mui/material";
import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/news", label: "News" },
  { to: "/alerts", label: "Alerts" },
  { to: "/risk", label: "Risk" },
  { to: "/newsletter", label: "Newsletter" },
];

export default function Layout() {
  return (
    <>
      <AppBar position="static" color="inherit" elevation={0}>
        <Toolbar>
          <Typography
            variant="h6"
            component={NavLink}
            to="/"
            sx={{ color: "text.primary", textDecoration: "none", mr: 2 }}
          >
            ChainTelescope
          </Typography>
          {links.map((link) => (
            <Button
              key={link.to}
              component={NavLink}
              to={link.to}
              end={link.to === "/"}
              sx={{
                color: "text.primary",
                "&.active": {
                  backgroundColor: "primary.main",
                  color: "#ffffff",
                  "&:hover": { backgroundColor: "primary.main" },
                },
              }}
            >
              {link.label}
            </Button>
          ))}
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </>
  );
}
