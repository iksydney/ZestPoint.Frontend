import { defineConfig } from '@playwright/test';
import { apiProject, e2eConnectionString } from './e2e/e2e-database';

/**
 * End-to-end tests drive the REAL stack: the Angular dev server (proxying /api) and the ASP.NET Core API against a
 * throw-away PostgreSQL database (zestpoint_e2e, created by the API's startup migrations on first run), using the Microsoft
 * Edge that ships with Windows. Connection and API location rules, and why the database name is locked, are in e2e/e2e-database.ts.
 */
const API_PORT = 5250;
const WEB_PORT = 4300;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: `dotnet run --project "${apiProject()}" --no-launch-profile`,
      url: `http://localhost:${API_PORT}/runtime`,
      timeout: 240_000,
      reuseExistingServer: !process.env['CI'],
      env: {
        ASPNETCORE_ENVIRONMENT: 'Development',
        ASPNETCORE_URLS: `http://localhost:${API_PORT}`,
        ConnectionStrings__DefaultConnection: e2eConnectionString(),
        Database__MigrateOnStartup: 'true', // creates zestpoint_e2e on the first run and brings it up to date on later ones
        RateLimiting__AuthPerMinute: '100000',
        RateLimiting__GlobalPerMinute: '100000',
        Cors__AllowedOrigins__0: `http://localhost:${WEB_PORT}`,
        Storage__RootPath: 'App_Data/e2e-uploads',
        Subscriptions__WorkerEnabled: 'false', // the tests change subscription state through the platform interface and read it back immediately
        Platform__BootstrapEmail: 'operator@zestpoint.e2e',
        Platform__BootstrapPassword: 'Operat0r-E2E-Passw0rd!'
      }
    },
    {
      command: `npx ng serve --configuration e2e --port ${WEB_PORT} --proxy-config proxy.e2e.conf.json`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 240_000,
      reuseExistingServer: !process.env['CI']
    }
  ]
});
