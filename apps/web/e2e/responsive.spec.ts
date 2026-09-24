import { expect, test } from "@playwright/test";

const viewports = [
  [375, 667],
  [667, 375],
  [844, 390],
  [932, 430],
  [1280, 720],
  [1920, 1080],
] as const;

for (const [width, height] of viewports) {
  test(`accueil sans débordement à ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByLabel("Pseudo")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Créer une partie" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/responsive-${width}x${height}.png`,
      fullPage: true,
    });
  });
}

test("les préférences de mouvement réduit sont transmises au navigateur", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  await context.close();
});
