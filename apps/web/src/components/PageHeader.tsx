import type { JSX, ReactNode } from "react";
import { Box, Typography } from "@mui/material";

interface PageHeaderProps {
  readonly title: string;
  /** One-line context: what the page is tracking, from where, as of when. */
  readonly caption?: string;
  readonly actions?: ReactNode;
}

/**
 * Shared page header so every screen opens with the same rhythm:
 * title, supporting line, optional right-aligned controls.
 */
export default function PageHeader({
  title,
  caption,
  actions,
}: PageHeaderProps): JSX.Element {
  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 2,
        mb: 2.5,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h1" component="h1">
          {title}
        </Typography>
        {caption ? (
          <Typography
            variant="body2"
            sx={{ mt: 0.75, maxWidth: "72ch", color: "text.secondary" }}
          >
            {caption}
          </Typography>
        ) : null}
      </Box>
      {actions ? <Box sx={{ display: "flex", gap: 1 }}>{actions}</Box> : null}
    </Box>
  );
}
