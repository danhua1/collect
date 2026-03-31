module.exports = {
  siteName: "example-site",
  loginUrl: "https://example.com/login",
  loggedInCheck: {
    urlIncludes: "/dashboard",
    selectors: [
      "[data-test='user-avatar']",
      ".user-profile"
    ]
  },
  loginForm: {
    username: {
      selector: "input[name='username']",
      type: "fill"
    },
    password: {
      selector: "input[name='password']",
      type: "fill"
    },
    submit: {
      selector: "button[type='submit']",
      type: "click"
    }
  },
  switchAccount: {
    logout: {
      selector: "[data-test='logout']",
      type: "click",
      optional: true
    },
    postLogoutWaitFor: {
      selector: "input[name='username']"
    }
  },
  navigation: {
    waitUntil: "domcontentloaded",
    timeoutMs: 30000,
    afterSubmitTimeoutMs: 30000
  },
  browser: {
    headless: false,
    slowMo: 0
  }
};
