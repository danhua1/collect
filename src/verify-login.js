const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const site = require("../config/site");
const accounts = require("../config/accounts");

const EXECUTABLE_PATH = "/Users/dusiyuan/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

async function pickVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();

    if (!count) {
      continue;
    }

    try {
      if (await locator.isVisible({ timeout: 1000 })) {
        return locator;
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

async function getLoginTarget(page) {
  const frame = page.frames().find((item) => item.url().includes(site.loginFrame.urlIncludes));
  return frame || page;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE_PATH,
    headless: false,
    slowMo: 300
  });

  const context = await browser.newContext(site.browserContext || {});
  const page = await context.newPage();
  const account = accounts.accounts[accounts.defaultAccount];

  try {
    await page.goto(site.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await page.waitForTimeout(5000);
    console.log(`initialText=${(await page.locator("body").innerText()).slice(0, 1200)}`);

    const loginTarget = await getLoginTarget(page);

    for (const action of site.preLoginActions || []) {
      const selectors = action.selectors || [action.selector];
      const locator = await pickVisible(loginTarget, selectors);
      console.log(`tryingAction=${selectors.join(" | ")}`);
      if (!locator) {
        console.log("actionFound=false");
        continue;
      }
      console.log("actionFound=true");
      console.log(`actionHtml=${await locator.evaluate((node) => node.outerHTML).catch(() => "")}`);
      await locator.click({ timeout: action.timeoutMs || 3000, force: true });
      await page.waitForTimeout(1500);
      console.log(`afterActionText=${(await loginTarget.locator("body").innerText()).slice(0, 1200)}`);
    }

    for (const action of site.preFillActions || []) {
      const selectors = action.selectors || [action.selector];
      const locator = await pickVisible(loginTarget, selectors);
      console.log(`tryingPreFill=${selectors.join(" | ")}`);
      if (!locator) {
        console.log("preFillFound=false");
        continue;
      }
      console.log("preFillFound=true");
      console.log(`preFillHtml=${await locator.evaluate((node) => node.outerHTML).catch(() => "")}`);
      await locator.click({ timeout: action.timeoutMs || 3000, force: true });
      await page.waitForTimeout(1500);
      console.log(`afterPreFillText=${(await loginTarget.locator("body").innerText()).slice(0, 1200)}`);
    }

    const userInput = await pickVisible(loginTarget, site.loginForm.username.selectors);
    const passInput = await pickVisible(loginTarget, site.loginForm.password.selectors);
    const submitBtn = await pickVisible(loginTarget, site.loginForm.submit.selectors);

    console.log(`foundUsername=${Boolean(userInput)}`);
    console.log(`foundPassword=${Boolean(passInput)}`);
    console.log(`foundSubmit=${Boolean(submitBtn)}`);
    console.log(`startUrl=${page.url()}`);
    console.log(`pageText=${(await loginTarget.locator("body").innerText()).slice(0, 1200)}`);

    if (!userInput || !passInput || !submitBtn) {
      throw new Error("Failed to find login form elements.");
    }

    await userInput.fill(account.username);
    await passInput.fill(account.password);

    for (const action of site.preSubmitActions || []) {
      const selectors = action.selectors || [action.selector];
      const locator = await pickVisible(loginTarget, selectors);
      console.log(`tryingPreSubmit=${selectors.join(" | ")}`);
      if (!locator) {
        console.log("preSubmitFound=false");
        continue;
      }
      console.log("preSubmitFound=true");
      console.log(`preSubmitHtml=${await locator.evaluate((node) => node.outerHTML).catch(() => "")}`);
      await locator.click({ timeout: action.timeoutMs || 3000, force: true });
      await page.waitForTimeout(action.afterActionDelayMs || 500);
    }

    await submitBtn.click();
    await page.waitForTimeout(8000);

    console.log(`finalUrl=${page.url()}`);
    const finalTarget = await getLoginTarget(page);
    console.log(`finalText=${(await page.locator("body").innerText()).slice(0, 1500)}`);
    console.log(`finalLoginText=${(await finalTarget.locator("body").innerText()).slice(0, 2000)}`);

    fs.mkdirSync(path.resolve(__dirname, "../.auth"), { recursive: true });
    await context.storageState({
      path: path.resolve(__dirname, "../.auth/verification-state.json")
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
