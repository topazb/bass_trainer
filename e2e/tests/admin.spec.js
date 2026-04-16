import { test, expect } from "@playwright/test";
import { loginAsGuest, registerAndLogin, randUser } from "./helpers.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "supersecret";

test.describe("Admin panel", () => {

  test("admin page is reachable", async ({ page }) => {
    await page.goto("/admin");
    // Should see some admin-related content (not 404)
    await expect(page).not.toHaveTitle("404");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("admin login with correct secret shows dashboard", async ({ page }) => {
    await page.goto("/admin");
    const secretInput = page.locator("input[type='password'], input[type='text']").first();
    if (await secretInput.isVisible()) {
      await secretInput.fill(ADMIN_SECRET);
      await page.getByRole("button", { name: /login|enter|access/i }).click();
      await expect(page.locator("text=/users|sessions|stats|total/i")).toBeVisible();
    } else {
      // Already logged in or admin is inline
      await expect(page.locator("text=/users|sessions|stats/i")).toBeVisible();
    }
  });

  test("admin panel shows user table data", async ({ page }) => {
    // Create a user first so there's at least one row
    const user = randUser();
    await registerAndLogin(page, user, "password123");

    // Go to admin
    await page.goto("/admin");
    const secretInput = page.locator("input[type='password'], input[type='text']").first();
    if (await secretInput.isVisible()) {
      await secretInput.fill(ADMIN_SECRET);
      await page.getByRole("button", { name: /login|enter|access/i }).click();
    }
    await expect(page.locator(`text=${user}`)).toBeVisible();
  });

  test("admin with wrong secret shows error", async ({ page }) => {
    await page.goto("/admin");
    const secretInput = page.locator("input[type='password'], input[type='text']").first();
    if (await secretInput.isVisible()) {
      await secretInput.fill("wrongsecret_totally_fake");
      await page.getByRole("button", { name: /login|enter|access/i }).click();
      await expect(page.locator("text=/wrong|invalid|unauthorized|error/i")).toBeVisible();
    }
  });

});
