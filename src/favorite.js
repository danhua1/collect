const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { loadConfig, authDir } = require("./config");
const { loginWithAccount } = require("./login");

const EXECUTABLE_PATH = "/Users/dusiyuan/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

function getStoragePath(siteName, accountName) {
  return path.join(authDir, `${siteName || "site"}-${accountName}.json`);
}

function listConfiguredAccounts() {
  const accountsConfig = loadConfig("accounts");
  return Object.keys(accountsConfig.accounts || {});
}

async function favoriteItem(accountName, itemUrl, options = {}) {
  const siteConfig = loadConfig("site");
  const accountsConfig = loadConfig("accounts");
  const resolvedAccount = accountName || accountsConfig.defaultAccount;
  const storageStatePath = getStoragePath(siteConfig.siteName, resolvedAccount);

  if (!fs.existsSync(storageStatePath)) {
    await loginWithAccount(resolvedAccount, { headless: false });
  }

  if (!fs.existsSync(storageStatePath)) {
    throw new Error(`Missing saved session after login: ${storageStatePath}`);
  }

  const browser = await chromium.launch({
    executablePath: EXECUTABLE_PATH,
    headless: options.headless || siteConfig.browser?.headless || false
  });

  try {
    const context = await browser.newContext({
      ...(siteConfig.browserContext || {}),
      storageState: storageStatePath
    });
    const page = await context.newPage();

    await page.goto(itemUrl, {
      waitUntil: siteConfig.navigation?.waitUntil || "domcontentloaded",
      timeout: siteConfig.navigation?.timeoutMs || 30000
    });
    await page.waitForTimeout(8000);

    if (await page.locator("text=已收藏").count()) {
      const result = {
        accountName: resolvedAccount,
        status: "already_favorited"
      };
      console.log(`Account "${resolvedAccount}": item is already favorited.`);
      return result;
    }

    const favoriteButton = page.locator("span.icon-text", { hasText: "收藏" }).first();
    await favoriteButton.click({ force: true });
    await page.waitForTimeout(3000);

    const hasCollectedText = await page.locator("text=已收藏").count();
    const hasSuccessToast = await page.locator("text=收藏成功").count();

    if (!hasCollectedText && !hasSuccessToast) {
      throw new Error("Favorite action may not have completed.");
    }

    const result = {
      accountName: resolvedAccount,
      status: "favorited"
    };
    console.log(`Account "${resolvedAccount}": favorite action completed.`);
    return result;
  } finally {
    await browser.close();
  }
}

async function favoriteItemForAccounts(itemUrl, accountNames, options = {}) {
  const targets = Array.isArray(accountNames) && accountNames.length > 0
    ? accountNames
    : listConfiguredAccounts();
  const results = [];

  for (const accountName of targets) {
    try {
      const result = await favoriteItem(accountName, itemUrl, options);
      results.push(result || { accountName, status: "unknown" });
    } catch (error) {
      results.push({
        accountName,
        status: "failed",
        error: error.message
      });
    }
  }

  return results;
}

module.exports = {
  favoriteItem,
  favoriteItemForAccounts,
  listConfiguredAccounts
};
