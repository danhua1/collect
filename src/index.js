const { loginWithAccount, listAccounts, validateConfig } = require("./login");
const { favoriteItem, favoriteItemForAccounts, listConfiguredAccounts } = require("./favorite");

module.exports = {
  loginWithAccount,
  listAccounts,
  validateConfig,
  favoriteItem,
  favoriteItemForAccounts,
  listConfiguredAccounts
};
