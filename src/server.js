const http = require("http");
const { URL } = require("url");
const { favoriteItemForAccounts, listConfiguredAccounts } = require("./favorite");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function parseAccounts(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      resolve(body);
    });

    request.on("error", reject);
  });
}

async function handleFavoriteRequest({ itemUrl, accounts, headless }) {
  if (!itemUrl) {
    throw new Error("Missing url");
  }

  const results = await favoriteItemForAccounts(itemUrl, accounts, {
    headless: Boolean(headless)
  });
  const failedCount = results.filter((item) => item.status === "failed").length;

  return {
    ok: failedCount === 0,
    url: itemUrl,
    accounts: accounts && accounts.length > 0 ? accounts : listConfiguredAccounts(),
    results
  };
}

async function requestHandler(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "favorite-api"
    });
    return;
  }

  if (requestUrl.pathname !== "/favorite") {
    sendJson(response, 404, {
      ok: false,
      error: "Not found"
    });
    return;
  }

  try {
    if (request.method === "GET") {
      const payload = await handleFavoriteRequest({
        itemUrl: requestUrl.searchParams.get("url"),
        accounts: parseAccounts(requestUrl.searchParams.get("accounts")),
        headless: requestUrl.searchParams.get("headless") === "1"
      });
      sendJson(response, 200, payload);
      return;
    }

    if (request.method === "POST") {
      const rawBody = await readRequestBody(request);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const payload = await handleFavoriteRequest({
        itemUrl: body.url,
        accounts: Array.isArray(body.accounts) ? body.accounts : parseAccounts(body.accounts),
        headless: Boolean(body.headless)
      });
      sendJson(response, 200, payload);
      return;
    }

    sendJson(response, 405, {
      ok: false,
      error: "Method not allowed"
    });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: error.message
    });
  }
}

http.createServer((request, response) => {
  requestHandler(request, response).catch((error) => {
    sendJson(response, 500, {
      ok: false,
      error: error.message
    });
  });
}).listen(PORT, HOST, () => {
  console.log(`Favorite API listening on http://${HOST}:${PORT}`);
});
