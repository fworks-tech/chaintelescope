import { useEffect, useState, type JSX } from "react";
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Link,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { NewsItem } from "@chaintelescope/shared";
import { ApiError, getNews, isTimeout } from "../api/client.js";
import PageHeader from "../components/PageHeader.tsx";
import { formatPublished, hostOf } from "../lib/news.ts";

/** Single source for the watchlist/limit on this screen. */
const WATCHLIST = "BTC";
const LIMIT = 10;

type NewsState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly items: NewsItem[] }
  | { readonly status: "error"; readonly message: string };

export default function News(): JSX.Element {
  const [state, setState] = useState<NewsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    getNews(WATCHLIST, LIMIT, controller.signal)
      .then((items) => {
        if (!cancelled) setState({ status: "ready", items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setState({
            status: "error",
            message: `API error ${err.status} (${err.message})`,
          });
        } else if (isTimeout(err)) {
          setState({ status: "error", message: "Request timed out" });
        } else {
          setState({ status: "error", message: "API unreachable" });
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  if (state.status === "error") {
    return (
      <>
        <PageHeader
          title="News"
          caption={`Headlines matched to the ${WATCHLIST} watchlist.`}
        />
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          <AlertTitle>News unavailable</AlertTitle>
          {state.message}
        </Alert>
      </>
    );
  }

  if (state.status === "loading") {
    return (
      <>
        <PageHeader
          title="News"
          caption="Loading the latest headlines…"
        />
        <Card>
          <CardContent>
            <Skeleton width="30%" height={22} />
            <Skeleton width="50%" height={14} sx={{ mt: 1 }} />
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} height={36} sx={{ mt: 1 }} />
            ))}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="News"
        caption={`Normalized feed items for the ${WATCHLIST} watchlist with safe fallback when remote feeds are unavailable.`}
      />
      {state.items.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="h5" component="h2">
              No news items available.
            </Typography>
            <Typography
              variant="body2"
              sx={{ mt: 0.5, color: "text.secondary" }}
            >
              The ingest job has not stored anything yet, or nothing matches
              this watchlist.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table aria-label="News headlines">
              <TableHead>
                <TableRow>
                  <TableCell>Source</TableCell>
                  <TableCell>Published</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>URL</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.items.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>{hostOf(item.source)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatPublished(item.publishedAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Link href={item.url} target="_blank" rel="noreferrer">
                        {item.url}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </>
  );
}
