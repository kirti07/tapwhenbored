/* Opening an end card without playing a game to completion.
 *
 * Every card is shown by the same class change the game itself makes —
 * bindOverlay() watches that class rather than exposing an API — so this is
 * the game's own trigger and not a test-only path. Reaching eight genuine end
 * cards would mean playing eight games to completion for assertions that are
 * about shared shell markup.
 *
 * bubble-tap shows a card by *removing* `.hidden`, and its end card is
 * #gameOverOverlay, not #overlay.
 */
export async function openEndCard(page, slug) {
  if (slug === "bubble-tap") {
    await page.evaluate(() =>
      document.getElementById("gameOverOverlay").classList.remove("hidden"),
    );
    return page.locator("#gameOverOverlay");
  }
  await page.evaluate(() => document.getElementById("overlay").classList.add("show"));
  return page.locator("#overlay");
}
