-- Coverage: every asset appears, including the ones never scanned, plus any
-- `scans.asset_symbol` that no longer exists in `assets` (scans outlive the
-- registry; `asset_symbol` deliberately has no FK).
--
-- FULL OUTER JOIN is the point: a LEFT JOIN would silently drop orphaned
-- scans, and an INNER JOIN would drop both of those groups.
--
-- Running scans are counted but kept out of `total_scans` and the duration
-- average, and they are excluded inside the aggregates rather than in a WHERE
-- clause: filtering the joined rows in WHERE would also delete the ALL-NULL
-- rows that carry the never-scanned assets.
--
-- Upload scans have no symbol and belong to no asset; they are outside a
-- per-asset report.
WITH scan_rollup AS (
  SELECT sc.asset_symbol                                              AS symbol,
         COUNT(*) FILTER (WHERE sc.status <> 'running')::INT          AS total_scans,
         COUNT(*) FILTER (WHERE sc.status = 'running')::INT           AS running_scans,
         ROUND(AVG(sc.duration_ms)
               FILTER (WHERE sc.status <> 'running'))::INT            AS avg_duration_ms
  FROM scans sc
  WHERE sc.asset_symbol IS NOT NULL
  GROUP BY sc.asset_symbol
),
match_rollup AS (
  SELECT sc.asset_symbol            AS symbol,
         COUNT(sm.content_hash)::INT AS blocked_hits
  FROM scans sc
  INNER JOIN scan_matches sm ON sm.scan_id = sc.id
  WHERE sc.asset_symbol IS NOT NULL
  GROUP BY sc.asset_symbol
)
SELECT COALESCE(a.symbol, s.symbol)      AS symbol,
       COALESCE(a.name, 'Unknown asset') AS asset_name,
       COALESCE(s.total_scans, 0)        AS total_scans,
       COALESCE(s.running_scans, 0)      AS running_scans,
       COALESCE(m.blocked_hits, 0)       AS blocked_hits,
       COALESCE(s.avg_duration_ms, 0)    AS avg_duration_ms
FROM assets a
FULL OUTER JOIN scan_rollup s ON s.symbol = a.symbol
LEFT JOIN match_rollup m ON m.symbol = COALESCE(a.symbol, s.symbol)
ORDER BY total_scans DESC, symbol;
