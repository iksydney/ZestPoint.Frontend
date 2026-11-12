import { expect, test } from '@playwright/test';
import { E2E_DATABASE, apiProject, e2eConnectionString } from './e2e-database';

/** Pure logic, no browser: the rules that keep the e2e suite away from dev and prod data. The strings below are made up. */

const DEV = 'Host=db.example;Port=5432;Database=zestpoint;Username=app;Password=not-a-real-password;Pooling=true';

test.describe('e2e database selection', () => {
  test('falls back to the dev server and credentials but forces the e2e database name', () => {
    const connection = e2eConnectionString({}, () => DEV);

    expect(connection).toContain('Host=db.example');
    expect(connection).toContain('Username=app');
    expect(connection).toContain(`Database=${E2E_DATABASE}`);
    expect(connection).not.toMatch(/Database=zestpoint;/);
    expect(connection.match(/database=/gi)).toHaveLength(1);
  });

  test('replaces whichever spelling of the database key the dev string used', () => {
    const connection = e2eConnectionString({}, () => 'Host=db.example;DB=zestpoint;Username=app');

    expect(connection.match(/(^|;)(database|db)=/gi)).toHaveLength(1);
    expect(connection).toContain(`Database=${E2E_DATABASE}`);
  });

  test('accepts ZESTPOINT_E2E_PG when it names a database ending in _e2e', () => {
    const supplied = 'Host=ci.example;Database=checkout_e2e;Username=ci;Password=not-a-real-password';
    expect(e2eConnectionString({ ZESTPOINT_E2E_PG: supplied }, () => DEV)).toBe(supplied);
  });

  test('refuses ZESTPOINT_E2E_PG when it names any other database, without echoing the password', () => {
    const supplied = 'Host=ci.example;Database=zestpoint;Username=ci;Password=not-a-real-password';
    expect(() => e2eConnectionString({ ZESTPOINT_E2E_PG: supplied }, () => DEV)).toThrow(/ending in "_e2e"/);
    expect(() => e2eConnectionString({ ZESTPOINT_E2E_PG: supplied }, () => DEV)).not.toThrow(/not-a-real-password/);
  });

  test('refuses ZESTPOINT_E2E_PG when it names no database at all', () => {
    expect(() => e2eConnectionString({ ZESTPOINT_E2E_PG: 'Host=ci.example;Username=ci' }, () => DEV)).toThrow(/found none/);
  });

  test('explains what to set when there is no server configured anywhere', () => {
    expect(() => e2eConnectionString({}, () => null)).toThrow(/ZESTPOINT_E2E_PG/);
  });

  test('runs the backend beside this repo unless an override points at a scratch copy', () => {
    expect(apiProject({}).replace(/\\/g, '/')).toMatch(/\/ZestPoint\/ZestPoint\/ZestPoint\.API\.csproj$/);
    expect(apiProject({ ZESTPOINT_E2E_API_PROJECT: 'D:\\scratch\\ZestPoint.API.csproj' })).toBe('D:\\scratch\\ZestPoint.API.csproj');
  });
});
