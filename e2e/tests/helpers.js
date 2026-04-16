/** Shared helpers for E2E tests */

export async function loginAsGuest(page) {
  await page.goto("/");
  await page.getByRole("button", { name: /continue as guest/i }).click();
  await page.waitForSelector("text=Bass Trainer", { state: "visible" });
}

export async function registerAndLogin(page, username, password) {
  await page.goto("/");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.locator("input[autocomplete='username']").fill(username);
  await page.locator("input[type='password']").fill(password);
  await page.getByRole("button", { name: /create account/i, exact: true }).last().click();
  await page.waitForSelector("text=Bass Trainer", { state: "visible" });
}

export async function logout(page) {
  await page.getByRole("button", { name: /logout/i }).click();
  await page.waitForSelector("button", { state: "visible" });
}

/** Generate a random test username to avoid collisions */
export function randUser() {
  return `test_${Math.random().toString(36).slice(2, 9)}`;
}

/** Start a session and wait for the timer to appear */
export async function startSession(page) {
  await page.getByRole("button", { name: /start session/i }).click();
  await page.waitForSelector("[data-testid='timer'], text=/\\d+:\\d+/");
}

/** Start a single-block session by clicking the solo button for a block type */
export async function startBlockSession(page, blockTitle) {
  const row = page.locator(`text=${blockTitle}`).locator("..");
  await row.getByRole("button").last().click();
  await page.waitForSelector("text=/\\d+:\\d+/");
}
