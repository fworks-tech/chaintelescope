import { useCallback, useEffect, useRef, type JSX } from "react";
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
import type { ApiError } from "../api/client.js";
import PageHeader from "../components/PageHeader.tsx";
import { formatPublished, hostOf, isHttpUrl } from "../lib/news.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  fetchNews,
  selectAllNews,
  selectNewsError,
  selectNewsHasLoaded,
  selectNewsStatus,
} from "../store/news/newsSlice.js";

/** Single source for the watchlist/limit on this screen. */
const WATCHLIST = "BTC";
const LIMIT = 10;

function formatNewsError(error: ApiError): string {
  if (error.status !== undefined) {
    return `API error ${error.status} (${error.message}) [${error.code}]`;
  }
  return `${error.message} [${error.code}]`;
}

export default function News(): JSX.Element {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectNewsStatus);
  const items = useAppSelector(selectAllNews);
  const error = useAppSelector(selectNewsError);
  const hasLoaded = useAppSelector(selectNewsHasLoaded);
  const activeRequest = useRef<{ abort: () => void } | null>(null);

  const loadNews = useCallback(() => {
    activeRequest.current?.abort();
    activeRequest.current = dispatch(
      fetchNews({ watchlist: WATCHLIST, limit: LIMIT }),
    );
  }, [dispatch]);

  useEffect(() => {
    loadNews();
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [loadNews]);

  if (status === "error" && error !== null) {
    return (
      <>
        <PageHeader
          title="News"
          caption={`Headlines matched to the ${WATCHLIST} watchlist.`}
        />
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={loadNews}>
              Try again
            </Button>
          }
        >
          <AlertTitle>News unavailable</AlertTitle>
          {formatNewsError(error)}
        </Alert>
      </>
    );
  }

  if (status === "loading" || (status === "idle" && !hasLoaded)) {
    return (
      <>
        <PageHeader title="News" caption="Loading the latest headlines…" />
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
      {items.length === 0 ? (
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
                {items.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>{hostOf(item.source)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatPublished(item.publishedAt)}
                    </TableCell>
                    <TableCell>
                      {isHttpUrl(item.url) ? (
                        <Link href={item.url} target="_blank" rel="noreferrer">
                          {item.title}
                        </Link>
                      ) : (
                        item.title
                      )}
                    </TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isHttpUrl(item.url) ? (
                        <Link href={item.url} target="_blank" rel="noreferrer">
                          {item.url}
                        </Link>
                      ) : (
                        item.url
                      )}
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
