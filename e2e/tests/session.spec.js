import { test, expect } from "@playwright/test";
import { loginAsGuest } from "./helpers.js";

test.describe("Session flow", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
  });

  test("idle screen shows all 5 blocks", async ({ page }) => {
    for (const title of ["Fretboard Mastery", "Technique Practice", "Rhythm Training", "Improvisation", "Learn a Song"]) {
      await expect(page.locator(`text=${title}`)).toBeVisible();
    }
  });

  test("can edit block duration", async ({ page }) => {
    // Click the duration input for the first block
    const firstInput = page.locator("input[type='number']").first();
    await firstInput.fill("3");
    await expect(firstInput).toHaveValue("3");
  });

  test("start full session shows timer and block title", async ({ page }) => {
    await page.getByRole("button", { name: /start session/i }).click();
    await expect(page.locator("text=Fretboard Mastery")).toBeVisible();
    await expect(page.locator("text=/\\d{1,2}:\\d{2}/")).toBeVisible();
  });

  test("pause and resume session", async ({ page }) => {
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=/\\d{1,2}:\\d{2}/");

    await page.getByRole("button", { name: /pause/i }).click();
    await expect(page.getByRole("button", { name: /resume/i })).toBeVisible();

    await page.getByRole("button", { name: /resume/i }).click();
    await expect(page.getByRole("button", { name: /pause/i })).toBeVisible();
  });

  test("next block advances to second block", async ({ page }) => {
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=Fretboard Mastery");

    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.locator("text=Technique Practice")).toBeVisible();
  });

  test("previous button goes back to first block", async ({ page }) => {
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=Fretboard Mastery");

    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.locator("text=Technique Practice")).toBeVisible();

    await page.getByRole("button", { name: /prev/i }).click();
    await expect(page.locator("text=Fretboard Mastery")).toBeVisible();
  });

  test("adjust time - click timer to show +/- buttons", async ({ page }) => {
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=/\\d{1,2}:\\d{2}/");

    // Click the timer to reveal adjust buttons
    await page.locator("text=/\\d{1,2}:\\d{2}/").first().click();
    await expect(page.getByRole("button", { name: /\+1/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /-1/i })).toBeVisible();
  });

  test("complete session shows done screen", async ({ page }) => {
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=/\\d{1,2}:\\d{2}/");

    // Skip through all 5 blocks
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: /next/i }).click();
    }
    await expect(page.locator("text=/done|complete|great|session/i")).toBeVisible();
  });

  test("start single fretboard block session", async ({ page }) => {
    // Click the solo button on the fretboard row (the small play icon)
    const fretRow = page.locator("text=Fretboard Mastery").locator("..").locator("..");
    await fretRow.getByRole("button").last().click();
    await expect(page.locator("text=Fretboard Mastery")).toBeVisible();
    await expect(page.locator("text=/\\d{1,2}:\\d{2}/")).toBeVisible();
  });

  test("stop session returns to idle screen", async ({ page }) => {
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=/\\d{1,2}:\\d{2}/");

    // Click next through all blocks to finish
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: /next/i }).click();
    }
    // Should see a "Start" button again on the done/idle screen
    await page.getByRole("button", { name: /start|again/i }).first().click();
    await expect(page.getByRole("button", { name: /start session/i })).toBeVisible();
  });

});
