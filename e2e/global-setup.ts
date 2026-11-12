/**
 * A cold API opens each NEW database connection (and JIT-compiles its first requests) on demand, so the first burst of parallel
 * requests after a start looks like random multi-second stalls. Fire a burst up front so the connection pool is warm before any
 * test runs.
 */
export default async function globalSetup(): Promise<void> {
  const base = 'http://localhost:5250';
  await Promise.all(Array.from({ length: 16 }, () => fetch(`${base}/api/v1/registration/enterprise-types`).catch(() => undefined)));
}
