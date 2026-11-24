import type { JSX } from "react";
import { Button, Card, CardContent, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.tsx";

export default function NotFound(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Page not found"
        caption="That route doesn't exist in this build of the web shell."
      />
      <Card>
        <CardContent sx={{ py: { xs: 5, md: 7 }, textAlign: "center" }}>
          <Typography
            sx={{
              fontSize: "2.5rem",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: "primary.main",
              lineHeight: 1,
            }}
          >
            404
          </Typography>
          <Typography variant="body2" sx={{ mt: 1.5, color: "text.secondary" }}>
            Check the address, or head back to the dashboard.
          </Typography>
          <Button component={Link} to="/" variant="contained" sx={{ mt: 2.5 }}>
            Back to the dashboard
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
