const fs = require("fs");
const path = require("path");
const { authDir, ensureAuthDir, loadConfig } = require("./config");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (value == null || value === "") {
    return [];
  }

  return [value];
}

function validateConfig() {
  const site = loadConfig("site");
  const accountsConfig = loadConfig("accounts");

  assert(site.loginUrl, "Missing loginUrl in config/site.js");
  assert(site.loginForm && site.loginForm.username, "Missing loginForm.username config");
  assert(site.loginForm && site.loginForm.password, "Missing loginForm.password config");
  assert(site.loginForm && site.loginForm.submit, "Missing loginForm.submit config");
  assert(accountsConfig.accounts && Object.keys(accountsConfig.accounts).length > 0, "No accounts configured");
}

function listAccounts() {
  const accountsConfig = loadConfig("accounts");
  return Object.keys(accountsConfig.accounts || {});
}

function getAccount(accountName) {
  const accountsConfig = loadConfig("accounts");
  const name = accountName || accountsConfig.defaultAccount;
  const account = accountsConfig.accounts && accountsConfig.accounts[name];

  assert(name, "No account specified and no defaultAccount found in config/accounts.js");
  assert(account, `Account "${name}" not found in config/accounts.js`);
  assert(account.username, `Account "${name}" is missing username`);
  assert(account.password, `Account "${name}" is missing password`);

  return { name, account };
}

function getStoragePath(siteName, accountName) {
  ensureAuthDir();
  return path.join(authDir, `${siteName || "site"}-${accountName}.json`);
}

async function getLoginTarget(page, siteConfig) {
  const loginFrame = siteConfig.loginFrame;

  if (!loginFrame || !loginFrame.urlIncludes) {
    return page;
  }

  const timeoutMs = loginFrame.timeoutMs || 30000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const frame = page.frames().find((item) => item.url().includes(loginFrame.urlIncludes));
    if (frame) {
      return frame;
    }
    await page.waitForTimeout(300);
  }

  throw new Error(`Login frame not found: ${loginFrame.urlIncludes}`);
}

async function tryFindLocator(target, action, options = {}) {
  try {
    return await findLocator(target, action, options);
  } catch (error) {
    return null;
  }
}

function isDetachedFrameError(error) {
  return Boolean(
    error &&
    typeof error.message === "string" &&
    (
      error.message.includes("Frame was detached") ||
      error.message.includes("Target page, context or browser has been closed")
    )
  );
}

function isRetryableLoginError(error) {
  return Boolean(
    isDetachedFrameError(error) ||
    (
      error &&
      typeof error.message === "string" &&
      error.message.includes("No matching selector found")
    )
  );
}

async function findLocator(target, action, options = {}) {
  const selectors = [
    ...toArray(action && action.selector),
    ...toArray(action && action.selectors)
  ];

  assert(selectors.length > 0, "Action selector is missing in config");

  for (const selector of selectors) {
    const locator = target.locator(selector).first();
    const count = await locator.count();

    if (!count) {
      continue;
    }

    if (options.preferVisible !== false) {
      try {
        if (await locator.isVisible({ timeout: options.timeoutMs || 500 })) {
          return locator;
        }
      } catch (error) {
        continue;
      }
    } else {
      return locator;
    }
  }

  throw new Error(`No matching selector found: ${selectors.join(" | ")}`);
}

async function performAction(page, action, value) {
  const locator = await findLocator(page, action, {
    timeoutMs: action.timeoutMs
  });

  if (action.type === "check") {
    await locator.check({ timeout: action.timeoutMs });
    return;
  }

  if (action.type === "press") {
    await locator.press(action.key || "Enter", { timeout: action.timeoutMs });
    return;
  }

  if (action.type === "click") {
    await locator.click({ timeout: action.timeoutMs });
    if (action.afterActionDelayMs) {
      await page.waitForTimeout(action.afterActionDelayMs);
    }
    return;
  }

  await locator.fill(value, { timeout: action.timeoutMs });
  if (action.afterActionDelayMs) {
    await page.waitForTimeout(action.afterActionDelayMs);
  }
}

async function runActions(page, siteConfig, actions) {
  for (const action of actions || []) {
    let completed = false;
    let lastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const loginTarget = await getLoginTarget(page, siteConfig);

      try {
        await performAction(loginTarget, action);
        completed = true;
        break;
      } catch (error) {
        lastError = error;

        if (action.optional) {
          break;
        }

        if (!isRetryableLoginError(error)) {
          throw error;
        }

        await page.waitForTimeout(500);
      }
    }

    if (!completed && !action.optional && lastError) {
      throw lastError;
    }
  }
}

async function performLoginAction(page, siteConfig, action, value) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loginTarget = await getLoginTarget(page, siteConfig);

    try {
      await performAction(loginTarget, action, value);
      return;
    } catch (error) {
      lastError = error;

      if (!isRetryableLoginError(error)) {
        throw error;
      }

      await page.waitForTimeout(500);
    }
  }

  throw lastError;
}

