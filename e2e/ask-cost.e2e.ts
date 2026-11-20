// Journey 3: the cost is shown before every request. The compose screen quotes
// what the ask uses before Send, and nothing is sent to read it.
import { costLine, devSignIn, expect, isAskPost, quotedCost, test, writeAsk } from "./fixtures";

test("the cost is shown before every request", async ({ context, page }) => {
  await devSignIn(context);
  const asks: string[] = [];
  page.on("request", request => { if (isAskPost(request)) asks.push(request.url()); });
  await page.goto("/ask");
  await writeAsk(page);

  const send = page.getByRole("button", { name: "Send ask" });
  await expect(send).toBeVisible();
  await expect(costLine(page)).toBeVisible();
  expect(await quotedCost(page)).toBeGreaterThan(0);
  // The cost line comes before Send in reading order.
  const order = await costLine(page).evaluate((line, button) => Boolean(line.compareDocumentPosition(button as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await send.elementHandle());
  expect(order, "the cost line is read before Send").toBeTruthy();
  expect(asks).toHaveLength(0);
});
