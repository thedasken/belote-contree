import { expect, test } from "@playwright/test";

test("quatre joueurs configurent, démarrent et reprennent la partie", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [1, 2, 3, 4].map(() => browser.newContext()),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    await pages[0].goto("/");
    await pages[0].getByLabel("Pseudo").fill("Alice");
    await pages[0].getByRole("button", { name: "Créer une partie" }).click();
    await expect(pages[0].getByText("SALON PRIVÉ")).toBeVisible();
    await expect(
      pages[0].getByRole("button", { name: "Démarrer la partie" }),
    ).toBeDisabled();
    const code = await pages[0].locator("h1").innerText();
    for (const [page, name] of pages
      .slice(1)
      .map(
        (page, index) => [page, ["Bob", "Carol", "David"][index]] as const,
      )) {
      await page.goto("/");
      await page.getByLabel("Pseudo").fill(name);
      await page.getByLabel("Code du salon").fill(code);
      await page.getByRole("button", { name: "Rejoindre" }).click();
      await expect(page.getByText("SALON PRIVÉ")).toBeVisible();
    }
    await expect(pages[0].getByText("4/4 joueurs")).toBeVisible();
    await expect(
      pages[1].getByRole("button", { name: "Démarrer la partie" }),
    ).toHaveCount(0);
    await expect(pages[1].locator(".seat select")).toHaveCount(0);

    for (const [index, team] of ["B", "B", "A", "A"].entries()) {
      await pages[0]
        .locator(".seat")
        .nth(index)
        .locator("select")
        .first()
        .selectOption(team);
      await expect(pages[0].locator(".seat").nth(index)).toContainText(
        `Équipe ${team}`,
      );
    }
    for (const page of pages) {
      await expect(page.getByText("4/4 joueurs")).toBeVisible();
      for (const [index, name] of [
        "Alice",
        "Bob",
        "Carol",
        "David",
      ].entries()) {
        await expect(page.locator(".seat").nth(index)).toContainText(name);
      }
      for (const [index, team] of ["B", "B", "A", "A"].entries()) {
        await expect(page.locator(".seat").nth(index)).toContainText(
          `Équipe ${team}`,
        );
      }
    }

    const start = pages[0].getByRole("button", { name: "Démarrer la partie" });
    await expect(start).toBeEnabled();
    await start.click();
    for (const page of pages) {
      await expect(page.locator(".game-shell")).toBeVisible();
      await expect(page.getByTestId("local-hand")).toBeVisible();
      await expect(page.locator(".score")).toContainText("Nous : 0");
      await expect(page.locator(".score")).toContainText("Eux : 0");
    }

    // Enchère depuis l'interface : un joueur annonce, les trois suivants passent.
    const bidder = await (async () => {
      for (const page of pages)
        if (await page.getByRole("button", { name: "Annoncer" }).isVisible())
          return page;
      throw new Error("Aucun joueur actif");
    })();
    await bidder.getByRole("button", { name: "Annoncer" }).click();
    await expect(bidder.getByRole("button", { name: "Annoncer" })).toBeHidden();
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
      await passer.getByRole("button", { name: "Passer", exact: true }).click();
      await expect(
        passer.getByRole("button", { name: "Passer", exact: true }),
      ).toBeHidden();
    }
    await expect(pages[0].locator(".player-contract").first()).toBeVisible();

    // Chaque carte est choisie par le navigateur du joueur actif, selon l'état affiché.
    let reconnected = false;
    for (let played = 0; played < 32; played++) {
      await expect
        .poll(
          async () => {
            for (const page of pages)
              if (
                await page
                  .locator('[data-testid="card"]:not([disabled])')
                  .count()
              )
                return true;
            return false;
          },
          {
            timeout: 10000,
            message: `Aucune carte jouable au tour ${played + 1}`,
          },
        )
        .toBe(true);
      let actor = pages[0]!;
      for (let index = 0; index < pages.length; index++) {
        if (
          await pages[index]!.locator(
            '[data-testid="card"]:not([disabled])',
          ).count()
        ) {
          actor = pages[index]!;
          break;
        }
      }
      const before = await actor.locator('[data-testid="card"]').count();
      await actor
        .locator('[data-testid="card"]:not([disabled])')
        .first()
        .click();
      await expect(actor.locator('[data-testid="card"]')).toHaveCount(
        before - 1,
      );
      for (const page of pages)
        await expect(page.getByTestId("completed-tricks")).toHaveCount(1);
      if (played === 1) {
        const target = await (async () => {
          for (const page of pages)
            if (
              await page.locator('[data-testid="card"]:not([disabled])').count()
            )
              return page;
          throw new Error("Aucun joueur actif après deux cartes");
        })();
        const handBefore = await target
          .locator('[data-testid="card"]')
          .allTextContents();
        await expect(
          target.getByTestId("current-trick").locator(".playing-card"),
        ).toHaveCount(2);
        await target.reload();
        await expect(target.getByTestId("local-identity")).toBeVisible();
        await expect(target.locator(".game-table")).toBeVisible();
        await expect(
          target.getByTestId("current-trick").locator(".playing-card"),
        ).toHaveCount(2);
        await expect(target.locator('[data-testid="card"]')).toHaveText(
          handBefore,
        );
        await expect
          .poll(() =>
            target.locator('[data-testid="card"]:not([disabled])').count(),
          )
          .toBeGreaterThan(0);
        reconnected = true;
      }
    }
    expect(reconnected).toBe(true);
    for (const page of pages)
      await expect(page.getByTestId("completed-tricks")).toHaveText(
        "Plis terminés : 8",
      );
    await pages[0].getByRole("button", { name: "Dernier pli" }).click();
    await expect(
      pages[0].getByRole("dialog", { name: "Dernier pli" }),
    ).toBeVisible();
    await pages[0].getByRole("button", { name: "Fermer" }).click();

    await pages[0]
      .getByRole("button", { name: "Lancer la donne suivante" })
      .click();
    for (const page of pages)
      await expect(page.getByTestId("local-hand")).toBeVisible();
    await pages[1].reload();
    await expect(pages[1].getByTestId("local-hand")).toBeVisible();
    await expect(pages[1].getByTestId("local-hand")).toContainText("Bob");
    await expect(pages[1].locator('[data-testid="card"]')).toHaveCount(8);
  } finally {
    await Promise.all(pages.map((page) => page.close()));
    await Promise.all(contexts.map((context) => context.close()));
  }
});
