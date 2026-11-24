
///Calendar, Account Manager, Brand filter, all other filters, tabs, drill-downs / Everything you can do on the Stats page///
 
/**
 * StatsPage.ts
 * ---------------------------------------------------------------------------
 * Page Object for the Traffic Source Stats screen (base_stats_new.html) and
 * every drill-down view it opens (Sources / Brands / Daily / Country — each
 * opens in its own new browser tab, so methods here consistently return the
 * `Page` they should be interacted with next).
 *
 * Filter types on this page:
 *  - Checklist dropdowns (jQuery ui-dropdownchecklist): Brand, Siteplug Products,
 *    Account Manager, Sales Manager, BDAM, Pub Sales Manager, Device Category,
 *    Country, Pub AM, Platform, Deal Type, OnBoarding Year, Publisher,
 *    Publisher Deal Type  → selectChecklistFilter() + one wrapper per filter.
 *  - Native <select> dropdowns: Brand Type, Budget type, Number filter
 *    → selectOption().
 * ---------------------------------------------------------------------------
 */
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import {
  applyFilters as applyFiltersAction,
  clickFooterTab,
  expectTotalRowVisible,
  locateResultsTbody,
  openDrillDownInNewTab,
  pause,
  revealDrillDownIcon,
  selectFromSearchDropdown,
  sortByNetRevenue,
  waitForThrobberHidden,
} from '../lib/General';
import { DRILL_DOWN_TYPES, DrillDownType, SELECTORS, STATS_TABS, URLS } from '../lib/Global';
 
/** Labels of the checklist-style filters, exactly as shown on the page. */
export type ChecklistFilterLabel =
  | 'Brand'
  | 'Siteplug Products'
  | 'Account Manager'
  | 'Sales Manager'
  | 'BDAM'
  | 'Pub Sales Manager'
  | 'Device Category'
  | 'Country'
  | 'Pub AM'
  | 'Platform'
  | 'Deal Type'
  | 'OnBoarding Year'
  | 'Publisher'
  | 'Publisher Deal Type';
 
export type BrandTypeOption = 'Homepage Brand' | 'Product Brand';
export type BudgetTypeOption = 'Affiliate' | 'Branding' | 'Network' | 'Others' | 'Search';
export type NumberFilterOption =
  | 'Pub Clicks'
  | 'Pub Tac'
  | 'Impression'
  | 'Click'
  | 'Gross Revenue'
  | 'Net Revenue';
 
