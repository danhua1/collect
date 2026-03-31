const { loginWithAccount, listAccounts, validateConfig, favoriteItem } = require("./index");

function parseArgs(argv) {
  const options = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return { positional, options };
}

function printUsage() {
  console.log(`Usage:
  npm run login -- --account <name>
  npm run switch-account -- --account <name>
  npm run favorite-item -- --account <name> --url <item-url>
  npm run start-api
  npm run list-accounts
  npm run validate-config

Optional flags:
  --account <name>   Account key from config/accounts.js
  --url <item-url>   Product URL to open and favorite
  --headless         Run browser in headless mode
  --fresh            Ignore saved login state and force re-login
`);
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === "--help" || command === "help") {
    printUsage();
    return;
  }

  if (command === "list-accounts") {
    const names = listAccounts();
    console.log(names.join("\n"));
    return;
  }

  if (command === "validate-config") {
    validateConfig();
    console.log("Config validation passed.");
    return;
  }

  if (command === "login" || command === "switch-account") {
    const accountName = options.account;
    await loginWithAccount(accountName, {
      fresh: Boolean(options.fresh || command === "switch-account"),
      headless: Boolean(options.headless)
    });
    return;
  }

  if (command === "favorite-item") {
    if (!options.url) {
      throw new Error("Missing --url for favorite-item");
    }

    await favoriteItem(options.account, options.url, {
      headless: Boolean(options.headless)
    });
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
