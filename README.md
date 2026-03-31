# Login Automation Scaffold

This project provides a configurable Node.js browser automation scaffold for:

- logging into a site with a given account
- switching between multiple accounts
- saving an isolated login session per account

## 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

If the network repeatedly fails while downloading `chromium-headless-shell`, use:

```bash
npx playwright install chromium --no-shell
```

That is enough for the default headed browser flow in this project.

## 2. Create real config files

Copy these example files:

```bash
cp config/site.example.js config/site.js
cp config/accounts.example.js config/accounts.js
```

Then update:

- `config/site.js`: the current project already includes a default config for `https://stzb.cbg.163.com/cgi/mweb/show_login`, adjust selectors if the page changes
- `config/accounts.js`: fill in real accounts

## 3. Validate config

```bash
npm run validate-config
```

## 4. Login with an account

```bash
npm run login -- --account accountA
npm run login -- --account accountA --headless
```

If `defaultAccount` is set, `--account` can be omitted.

## 5. Force switch account

```bash
npm run switch-account -- --account accountB
```

This command ignores the saved login state and runs a fresh login flow.

## 6. Favorite an item

```bash
npm run favorite-item -- --account accountA --url "https://stzb.cbg.163.com/cgi/mweb/equip/..."
```

This command logs in with the selected account, opens the product page in a new browser page, and clicks the bottom `收藏` button.

## 7. Start the API

```bash
npm run start-api
```

Then call:

```bash
curl "http://127.0.0.1:3000/favorite?url=https%3A%2F%2Fstzb.cbg.163.com%2Fcgi%2Fmweb%2Fequip%2F..."
```

Optional query params:

- `accounts=accountA,accountB,accountC`
- `headless=1`

You can also use `POST /favorite` with JSON:

```json
{
  "url": "https://stzb.cbg.163.com/cgi/mweb/equip/...",
  "accounts": ["accountA", "accountB"]
}
```

## Config notes

### `loggedInCheck`

Use either or both:

- `urlIncludes`: URL fragment after successful login
- `selectors`: elements visible only after successful login

### `loginForm`

Supported action types:

- `fill` (default)
- `click`
- `press`
- `check`

Example:

```js
username: { selector: "input[name='username']", type: "fill" }
```

### `switchAccount`

If the site requires logout before logging into a different account, set:

```js
switchAccount: {
  logout: {
    selector: "[data-test='logout']",
    type: "click",
    optional: true
  },
  postLogoutWaitFor: {
    selector: "input[name='username']"
  }
}
```

## Current limitation

The project now includes an initial site config for `stzb.cbg.163.com`, based on the current login page and front-end bundle analysis. Because this page is SPA-rendered and may change over time, you may still need to fine-tune selectors in `config/site.js` after the first real login run.

In this environment, headed mode is currently the most reliable path. Headless mode depends on `chromium-headless-shell`; if that package cannot be downloaded on your network, skip `--headless` and use the normal browser window.
