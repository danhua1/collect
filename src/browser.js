const { chromium } = require("playwright");

function resolveBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return Boolean(value);
}

function buildBrowserLaunchOptions(siteConfig, options = {}) {
  const browserConfig = siteConfig.browser || {};
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || browserConfig.executablePath;
  const args = Array.isArray(browserConfig.args) ? [...browserConfig.args] : [];

  return {
    ...(executablePath ? { executablePath } : {}),
    ...(args.length > 0 ? { args } : {}),
    headless: resolveBoolean(options.headless, browserConfig.headless || false),
    slowMo: options.slowMo ?? browserConfig.slowMo ?? 0
  };
}

function isRetryableLaunchError(error) {
  return Boolean(
    error &&
    typeof error.message === "string" &&
    (
      error.message.includes("browserType.launch: Target page, context or browser has been closed") ||
      error.message.includes("Received signal 6") ||
      error.message.includes("Crashpad")
    )
  );
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchChromium(siteConfig, options = {}) {
  const attempts = options.launchAttempts || 3;
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await chromium.launch(buildBrowserLaunchOptions(siteConfig, options));
    } catch (error) {
      lastError = error;

      if (!isRetryableLaunchError(error) || attempt === attempts - 1) {
        throw error;
      }

      await wait(1500 * (attempt + 1));
    }
  }

  throw lastError;
}

module.exports = {
  buildBrowserLaunchOptions,
  launchChromium,
  wait
};
