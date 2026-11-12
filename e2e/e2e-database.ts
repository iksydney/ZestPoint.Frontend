import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Where the e2e run gets its PostgreSQL database and API from. The suite creates tenants, users and orders on every run, so it
 * must never share a database with dev or prod data: the name is forced to E2E_DATABASE, or must end in "_e2e" when supplied.
 */
export const E2E_DATABASE = 'zestpoint_e2e';
const SUFFIX = '_e2e';

/** The backend project folder, beside this repo (the frontend and the backend are sibling repositories). */
const API_DIR = resolve(__dirname, '..', '..', 'ZestPoint', 'ZestPoint');

/** The API to run. Set ZESTPOINT_E2E_API_PROJECT to a scratch copy when Visual Studio holds the real one's build output locked. */
export function apiProject(env: NodeJS.ProcessEnv = process.env): string {
  return env['ZESTPOINT_E2E_API_PROJECT'] || join(API_DIR, 'ZestPoint.API.csproj');
}

/** Npgsql connection strings are `key=value;key=value`. The segments of one are returned lower-cased by key. */
function segments(connection: string): { key: string; raw: string; value: string }[] {
  return connection.split(';').filter((s) => s.includes('=')).map((raw) => {
    const at = raw.indexOf('=');
    return { key: raw.slice(0, at).trim().toLowerCase(), raw, value: raw.slice(at + 1).trim() };
  });
}

const isDatabaseKey = (key: string): boolean => key === 'database' || key === 'db';

function databaseOf(connection: string): string | null {
  return segments(connection).find((s) => isDatabaseKey(s.key))?.value || null;
}

function withDatabase(connection: string, database: string): string {
  const rest = segments(connection).filter((s) => !isDatabaseKey(s.key)).map((s) => s.raw);
  return [...rest, `Database=${database}`].join(';');
}

/** The dev connection the backend tests also fall back to: server and credentials only, the database is replaced by the caller. */
function readDevConnection(): string | null {
  const file = join(API_DIR, 'appsettings.Development.json');
  if (!existsSync(file)) return null;
  const settings = JSON.parse(readFileSync(file, 'utf8')) as { ConnectionStrings?: { DefaultConnection?: string } };
  return settings.ConnectionStrings?.DefaultConnection ?? null;
}

/**
 * The connection string for the e2e API. ZESTPOINT_E2E_PG wins and must name a database ending in "_e2e". Otherwise the server
 * and credentials come from the backend's appsettings.Development.json and the database is forced to zestpoint_e2e.
 * Messages never include the connection string: it holds a password.
 */
export function e2eConnectionString(env: NodeJS.ProcessEnv = process.env, readDev: () => string | null = readDevConnection): string {
  const supplied = env['ZESTPOINT_E2E_PG'];
  if (supplied) {
    const database = databaseOf(supplied);
    if (!database || !database.toLowerCase().endsWith(SUFFIX)) {
      throw new Error(`ZESTPOINT_E2E_PG must name a database ending in "${SUFFIX}" (found ${database ? `"${database}"` : 'none'}). The e2e suite refuses to run against any other database.`);
    }
    return supplied;
  }

  const dev = readDev();
  if (!dev) {
    throw new Error('The e2e suite needs a PostgreSQL server. Set ZESTPOINT_E2E_PG (for example "Host=localhost;Username=postgres;Password=...;Database=zestpoint_e2e") or put ConnectionStrings:DefaultConnection in the backend\'s appsettings.Development.json.');
  }
  return withDatabase(dev, E2E_DATABASE);
}
