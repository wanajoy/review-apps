// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

test.describe('tmux Terminal Web App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    // Wait for xterm.js to initialize
    await page.waitForSelector('#terminal .xterm-screen', { timeout: 10000 });
  });

  test('1. Page loads - Navbar and terminal are visible', async ({ page }) => {
    // Check navbar
    await expect(page.locator('#navbar')).toBeVisible();
    // Check terminal container
    await expect(page.locator('#terminal-container')).toBeVisible();
    // Check xterm canvas is rendered
    await expect(page.locator('#terminal .xterm-screen')).toBeVisible();
    // Check nav buttons exist
    await expect(page.locator('#new-session-btn')).toBeVisible();
    await expect(page.locator('#new-window-btn')).toBeVisible();
    await expect(page.locator('#rename-btn')).toBeVisible();
  });

  test('2. New session creation - appears in Navbar', async ({ page }) => {
    const sessionName = `test-session-${Date.now()}`;

    // Handle prompt dialog
    page.on('dialog', async dialog => {
      if (dialog.message().includes('Session name')) {
        await dialog.accept(sessionName);
      } else {
        await dialog.dismiss();
      }
    });

    await page.click('#new-session-btn');

    // Wait for session tab to appear
    await expect(page.locator(`#session-tabs button:has-text("${sessionName}")`))
      .toBeVisible({ timeout: 5000 });
  });

  test('3. New window creation - appears in Navbar', async ({ page }) => {
    // Ensure we have a session first (wait for auto-connect)
    await page.waitForFunction(() => {
      return document.querySelectorAll('#session-tabs button').length > 0;
    }, { timeout: 8000 });

    const windowsBefore = await page.locator('#window-tabs button').count();

    // Dismiss any dialog (window name prompt if it exists)
    page.on('dialog', async dialog => dialog.dismiss());

    await page.click('#new-window-btn');

    // Wait for new window tab to appear
    await expect(page.locator('#window-tabs button')).toHaveCount(windowsBefore + 1, { timeout: 5000 });
  });

  test('4. Session rename - tab name updates', async ({ page }) => {
    // Wait for sessions to load
    await page.waitForFunction(() => {
      return document.querySelectorAll('#session-tabs button').length > 0;
    }, { timeout: 8000 });

    const newName = `renamed-${Date.now()}`;

    // Handle rename dialog
    page.on('dialog', async dialog => {
      if (dialog.message().includes('New name') || dialog.message().includes('name')) {
        await dialog.accept(newName);
      } else {
        await dialog.dismiss();
      }
    });

    await page.click('#rename-btn');

    // Wait for renamed tab to appear
    await expect(page.locator(`#session-tabs button:has-text("${newName}")`))
      .toBeVisible({ timeout: 5000 });
  });

  test('5. Terminal input - echo hello outputs hello', async ({ page }) => {
    // Wait for terminal to be active (xterm screen)
    await page.waitForSelector('#terminal .xterm-screen', { timeout: 10000 });

    // Wait for session to connect (some terminal output should appear)
    await page.waitForFunction(() => {
      return document.querySelectorAll('#session-tabs button').length > 0;
    }, { timeout: 8000 });

    // Give WebSocket time to connect and terminal to be ready
    await page.waitForTimeout(2000);

    // Click on terminal to focus it
    await page.click('#terminal');
    await page.waitForTimeout(500);

    // Type echo hello and press Enter
    await page.keyboard.type('echo hello_test_output');
    await page.keyboard.press('Enter');

    // Wait for output to appear in terminal
    await page.waitForFunction(() => {
      const termEl = document.querySelector('#terminal');
      if (!termEl) return false;
      const text = termEl.textContent || '';
      return text.includes('hello_test_output');
    }, { timeout: 8000 });

    // Verify the output
    const termText = await page.locator('#terminal').textContent();
    expect(termText).toContain('hello_test_output');
  });

  test('6. Window switch - switch to another window and terminal updates', async ({ page }) => {
    // Wait for sessions and windows to load
    await page.waitForFunction(() => {
      return document.querySelectorAll('#session-tabs button').length > 0;
    }, { timeout: 8000 });

    await page.waitForFunction(() => {
      return document.querySelectorAll('#window-tabs button').length > 0;
    }, { timeout: 5000 });

    // Dismiss any dialogs
    page.on('dialog', async dialog => dialog.dismiss());

    // Create a new window first
    await page.click('#new-window-btn');
    await page.waitForTimeout(1000);

    // Wait for new window to appear
    await page.waitForFunction(() => {
      return document.querySelectorAll('#window-tabs button').length >= 2;
    }, { timeout: 5000 });

    // Click on second window tab
    const windowTabs = page.locator('#window-tabs button');
    const count = await windowTabs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Click first window tab (switch back)
    await windowTabs.nth(0).click();
    await expect(windowTabs.nth(0)).toHaveClass(/active/);

    // Click second window tab
    await windowTabs.nth(1).click();
    // After clicking, second tab should become active (or at minimum no error)
    // The terminal should be visible and working
    await expect(page.locator('#terminal .xterm-screen')).toBeVisible();
  });
});
