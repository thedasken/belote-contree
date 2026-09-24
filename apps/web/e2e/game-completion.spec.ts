import { expect, request, test } from "@playwright/test";
import { makeVictoryFixture } from "./fixture-utils";

test("la dernière donne affiche GAME_COMPLETED sur les quatre interfaces", async ({
  browser,
}) => {
  const api = await request.newContext({ baseURL: "http://127.0.0.1:3000" });
  const fixtureGame = makeVictoryFixture();
  const fixture = await api.post("/__test/fixture", {
    data: { game: fixtureGame },
  });
  expect(fixture.ok()).toBe(true);
  const prepared = (await fixture.json()) as {
    code: string;
    tokens: string[];
    participants: Array<{ id: string }>;
  };
  const contexts = await Promise.all(
    prepared.tokens.map((token, index) => browser.newContext()),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
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
      await expect(page.locator(".score")).toBeVisible();
    }
    await pages[0]!
      .getByRole("button", { name: "Lancer la donne suivante" })
      .click();
    for (const page of pages)
      await expect(page.getByTestId("local-hand")).toHaveCount(1);
    const bidder = await (async () => {
      for (const page of pages)
        if (await page.getByRole("button", { name: "Annoncer" }).isVisible())
          return page;
      throw new Error("Aucun enchérisseur");
    })();
    await bidder.getByRole("button", { name: "Annoncer" }).click();
    await expect(bidder.getByRole("button", { name: "Annoncer" })).toBeHidden();
    for (let pass = 0; pass < 3; pass++) {
      const page = await (async () => {
        for (const candidate of pages)
          if (
            await candidate
              .getByRole("button", { name: "Passer", exact: true })
              .isVisible()
          )
            return candidate;
        throw new Error("Aucun joueur ne peut passer");
      })();
      await page.getByRole("button", { name: "Passer", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Passer", exact: true }),
      ).toBeHidden();
    }
    for (let played = 0; played < 32; played++) {
      await expect
        .poll(async () =>
          (
            await Promise.all(
              pages.map((page) =>
                page.locator('[data-testid="card"]:not([disabled])').count(),
              ),
            )
          ).some((count) => count > 0),
        )
        .toBe(true);
      const page = await (async () => {
        for (const candidate of pages)
          if (
            await candidate
              .locator('[data-testid="card"]:not([disabled])')
              .count()
          )
            return candidate;
        throw new Error("Aucune carte jouable");
      })();
      await page
        .locator('[data-testid="card"]:not([disabled])')
        .first()
        .click();
    }
    for (const page of pages) {
      await expect(page.getByTestId("game-result")).toBeVisible();
      await expect(page.getByText("Partie terminée")).toBeVisible();
      await expect(page.getByTestId("game-result")).toContainText(
        /Équipe [AB] gagnante|Égalité finale/,
      );
      await expect(page.getByTestId("game-result")).toContainText(
        /A \d+ — B \d+/,
      );
      await expect(
        page.getByRole("button", { name: "Lancer la donne suivante" }),
      ).toHaveCount(0);
    }
  } finally {
    await Promise.all(pages.map((page) => page.close()));
    await Promise.all(contexts.map((context) => context.close()));
    await api.dispose();
  }
});
