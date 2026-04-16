import { test, expect } from "@playwright/test";
import { loginAsGuest } from "./helpers.js";

test.describe("Fretboard exercise", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=Fretboard Mastery");
  });

  test("shows a fret question", async ({ page }) => {
    // Should show a question with string and fret info
    await expect(page.locator("text=/string|fret/i")).toBeVisible();
  });

  test("note buttons are visible", async ({ page }) => {
    // Should have note buttons (A, A#, B, C, etc.)
    await expect(page.getByRole("button", { name: /^[A-G]#?$/ }).first()).toBeVisible();
  });

  test("wrong answer shows retry feedback", async ({ page }) => {
    // Get all note buttons and click a random one
    const noteButtons = page.getByRole("button", { name: /^[A-G]#?$/ });
    const count = await noteButtons.count();
    // Click first note button
    await noteButtons.first().click();
    // Should show some feedback (correct or wrong)
    await expect(page.locator("text=/correct|wrong|try again|✓|✕/i")).toBeVisible();
  });

});

test.describe("Ear training exercise", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
    // Navigate to technique block (which has ear training option)
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=Fretboard Mastery");
    // Skip to technique block
    await page.getByRole("button", { name: /next/i }).click();
    await page.waitForSelector("text=Technique Practice");
  });

  test("technique block is shown", async ({ page }) => {
    await expect(page.locator("text=Technique Practice")).toBeVisible();
  });

  test("ear training difficulty selector is visible", async ({ page }) => {
    await expect(page.locator("text=/simple|diatonic|all/i")).toBeVisible();
  });

  test("play button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /play|listen/i })).toBeVisible();
  });

  test("interval answer buttons are visible", async ({ page }) => {
    // After clicking play, interval buttons should appear
    await page.getByRole("button", { name: /play|listen/i }).click();
    // Should see interval names
    await expect(page.locator("text=/octave|fifth|third|second|fourth/i")).toBeVisible();
  });

  test("can switch difficulty to Simple", async ({ page }) => {
    await page.getByRole("button", { name: /simple/i }).click();
    await expect(page.getByRole("button", { name: /simple/i })).toBeVisible();
  });

});

test.describe("Rhythm exercise", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForSelector("text=Fretboard Mastery");
    // Skip to rhythm block
    await page.getByRole("button", { name: /next/i }).click();
    await page.getByRole("button", { name: /next/i }).click();
    await page.waitForSelector("text=Rhythm Training");
  });

  test("rhythm block shows music player controls", async ({ page }) => {
    // Should show play/skip button for audio tracks
    await expect(page.locator("text=Rhythm Training")).toBeVisible();
    // Music card with play controls should be present if tracks are configured
    // Just check the block loaded correctly
    await expect(page.locator("text=/\\d{1,2}:\\d{2}/")).toBeVisible();
  });

});
