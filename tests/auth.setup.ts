import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';


/**
 * Logs in once per browser and saves the session to
 * playwright/.auth/<browser>.json  (e.g. chrome.json, firefox.json)
 * Pre-condition for all specs: "user is logged in"
 */

const ACCOUNT = (process.env.AUTH_ACCOUNT ?? 'nomfa').toUpperCase();   // 'MFA' | 'NOMFA'
const MAX_AGE_MS = 8 * 60 * 60 * 1000;             // reuse session for up to 8 hours
const APP_URL = process.env.BASE_URL!;             // your app URL from .env

const LOGIN_EMAIL = process.env[`${ACCOUNT}_LOGIN_EMAIL`] ?? '';
const LOGIN_PASSWORD = process.env[`${ACCOUNT}_LOGIN_PASSWORD`] ?? '';
const IS_MFA = ACCOUNT === 'MFA';
// Short wait when there's no MFA, so a failed login shows up fast instead of after 4 minutes
const MFA_WAIT_MS = IS_MFA ? 4 * 60 * 1000 : 30_000;

  if (!APP_URL || !LOGIN_EMAIL || !LOGIN_PASSWORD) {
  throw new Error(`BASE_URL or ${ACCOUNT}_LOGIN_EMAIL / ${ACCOUNT}_LOGIN_PASSWORD missing in .env`);
}



setup('Microsoft Login Authentication', async ({ page }) => {
  setup.setTimeout(6 * 60 * 1000);                 // leaves room for teardown

  // "firefox-setup" -> playwright/.auth/firefox.json
  const browserName = setup.info().project.name.replace('-setup', '');
 const authFile = path.join('playwright', '.auth', `${browserName}-${ACCOUNT.toLowerCase()}.json`);

    // Reuse only a recent, non-empty session
  if (fs.existsSync(authFile) && Date.now() - fs.statSync(authFile).mtimeMs < MAX_AGE_MS) {
    const state = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
    if (state.cookies?.length) {
      setup.skip(true, `Reusing existing ${browserName} auth state`);
    }
  }

  const appHost = new URL(APP_URL).hostname;

  // 1. Open the app's Welcome page and start the Microsoft login
  await page.goto(APP_URL);
  await page.getByRole('button', { name: 'Login with your Microsoft Account' }).click();

    // 2. Email
  const emailInput = page.locator('input[name="loginfmt"]');
  await emailInput.waitFor({ state: 'visible' });
  await emailInput.fill(LOGIN_EMAIL);
  await page.locator('#idSIButton9').click();               // Next

  // 3. Password, only if Microsoft actually asks for it
  const passwordInput = page.locator('input[name="passwd"]');
  const signInButton = page.locator('#idSIButton9');
  try {
    await passwordInput.waitFor({ state: 'visible', timeout: 10_000 });
    await passwordInput.fill(LOGIN_PASSWORD);
    await expect(signInButton).toBeEnabled();
    await signInButton.click();
  } catch {
    // Passwordless screen (Windows Hello / PIN / security key) was shown instead.
    console.log('⚠ Passwordless sign-in shown. Complete it in the browser window (PIN / fingerprint / MFA).');
  }

  // 4. Finish sign-in by hand if needed (MFA, PIN, "Stay signed in?").
  //    Auto-click "Yes" on "Stay signed in?" if it appears.
  page.locator('#idSIButton9', { hasText: /yes/i })
    .click({ timeout: MFA_WAIT_MS })
    .catch(() => {});

  // 5. Clear end state: back on the app and logged in
  await page.waitForURL(url => url.hostname === appHost, { timeout: MFA_WAIT_MS });
  await expect(
    page.getByRole('button', { name: 'Login with your Microsoft Account' })
  ).toBeHidden({ timeout: 30_000 });


  // 6. Save session for this browser
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});   

