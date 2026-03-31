const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const configDir = path.join(projectRoot, "config");
const authDir = path.join(projectRoot, ".auth");

function resolveConfigFile(name) {
  const actualPath = path.join(configDir, `${name}.js`);
  const examplePath = path.join(configDir, `${name}.example.js`);

  if (fs.existsSync(actualPath)) {
    return actualPath;
  }

  return examplePath;
}

function loadConfig(name) {
  const filePath = resolveConfigFile(name);
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function ensureAuthDir() {
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
}

module.exports = {
  authDir,
  projectRoot,
  loadConfig,
  ensureAuthDir
};