async function ensureLoginFormReady(page, siteConfig) {
  const attempts = siteConfig.loginFormRetry?.attempts || 3;
  const delayMs = siteConfig.loginFormRetry?.delayMs || 1500;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const loginTarget = await getLoginTarget(page, siteConfig);
    const usernameInput = await tryFindLocator(loginTarget, siteConfig.loginForm.username);
    const passwordInput = await tryFindLocator(loginTarget, siteConfig.loginForm.password);

    if (usernameInput && passwordInput) {
      return loginTarget;
    }

    await runActions(page, siteConfig, siteConfig.preLoginActions || []);
    await runActions(page, siteConfig, siteConfig.preFillActions || []);
    await page.waitForTimeout(delayMs);
  }

  return getLoginTarget(page, siteConfig);
}

async function hasAnyVisibleSelector(target, selectors, timeoutMs = 300) {
  for (const selector of toArray(selectors)) {
    const locator = target.locator(selector).first();
    const count = await locator.count();

    if (!count) {
      continue;
    }

    try {
      if (await locator.isVisible({ timeout: timeoutMs })) {
        return true;
      }
    } catch (error) {
      continue;
    }
  }

  return false;
}

async function isLoggedIn(page, siteConfig) {
  const loggedInCheck = siteConfig.loggedInCheck || {};
  const loginPageMarkers = siteConfig.loginPageMarkers || [];
  const loginTarget = await getLoginTarget(page, siteConfig).catch(() => page);

  if (await hasAnyVisibleSelector(loginTarget, loginPageMarkers)) {
    return false;
  }

  if (loggedInCheck.urlIncludes && page.url().includes(loggedInCheck.urlIncludes)) {
    return true;
  }

  if (loggedInCheck.urlExcludes && !page.url().includes(loggedInCheck.urlExcludes)) {
    return true;
  }

  if (Array.isArray(loggedInCheck.selectors)) {
    for (const selector of loggedInCheck.selectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        return true;
      }
    }
  }

  return false;
}

async function waitForLoggedIn(page, siteConfig) {
  const timeoutMs = siteConfig.navigation?.afterSubmitTimeoutMs || 30000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isLoggedIn(page, siteConfig)) {
      return;
    }
    await page.waitForTimeout(500);
  }

  throw new Error("Login did not complete. Please verify URL, selectors, and credentials.");
}

async function logoutIfConfigured(page, siteConfig) {
  const config = siteConfig.switchAccount;

  if (!config || !config.logout) {
    return;
  }

  try {
    await performAction(page, config.logout);
  } catch (error) {
    if (config.logout.optional) {
      return;
    }
    throw new Error("Logout selector configured but not found on page.");
  }

  if (config.postLogoutWaitFor) {
    const locator = await findLocator(page, config.postLogoutWaitFor);
    await locator.waitFor({
      state: "visible",
      timeout: config.postLogoutWaitFor.timeoutMs || 15000
    });
  }
}

async function runLoginFlow(page, siteConfig, account) {
  await page.goto(siteConfig.loginUrl, {
    waitUntil: siteConfig.navigation?.waitUntil || "domcontentloaded",
    timeout: siteConfig.navigation?.timeoutMs || 30000
  });

  if (await isLoggedIn(page, siteConfig)) {
    return;
  }

  if (siteConfig.preLoginWaitFor) {
    const locator = await findLocator(page, siteConfig.preLoginWaitFor);
    await locator.waitFor({
      state: "visible",
      timeout: siteConfig.preLoginWaitFor.timeoutMs || 30000
    });
  }

  await runActions(page, siteConfig, siteConfig.preLoginActions || []);

  if (await isLoggedIn(page, siteConfig)) {
    await logoutIfConfigured(page, siteConfig);
    await page.goto(siteConfig.loginUrl, {
      waitUntil: siteConfig.navigation?.waitUntil || "domcontentloaded",
      timeout: siteConfig.navigation?.timeoutMs || 30000
    });
  }

  const loginTarget = await ensureLoginFormReady(page, siteConfig);

  await performLoginAction(page, siteConfig, siteConfig.loginForm.username, account.username);
  await performLoginAction(page, siteConfig, siteConfig.loginForm.password, account.password);

  for (const action of siteConfig.preSubmitActions || []) {
    if (action.optional) {
      try {
        await performLoginAction(page, siteConfig, action);
      } catch (error) {
        continue;
      }
    } else {
      await performLoginAction(page, siteConfig, action);
    }
  }

  await performLoginAction(page, siteConfig, siteConfig.loginForm.submit);
  await waitForLoggedIn(page, siteConfig);
}

async function loginWithAccount(accountName, options = {}) {
  validateConfig();

  const siteConfig = loadConfig("site");
  const { name, account } = getAccount(accountName);
  const storageState = getStoragePath(siteConfig.siteName, name);
  const { chromium } = require("playwright");

  const browser = await chromium.launch({
    headless: options.headless || siteConfig.browser?.headless || false,
    slowMo: siteConfig.browser?.slowMo || 0
  });

  try {
    const context = await browser.newContext({
      ...(siteConfig.browserContext || {}),
      storageState: !options.fresh && fs.existsSync(storageState) ? storageState : undefined
    });
    const page = await context.newPage();

    await runLoginFlow(page, siteConfig, account);
    await context.storageState({ path: storageState });

    console.log(`Logged in with account "${name}".`);
    console.log(`Saved session to ${storageState}`);
  } finally {
    await browser.close();
  }
}

module.exports = {
  loginWithAccount,
  listAccounts,
  validateConfig
};
