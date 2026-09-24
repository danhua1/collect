const fs = require("fs");
const path = require("path");
const { loadConfig, authDir } = require("./config");
const { launchChromium, wait } = require("./browser");
const { loginWithAccount } = require("./login");

function getStoragePath(siteName, accountName) {
  return path.join(authDir, `${siteName || "site"}-${accountName}.json`);
}

function listConfiguredAccounts() {
  const accountsConfig = loadConfig("accounts");
  return Object.keys(accountsConfig.accounts || {});
}

function isRetryableFavoriteLoginError(error) {
  return Boolean(
    error &&
    typeof error.message === "string" &&
    (
      error.message.includes("Frame was detached") ||
      error.message.includes("Target page, context or browser has been closed")
    )
  );
}

async function ensureLoginWithRetry(accountName, options = {}) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await loginWithAccount(accountName, options);
      return;
    } catch (error) {
      lastError = error;

      if (!isRetryableFavoriteLoginError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function buildFavoriteDiagnostics(page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const normalizedText = bodyText.replace(/\s+/g, " ").trim();

  return {
    finalUrl: page.url(),
    hasCollectedText: await page.locator("text=已收藏").count().catch(() => 0),
    hasFavoriteText: await page.locator("text=收藏").count().catch(() => 0),
    hasSuccessToast: await page.locator("text=收藏成功").count().catch(() => 0),
    redirectedToLogin: page.url().includes("/show_login")
      || await page.locator("text=第三方账号登录").count().catch(() => 0)
      || await page.locator("text=网易邮箱账号登录").count().catch(() => 0),
    bodySnippet: normalizedText.slice(0, 300)
  };
}

async function favoriteItem(accountName, itemUrl, options = {}) {
  const siteConfig = loadConfig("site");
  const accountsConfig = loadConfig("accounts");
  const resolvedAccount = accountName || accountsConfig.defaultAccount;
  const storageStatePath = getStoragePath(siteConfig.siteName, resolvedAccount);

  if (!fs.existsSync(storageStatePath)) {
    await ensureLoginWithRetry(resolvedAccount, { headless: false });
  }

  if (!fs.existsSync(storageStatePath)) {
    throw new Error(`Missing saved session after login: ${storageStatePath}`);
  }

  return attemptFavoriteWithSession(resolvedAccount, itemUrl, options, 0);
}

async function attemptFavoriteWithSession(accountName, itemUrl, options = {}, retryCount = 0) {
  const siteConfig = loadConfig("site");
  const storageStatePath = getStoragePath(siteConfig.siteName, accountName);

  const browser = await launchChromium(siteConfig, options);

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
        accountName,
        status: "already_favorited"
      };
      console.log(`Account "${accountName}": item is already favorited.`);
      return result;
    }

    const favoriteButton = page.locator("span.icon-text", { hasText: "收藏" }).first();
    await favoriteButton.click({ force: true });
    await page.waitForTimeout(3000);

    const diagnostics = await buildFavoriteDiagnostics(page);
    const { hasCollectedText, hasSuccessToast, redirectedToLogin } = diagnostics;

    if (redirectedToLogin && retryCount === 0) {
      console.log(`Account "${accountName}": session expired for favorite action, refreshing login.`);
      await browser.close();
      await ensureLoginWithRetry(accountName, {
        headless: false,
        fresh: true
      });
      return attemptFavoriteWithSession(accountName, itemUrl, options, retryCount + 1);
    }

    if (!hasCollectedText && !hasSuccessToast) {
      throw new Error(`Favorite action may not have completed. ${JSON.stringify(diagnostics)}`);
    }

    const result = {
      accountName,
      status: "favorited"
    };
    console.log(`Account "${accountName}": favorite action completed.`);
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

    await wait(options.accountIntervalMs || 1200);
  }

  return results;
}

module.exports = {
  favoriteItem,
  favoriteItemForAccounts,
  listConfiguredAccounts
};
