-- Blocklist effectiveness: how often each listed hash was matched, split by the
-- outcome of the scan that matched it, plus a running total by addition date.
--
-- LEFT JOINs, not INNER: a hash added to the blocklist that never matched
-- anything is a valid, informative row (zero hits). INNER JOIN would hide it.
--
-- The window frame is explicit so the cumulative column means the same thing
-- regardless of the `ORDER BY` tie-breaking.
SELECT b.content_hash,
       COUNT(sm.scan_id) FILTER (WHERE sc.status = 'failed')::INT    AS blocked_failed,
       COUNT(sm.scan_id) FILTER (WHERE sc.status = 'completed')::INT AS blocked_clean,
       COUNT(sm.scan_id)::INT                                        AS total_hits,
       SUM(COUNT(sm.scan_id)) OVER (
         ORDER BY b.added_at, b.content_hash
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       )::INT                                                        AS cumulative_hits,
       b.added_at
FROM blocklist_hashes b
LEFT JOIN scan_matches sm ON sm.content_hash = b.content_hash
LEFT JOIN scans sc        ON sc.id = sm.scan_id
GROUP BY b.content_hash, b.added_at
ORDER BY b.added_at, b.content_hash;
