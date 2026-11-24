import type { JSX } from "react";
import { Box, Button, Card, CardContent, Chip, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.tsx";

interface PlaceholderProps {
  readonly title: string;
  /** What the screen will do, so the stub still tells the user something. */
  readonly description: string;
}

/** Temporary stub for pages landing in their own PRs (news, alerts, risk, newsletter). */
export default function Placeholder({
  title,
  description,
}: PlaceholderProps): JSX.Element {
  return (
    <>
      <PageHeader title={title} caption={description} />
      <Card>
        <CardContent
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 1.25,
            py: { xs: 5, md: 7 },
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              display: "grid",
              placeItems: "center",
              backgroundColor: "#eef2ff",
              color: "primary.main",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="6.5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M16 16l4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </Box>
          <Typography variant="h5" component="h2">
            Coming soon
          </Typography>
          <Typography
            variant="body2"
            sx={{ maxWidth: "48ch", color: "text.secondary" }}
          >
            This screen ships in its own pull request, ported from the Streamlit{" "}
            {title.toLowerCase()} view.
          </Typography>
          <Chip label="In progress" size="small" color="primary" variant="outlined" />
          <Button component={Link} to="/" sx={{ mt: 1 }}>
            Back to the dashboard
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