/** Escapes regex special characters so values like "(amazon)" match literally. */
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 
export class StatsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }
 
  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
 
  /** Lands directly on Traffic Source Stats (the 'setup' project already established the session). */
  async goto(): Promise<void> {
    await this.page.goto(URLS.stats);
    await expect(this.page.getByText('Traffic Source Stats')).toBeVisible({ timeout: 15_000 });
  }
 
  async expectLoaded(): Promise<void> {
    await expect(this.page.getByText('Traffic Source Stats')).toBeVisible({ timeout: 15_000 });
  }
 
  // ---------------------------------------------------------------------
  // Calendar filter
  // ---------------------------------------------------------------------
 
  async openCalendar(): Promise<void> {
    await pause(this.page, 'Clicking calendar icon...');
    await this.page.locator(SELECTORS.calendarIcon).click();
    await pause(this.page, 'Clicked on calendar icon.');
  }
 
  /** Selects one of the calendar's quick-range links, e.g. "This Month - Aug,". */
  async selectQuickRange(linkNameOrPattern: string | RegExp): Promise<void> {
    await this.page.getByRole('link', { name: linkNameOrPattern }).click();
  }
 
  async applyCalendar(): Promise<void> {
    await this.page.locator(SELECTORS.calendarApplyButton).click();
    await pause(this.page, 'Clicked on Apply button to apply the date range.');
  }
 
  // ---------------------------------------------------------------------
  // Generic checklist-filter helpers (used by every checklist filter below)
  // ---------------------------------------------------------------------
 
  /**
   * The filter bar cell (the one holding "Customize Columns" + all filters).
   * Scoping to it avoids clashes such as the "Country" footer tab.
   */
  private filterBar(): Locator {
    return this.page
      .locator('td')
      .filter({ has: this.page.getByRole('link', { name: 'Customize Columns' }) })
      .last();
  }
 
  /** The clickable control of a checklist filter (matched by its title, falling back to its text). */
  private filterControl(label: string): Locator {
    const bar = this.filterBar();
    return bar
      .getByTitle(label, { exact: true })
      .or(bar.getByText(label, { exact: true }))
      .first();
  }
 
  /** Options of the currently open checklist panel (only one panel is visible at a time). */
  private visibleOptions(): Locator {
    return this.page.locator(SELECTORS.dropdownChecklistLabel).filter({ visible: true });
  }
 
  /** Search box of the currently open checklist panel (not every filter has one). */

  private visibleSearchBox(): Locator {
    return
     this.filterBar().getByRole('textbox').filter({ visible: true }).first();

  } 
 
  /** Closes whichever checklist panel is open. */
  async closeOpenFilter(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page
      .locator(SELECTORS.dropdownChecklistOverlay)
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {});
  }
 
  /** Opens a checklist filter panel, retrying if the click doesn't open it. */
  async openChecklistFilter(label: ChecklistFilterLabel): Promise<void> {
    await pause(this.page, `Opening ${label} filter...`);
    await this.closeOpenFilter(); // make sure no other panel is open
 
    const control = this.filterControl(label);
    await expect(async () => {
      if ((await this.visibleOptions().count()) === 0) {
        await control.click();
      }
      await expect(this.visibleOptions().first()).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15_000 });
 
    await pause(this.page, `${label} filter opened.`);
  }
 
  /**
   * Opens a checklist filter, searches each value, checks it, and closes the panel.
   * Typing tries the value as given first, then lowercase (some lists, e.g.
   * Brand, are lowercase and the live-search is case-sensitive).
   */
  async selectChecklistFilter(label: ChecklistFilterLabel, values: string | string[]): Promise<void> {
    const list = Array.isArray(values) ? values : [values];
 
    for (const value of list) {
      await this.openChecklistFilter(label);
 
      const option = this.visibleOptions().filter({
        hasText: new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, 'i'),
      });
 
      const search = this.visibleSearchBox();
      if (await search.isVisible()) {
        for (const term of [...new Set([value, value.toLowerCase()])]) {
          await search.click();
          await search.clear();
          // Real keystrokes — the live-filter is driven by keyup/keydown.
          await search.pressSequentially(term, { delay: 50 });
          const found = await expect(option)
            .toHaveCount(1, { timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          if (found) break;
        }
      }
 
      await expect(option, `"${value}" not found in ${label} filter`).toHaveCount(1, { timeout: 10_000 });
 
      const checkbox = option.locator('..').locator('input[type="checkbox"]');
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await pause(this.page, `Checked "${value}" in ${label} filter.`);
 
      await this.closeOpenFilter();
    }
  }
 
  /** Clears every selection in a checklist filter using its "None" link. */
  async clearChecklistFilter(label: ChecklistFilterLabel): Promise<void> {
    await this.openChecklistFilter(label);
    await this.filterBar().getByRole('link', { name: 'None', exact: true }).filter({ visible: true }).click();
    await pause(this.page, `Cleared all selections in ${label} filter.`);
    await this.closeOpenFilter();
  }
 
  /** Selects every option in a checklist filter using its "All" link. */
  async selectAllInChecklistFilter(label: ChecklistFilterLabel): Promise<void> {
    await this.openChecklistFilter(label);
    await this.filterBar().getByRole('link', { name: 'All', exact: true }).filter({ visible: true }).click();
    await pause(this.page, `Selected all options in ${label} filter.`);
    await this.closeOpenFilter();
  }
 
  // ---------------------------------------------------------------------
  // Brand filter (kept as-is — proven working)
  // ---------------------------------------------------------------------
 
  /** Opens the Brand filter panel, retrying the click if it flickers open/closed. */
  async openBrandFilter(): Promise<Locator> {
    await pause(this.page, 'Opening Brand filter...');
    const brandLabel = this.page.getByText('Brand', { exact: true });
    const brandSearch = this.page.locator(SELECTORS.brandSearchInput);
 
    // Already open? Don't click again — a second click closes the panel.
    if (await brandSearch.isVisible()) return brandSearch;
 
    await expect(async () => {
      await brandLabel.click();
      await expect(brandSearch).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15_000 });
 
    await pause(this.page, 'Brand filter opened.');
    return brandSearch;
  }
 
  /** Opens the Brand filter, searches the brand, checks it, and closes the panel. */
  async selectBrand(brandName: string): Promise<void> {
    const brandSearch = await this.openBrandFilter();
    await brandSearch.click();
    await brandSearch.clear();
 
    // Widget's live-search is case-sensitive and options are lowercase.
    const searchTerm = brandName.toLowerCase();
    await brandSearch.pressSequentially(searchTerm, { delay: 50 });
    await pause(this.page, `Typed "${searchTerm}" into brand search field.`);
 
    // Scope to the Brand dropdown ("amazon" also exists in #platform-filter)
    // and only the option the live-filter left visible.
    const brandOption = this.page
      .locator('#brands-filter')
      .locator(SELECTORS.dropdownChecklistLabel, {
        hasText: new RegExp(`^\\s*${escapeRegex(brandName)}\\s*$`, 'i'),
      })
      .filter({ visible: true });
    await expect(brandOption).toHaveCount(1, { timeout: 10_000 });
 
    const brandOptionCheckbox = brandOption.locator('..').locator('input[type="checkbox"]');
    await brandOptionCheckbox.check();
    await expect(brandOptionCheckbox).toBeChecked();
    await pause(this.page, `Checked "${brandName}" checkbox.`);
 
    await this.closeOpenFilter();
  }
 
  /** "Selected Brands: <brand>" info bar shown after GO. */
  async expectSelectedBrand(brandName: string): Promise<void> {
    await expect(this.page.getByText(new RegExp(`Selected Brands?:.*${escapeRegex(brandName)}`, 'i'))).toBeVisible({
      timeout: 15_000,
    });
  }
 
  /**
   * Validates brand data after GO: Total (footer) row is visible, the
   * "Select Filters to fetch data" placeholder is gone, and the Brands
   * footer tab lists the selected brand.
   */
  async expectBrandDataInFooter(brandName: string): Promise<void> {
    await this.expectResultsLoaded(); // Total row visible
    await expect(this.resultsTbody()).not.toContainText(/Select Filters to fetch data|No data/i);
 
    await this.openBrandsTab();
    await waitForThrobberHidden(this.page);
    await expect(this.resultsTbody()).toContainText(new RegExp(escapeRegex(brandName), 'i'), { timeout: 15_000 });
    await pause(this.page, `Brands tab shows data for "${brandName}".`);
  }
 
  // ---------------------------------------------------------------------
  // Account Manager filter (kept as-is — proven working)
  // ---------------------------------------------------------------------
 
  async selectAccountManager(name: string): Promise<void> {
    await pause(this.page, 'Opening Account Manager filter...');
    const accountManagerLabel = this.page.getByText('Account Manager', { exact: true });
    await accountManagerLabel.click();
    await pause(this.page, 'Account Manager filter opened. Waiting for search field to appear...');
 
    const search = this.page.locator(SELECTORS.accountManagerSearchInput);
 
    // The filter widget can still be finishing initialization right after
    // landing on this page via a click-through — retry the open once.
    const searchVisible = await expect(search)
      .toBeVisible({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
 
    if (!searchVisible) {
      await accountManagerLabel.click();
      await pause(this.page, 'Re-clicked Account Manager after the panel did not open.');
      await expect(search).toBeVisible({ timeout: 15_000 });
    }
 
    await selectFromSearchDropdown(this.page, search, name);
    await pause(this.page, `Selected "${name}" from the Account Manager dropdown.`);
 
    await this.closeOpenFilter();
  }
 
  // ---------------------------------------------------------------------
  // Other checklist filters (one-line wrappers — pass one value or an array)
  // ---------------------------------------------------------------------
 
  async selectSiteplugProducts(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Siteplug Products', values);
  }
 
  async selectSalesManager(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Sales Manager', values);
  }
 
  async selectBdam(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('BDAM', values);
  }
 
  async selectPubSalesManager(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Pub Sales Manager', values);
  }
 
  async selectDeviceCategory(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Device Category', values);
  }
 
  async selectCountry(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Country', values);
  }
 
  async selectPubAm(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Pub AM', values);
  }
 
  async selectPlatform(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Platform', values);
  }
 
  async selectDealType(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Deal Type', values);
  }
 
  async selectOnboardingYear(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('OnBoarding Year', values);
  }
 
  async selectPublisher(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Publisher', values);
  }
 
  async selectPublisherDealType(values: string | string[]): Promise<void> {
    await this.selectChecklistFilter('Publisher Deal Type', values);
  }
 
  // ---------------------------------------------------------------------
  // Native <select> filters
  // ---------------------------------------------------------------------
 
  /** Brand Type is a plain <select> (no search panel). */
  async selectBrandType(option: BrandTypeOption): Promise<void> {
    const select = this.filterBar()
      .locator('select')
      .filter({ has: this.page.locator('option', { hasText: 'Homepage Brand' }) });
    await select.selectOption({ label: option });
    await expect(select.locator('option:checked')).toHaveText(option);
    await pause(this.page, `Selected Brand Type "${option}".`);
  }
 
  async selectBudgetType(option: BudgetTypeOption): Promise<void> {
    const select = this.page.getByRole('combobox', { name: 'Select budget Type' });
    await select.selectOption({ label: option });
    await expect(select.locator('option:checked')).toHaveText(option);
    await pause(this.page, `Selected Budget Type "${option}".`);
  }
 
  /**
   * Selects the metric in the Number filter. If the page then shows an
   * operator / value input, extend this method with those fields.
   */
  async selectNumberFilter(option: NumberFilterOption): Promise<void> {
    const select = this.page.getByRole('combobox', { name: 'Select Number Filter' });
    await select.selectOption({ label: option });
    await expect(select.locator('option:checked')).toHaveText(option);
    await pause(this.page, `Selected Number Filter "${option}".`);
  }
 
  // ---------------------------------------------------------------------
  // Shared filter / results actions
  // ---------------------------------------------------------------------
 
  async applyFilters(): Promise<void> {
    await applyFiltersAction(this.page);
    await pause(this.page, 'Clicked Go — filter(s) applied.');
  }
 
  async expectResultsLoaded(): Promise<void> {
    await expectTotalRowVisible(this.page);
    await pause(this.page, 'Data records loaded — Total row is visible.');
  }
 
  resultsTbody(): Locator {
    return locateResultsTbody(this.page);
  }
 
  async openTab(tabName: string): Promise<void> {
    await clickFooterTab(this.page, tabName);
    await pause(this.page, `Clicked on ${tabName} tab to view data.`);
  }
 
  async openDailyTab(): Promise<void> {
    await this.openTab(STATS_TABS.daily);
  }
 
  async openAdvertiserTab(): Promise<void> {
    await this.openTab(STATS_TABS.advertiser);
  }
 
  async openBrandsTab(): Promise<void> {
    await this.openTab(STATS_TABS.brands);
  }
 
  /**
   * Hovers the first result row's drill-down arrow and opens the given
   * drill-down type in a new tab, verifying it loaded with data.
   */
  async drillDownFirstRow(drillDownType: DrillDownType, debugScreenshotName: string): Promise<Page> {
    const tbody = this.resultsTbody();
    await expect(tbody).toBeVisible({ timeout: 15_000 });
 
    const icon = await revealDrillDownIcon(this.page, tbody, drillDownType, debugScreenshotName);
    await pause(this.page, 'Hovered over the first record\'s arrow to reveal the drill-down menu.');
 
    const newTab = await openDrillDownInNewTab(this.page, icon, drillDownType);
    console.log(`Drill-down (new tab) loaded and verified: ${newTab.url()}`);
    return newTab;
  }
 
  /**
   * Reads the "Country" drill-down icon's href directly and navigates a new
   * tab to it. Used on the Daily view, where hovering the row doesn't
   * reliably reveal that particular icon.
   */
  async openCountryDrillDownByHref(fromTab: Page): Promise<Page> {
    const countryTabIcon = fromTab.locator(`a.anchor_tab_new[href*="stats_type=${DRILL_DOWN_TYPES.country}"]`);
    await expect(countryTabIcon).toHaveCount(1);
 
    const href = await countryTabIcon.getAttribute('href');
    if (!href) {
      await fromTab.screenshot({ path: 'debug-daily-country-href-missing.png', fullPage: true });
      throw new Error('Country tab icon has no href attribute — see debug-daily-country-href-missing.png.');
    }
 
    const countryUrl = new URL(href, fromTab.url()).toString();
    const countryPage = await fromTab.context().newPage();
    await countryPage.goto(countryUrl);
    await pause(countryPage, 'Navigated new tab directly to Country tab URL.');
 
    await expect(countryPage).toHaveURL(new RegExp(`stats_type=${DRILL_DOWN_TYPES.country}`));
    await waitForThrobberHidden(countryPage);
    await expectTotalRowVisible(countryPage);
    console.log('Country tab (new tab) loaded and verified:', countryPage.url());
    return countryPage;
  }
 
  /** Sorts the current page's results by Net Revenue (click = Descending on first sort). */
  async sortNetRevenueDescending(onPage: Page = this.page): Promise<void> {
    await sortByNetRevenue(onPage);
    await pause(onPage, 'Clicked Net Revenue column header — sorting Descending.');
  }
}
 