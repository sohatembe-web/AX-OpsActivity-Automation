import { test } from '@playwright/test';
import { StatsPage } from '../pages/StatsPage';
import { TEST_DATA } from '../lib/Global';

test.describe('Traffic Source Stats — Brand filter', () => {
  let statsPage: StatsPage;

  test.beforeEach(async ({ page }) => {
    statsPage = new StatsPage(page);
    await statsPage.goto();
  });

  test('Filter by Brand and validate brand data', { tag: '@smoke' }, async ({ page }) => {
    page.setDefaultTimeout(15_000);
    //const brand = TEST_DATA.defaultBrand; // e.g. 'Amazon'
    const brand = 'Walmart';
    const brandType= 'Homepage Brand';

    // ---------------- Calendar: date range ----------------
    await statsPage.openCalendar();
    await statsPage.selectQuickRange(/^This Month/);
    await statsPage.applyCalendar();

    // ---------------- Brand filter: open → search → check ----------------
    await statsPage.selectBrand(brand);

    
   // await statsPage.selectBrandType(brandType);
    

    // ---------------- GO ----------------
    await statsPage.applyFilters();

    // ---------------- Validate ----------------
    await statsPage.expectBrandDataInFooter(brand);
    console.log(`Brand "${brand}" data is displayed.`);
  });
});

