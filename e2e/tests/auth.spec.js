import { test, expect } from "@playwright/test";
import { loginAsGuest, registerAndLogin, logout, randUser } from "./helpers.js";

test.describe("Authentication", () => {

  test("guest login lands on main app", async ({ page }) => {
    await loginAsGuest(page);
    await expect(page.locator("header")).toContainText("Bass Trainer");
    await expect(page.getByRole("button", { name: /logout/i })).toBeVisible();
  });

  test("guest badge is shown in header", async ({ page }) => {
    await loginAsGuest(page);
    await expect(page.locator("header")).toContainText("guest");
  });

  test("register new account", async ({ page }) => {
    const user = randUser();
    await registerAndLogin(page, user, "password123");
    await expect(page.locator("header")).toContainText("Bass Trainer");
    await expect(page.getByRole("button", { name: /stats/i })).toBeVisible();
  });

  test("login with existing account", async ({ page }) => {
    const user = randUser();
    // register first
    await registerAndLogin(page, user, "password123");
    await logout(page);

    // now log back in
    await page.goto("/");
    await page.locator("input[autocomplete='username']").fill(user);
    await page.locator("input[type='password']").fill("password123");
    await page.getByRole("button", { name: /^login$/i }).click();
    await expect(page.locator("header")).toContainText("Bass Trainer");
  });

  test("wrong password shows error", async ({ page }) => {
    const user = randUser();
    await registerAndLogin(page, user, "password123");
    await logout(page);

    await page.goto("/");
    await page.locator("input[autocomplete='username']").fill(user);
    await page.locator("input[type='password']").fill("wrongpassword");
    await page.getByRole("button", { name: /^login$/i }).click();
    await expect(page.locator("text=/invalid/i")).toBeVisible();
  });

  test("duplicate username shows error", async ({ page }) => {
    const user = randUser();
    await registerAndLogin(page, user, "password123");
    await logout(page);

    await page.goto("/");
    await page.getByRole("button", { name: /create account/i }).click();
    await page.locator("input[autocomplete='username']").fill(user);
    await page.locator("input[type='password']").fill("password123");
    await page.getByRole("button", { name: /create account/i }).last().click();
    await expect(page.locator("text=/taken/i")).toBeVisible();
  });

  test("logout returns to login screen", async ({ page }) => {
    await loginAsGuest(page);
    await logout(page);
    await expect(page.getByRole("button", { name: /continue as guest/i })).toBeVisible();
  });

});
