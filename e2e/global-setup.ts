/**
 * LocalDB needs roughly 0.9 s to open each NEW connection, so the first burst of parallel requests after a cold start looks
 * like random multi-second stalls. Fire a burst up front so the connection pool is warm before any test runs. (A real SQL
 * Server opens connections in milliseconds; this only matters for local LocalDB runs.)
 */
export default async function globalSetup(): Promise<void> {
  const base = 'http://localhost:5250';
  await Promise.all(Array.from({ length: 16 }, () => fetch(`${base}/api/v1/registration/enterprise-types`).catch(() => undefined)));
}
