import { Card, CardContent, Typography } from "@mui/material";

/** Temporary stub for pages landing in their own PRs (news, alerts, risk, newsletter). */
export default function Placeholder({ title }: { readonly title: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h5" component="h1">
          {title}
        </Typography>
        <Typography color="text.secondary">
          Em construção — chega na PR da página.
        </Typography>
      </CardContent>
    </Card>
  );
}
