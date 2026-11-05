-- Per-asset scan history: INNER JOIN, so assets that were never scanned are
-- absent by design. Coverage (#114's other query) is the report that includes
-- them.
--
-- The match count lives in a separate CTE: joining scan_matches directly and
-- then counting here would multiply every scan by its number of matches, which
-- inflates COUNT and weights AVG(duration_ms) by match count.
WITH scan_stats AS (
  SELECT sc.asset_symbol                                        AS symbol,
         COUNT(*)::INT                                          AS total_scans,
         COUNT(*) FILTER (WHERE sc.status = 'completed')::INT   AS completed_scans,
         COUNT(*) FILTER (WHERE sc.status = 'failed')::INT      AS failed_scans,
         COUNT(*) FILTER (WHERE sc.status = 'running')::INT     AS running_scans,
         ROUND(AVG(sc.duration_ms))::INT                        AS avg_duration_ms,
         MAX(sc.created_at)                                     AS last_scan_at
  FROM scans sc
  WHERE sc.asset_symbol IS NOT NULL
  GROUP BY sc.asset_symbol
),
match_counts AS (
  SELECT sc.asset_symbol            AS symbol,
         COUNT(sm.content_hash)::INT AS blocked_matches
  FROM scans sc
  INNER JOIN scan_matches sm ON sm.scan_id = sc.id
  WHERE sc.asset_symbol IS NOT NULL
  GROUP BY sc.asset_symbol
)
SELECT a.symbol,
       a.name,
       s.total_scans,
       s.completed_scans,
       s.failed_scans,
       s.running_scans,
       COALESCE(m.blocked_matches, 0) AS blocked_matches,
       COALESCE(s.avg_duration_ms, 0) AS avg_duration_ms,
       s.last_scan_at
FROM assets a
INNER JOIN scan_stats s ON s.symbol = a.symbol
LEFT JOIN match_counts m ON m.symbol = a.symbol
ORDER BY s.total_scans DESC, a.symbol;
