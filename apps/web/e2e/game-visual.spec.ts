import { expect, request, test } from "@playwright/test";
import { makeVictoryFixture } from "./fixture-utils";

const viewports = [
  [667, 375],
  [844, 390],
  [932, 430],
  [1280, 720],
  [1920, 1080],
] as const;

async function playablePage(pages: import("@playwright/test").Page[]) {
  await expect
    .poll(async () => {
      for (const page of pages)
        if (await page.locator('[data-testid="card"]:not([disabled])').count())
          return true;
      return false;
    })
    .toBe(true);
  for (const page of pages)
    if (await page.locator('[data-testid="card"]:not([disabled])').count())
      return page;
  throw new Error("Aucune carte jouable");
}

for (const [width, height] of viewports) {
  test(`écrans de jeu inspectables à ${width}x${height}`, async ({
    browser,
  }) => {
    test.setTimeout(150000);
    const api = await request.newContext({ baseURL: "http://127.0.0.1:3000" });
    const fixture = await api.post("/__test/fixture", {
      data: { game: makeVictoryFixture() },
    });
    expect(fixture.ok()).toBe(true);
    const prepared = (await fixture.json()) as {
      code: string;
      tokens: string[];
      participants: Array<{ id: string }>;
    };
    const contexts = await Promise.all(
      prepared.tokens.map((_token, index) =>
        browser.newContext({
          viewport: { width, height },
          reducedMotion: "reduce",
        }),
      ),
    );
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    const shot = (name: string, page = pages[0]!) =>
      page.screenshot({
        path: `test-results/game-${name}-${width}x${height}.png`,
        fullPage: true,
      });
    try {
      for (const [index, page] of pages.entries()) {
        await page.addInitScript(
          ({ code, token, participantId }) =>
            sessionStorage.setItem(
              "belote-session",
              JSON.stringify({ code, token, participantId }),
            ),
          {
            code: prepared.code,
            token: prepared.tokens[index]!,
            participantId: prepared.participants[index]!.id,
          },
        );
        await page.goto("/");
        await expect(page.locator(".game-shell")).toBeVisible();
      }
      await expect(
        pages[0]!.getByRole("button", { name: "Lancer la donne suivante" }),
      ).toBeVisible();
      await expect(pages[0]!.locator(".game-table")).toBeInViewport();
      await shot("deal-result");

      await pages[0]!
        .getByRole("button", { name: "Lancer la donne suivante" })
        .click();
      for (const page of pages) {
        await expect(page.getByTestId("local-hand")).toBeVisible();
        await expect(page.getByTestId("card")).toHaveCount(8);
        await expect(page.locator(".game-table")).toBeInViewport();
      }
      const bidder = await (async () => {
        for (const page of pages)
          if (await page.getByRole("button", { name: "Annoncer" }).isVisible())
            return page;
        throw new Error("Aucun enchérisseur");
      })();
      await bidder
        .getByRole("button", { name: "Annoncer" })
        .scrollIntoViewIfNeeded();
      await expect(
        bidder.getByRole("button", { name: "Annoncer" }),
      ).toBeInViewport();
      await expect(
        bidder.getByRole("button", { name: "Passer", exact: true }),
      ).toBeInViewport();
      await shot("bidding", bidder);
      await bidder.getByRole("button", { name: "Annoncer" }).click();
      await expect(
        bidder.getByRole("button", { name: "Annoncer" }),
      ).toBeHidden();
      for (let pass = 0; pass < 3; pass++) {
        const passer = await (async () => {
          for (const page of pages)
            if (
              await page
                .getByRole("button", { name: "Passer", exact: true })
                .isVisible()
            )
              return page;
          throw new Error("Aucun joueur ne peut passer");
        })();
        await passer
          .getByRole("button", { name: "Passer", exact: true })
          .click();
      }
      await expect(pages[0]!.getByText(/Contrat :/)).toBeVisible();
      await shot("hand");

      for (let played = 0; played < 3; played++) {
        const page = await playablePage(pages);
        await page
          .locator('[data-testid="card"]:not([disabled])')
          .first()
          .click();
      }
      await expect(pages[0]!.getByTestId("current-trick")).toContainText(
        /[♠♥♦♣]/,
      );
      await shot("trick");
      for (let played = 3; played < 32; played++) {
        const page = await playablePage(pages);
        await page
          .locator('[data-testid="card"]:not([disabled])')
          .first()
          .click();
      }
      await expect(pages[0]!.getByTestId("game-result")).toBeVisible();
      await expect(pages[0]!.getByText("Partie terminée")).toBeVisible();
      await pages[0]!.getByRole("button", { name: "Dernier pli" }).click();
      await expect(
        pages[0]!.getByRole("dialog", { name: "Dernier pli" }),
      ).toBeVisible();
      await shot("last-trick");
      await pages[0]!.getByRole("button", { name: "Fermer" }).click();
      await shot("game-completed");
    } finally {
      await Promise.all(pages.map((page) => page.close()));
      await Promise.all(contexts.map((context) => context.close()));
      await api.dispose();
    }
  });
}
