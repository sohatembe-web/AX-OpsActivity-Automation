
import { defineConfig, devices, Project } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

// 1. Browsers available to run on
const BROWSERS = {
  chrome:  { ...devices['Desktop Chrome'], channel: 'chrome' },
 // firefox: { ...devices['Desktop Firefox'] },
  // edge:   { ...devices['Desktop Edge'],   channel: 'msedge' },
  // webkit: { ...devices['Desktop Safari'] },
} as const;

type BrowserName = keyof typeof BROWSERS;

// 2. Which browsers to run (default: chrome + firefox)
//    Override with BROWSERS=firefox or BROWSERS=chrome in .env / CLI
const selected = (process.env.BROWSERS ?? 'chrome')
  .split(',')
  .map(b => b.trim())
  .filter((b): b is BrowserName => {
    const ok = b in BROWSERS;
    if (!ok) console.warn(`⚠ Unknown browser "${b}" ignored. Use: ${Object.keys(BROWSERS).join(', ')}`);
    return ok;
    
  });

// 3. Same dependency chain for each browser
function projectsFor(name: BrowserName): Project[] {
  const device = BROWSERS[name];

  const ACCOUNT = (process.env.AUTH_ACCOUNT ?? 'nomfa').toLowerCase();
// inside projectsFor():
const authFile = `playwright/.auth/${name}-${ACCOUNT}.json`;

  return [
    {
      name: `${name}-setup`,
      testMatch: /auth\.setup\.ts/,
      use: { ...device, trace: 'off', video: 'off' },
    },
    {
      name: `${name}-activity1`,
      testMatch: /traffic-source-stats\.spec\.ts$/,
      dependencies: [`${name}-setup`],
      use: { ...device, storageState: authFile },
    },
    {
      name: `${name}-activity3`,
      testMatch: /BrandOnBrandPerformance\.spec\.ts$/,
      dependencies: [`${name}-activity1`],
      use: { ...device, storageState: authFile },
    },
    {
      name: `${name}-activity2`,
      testMatch: /BrandFilter\.spec\.ts$/,
      dependencies: [`${name}-activity3`],
      use: { ...device, storageState: authFile },
    },
    {
      // Any other spec file (e.g. Filter.spec.ts) — needs login only
      name: `${name}-misc`,
      testMatch: /.*\.spec\.ts$/,
      testIgnore: [
        /traffic-source-stats\.spec\.ts$/,
        /BrandOnBrandPerformance\.spec\.ts$/,
        /BrandFilter\.spec\.ts$/,
      ],
      dependencies: [`${name}-setup`],
      use: { ...device, storageState: authFile },
    },
  
  ];
}

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,

  reporter: [
    ['html'],
    ['allure-playwright'],
    ['./utils/executive-summary-reporter.ts'],
  ],

  use: {
    headless: process.env.HEADED !== 'true',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) },
  },

  projects: selected.flatMap(projectsFor),
});


