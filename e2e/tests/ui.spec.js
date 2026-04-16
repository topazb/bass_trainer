import { test, expect } from "@playwright/test";
import { loginAsGuest, registerAndLogin, randUser } from "./helpers.js";

test.describe("Dark/light mode toggle", () => {

  test("login screen defaults to dark mode", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("toggle switches to light mode", async ({ page }) => {
    await page.goto("/");
    await page.locator("[aria-label*='theme'], [title*='theme'], button:has([class*='toggle'])").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("toggle back to dark mode", async ({ page }) => {
    await page.goto("/");
    // Switch to light
    await page.locator("[aria-label*='theme'], [title*='theme'], button:has([class*='toggle'])").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    // Switch back to dark
    await page.locator("[aria-label*='theme'], [title*='theme'], button:has([class*='toggle'])").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("theme persists after guest login", async ({ page }) => {
    await page.goto("/");
    await page.locator("[aria-label*='theme'], [title*='theme'], button:has([class*='toggle'])").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: /continue as guest/i }).click();
    await page.waitForSelector("text=Bass Trainer");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("main app has theme toggle in header", async ({ page }) => {
    await loginAsGuest(page);
    // ThemeToggle is in the header
    const header = page.locator("header");
    await expect(header.locator("button").last()).toBeVisible();
  });

});

test.describe("Stats panel", () => {

  test("stats button opens stats panel", async ({ page }) => {
    const user = randUser();
    await registerAndLogin(page, user, "password123");
    await page.getByRole("button", { name: /stats/i }).click();
    await expect(page.locator("text=/total|practice|stats/i")).toBeVisible();
  });

  test("stats panel closes on dismiss", async ({ page }) => {
    const user = randUser();
    await registerAndLogin(page, user, "password123");
    await page.getByRole("button", { name: /stats/i }).click();
    await page.waitForSelector("text=/total|practice|stats/i");
    // Close - usually a close button or click outside
    await page.keyboard.press("Escape");
    await expect(page.locator("text=/total|practice/i")).not.toBeVisible();
  });

  test("guest user does not see stats button", async ({ page }) => {
    await loginAsGuest(page);
    // Guest should not have stats button (or it's hidden)
    const statsBtn = page.getByRole("button", { name: /^stats$/i });
    await expect(statsBtn).not.toBeVisible();
  });

});

test.describe("Block selection", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
  });

  test("uncheck a block removes it from session", async ({ page }) => {
    // Find the first block checkbox and uncheck it
    const firstCheckbox = page.locator("input[type='checkbox']").first();
    await firstCheckbox.uncheck();
    // Start session and verify first block is skipped
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=/\\d{1,2}:\\d{2}/");
    await expect(page.locator("text=Fretboard Mastery")).not.toBeVisible();
  });

  test("uncheck all blocks disables start button", async ({ page }) => {
    const checkboxes = page.locator("input[type='checkbox']");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).uncheck();
    }
    await expect(page.getByRole("button", { name: /start session/i })).toBeDisabled();
  });

});
