const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.landoguirc.json');

const DEFAULT_CONFIG = {
  landoPath: 'auto',
  sitesDirectory: '', // User must specify this
  wordpress: {
    adminUser: 'admin',
    adminPassword: 'admin',
    adminEmail: 'admin@example.com'
  },
  setupComplete: false
};

// Detect Lando installation
function detectLandoPath() {
  const possiblePaths = [
    '/usr/local/bin/lando',
    '/usr/bin/lando',
    path.join(os.homedir(), '.lando', 'bin', 'lando'),
    'C:\\Program Files\\Lando\\bin\\lando.exe',
    'C:\\ProgramData\\Lando\\bin\\lando.exe'
  ];

  // Try common paths
  for (const landoPath of possiblePaths) {
    try {
      if (require('fs').existsSync(landoPath)) {
        return landoPath;
      }
    } catch (e) {}
  }

  // Try which/where command
  try {
    const cmd = process.platform === 'win32' ? 'where lando' : 'which lando';
    const result = execSync(cmd, { encoding: 'utf8' }).trim();
    if (result) return result.split('\n')[0]; // First result
  } catch (e) {}

  // Fallback to just 'lando' (hope it's in PATH)
  return 'lando';
}

// Detect sites directory
async function detectSitesDirectory() {
  const possibleDirs = [
    path.join(os.homedir(), 'lando'),
    path.join(os.homedir(), 'sites'),
    path.join(os.homedir(), 'Projects'),
    path.join(os.homedir(), 'projects'),
    path.join(os.homedir(), 'Development'),
    path.join(os.homedir(), 'dev')
  ];

  for (const dir of possibleDirs) {
    try {
      const stat = await fs.stat(dir);
      if (stat.isDirectory()) {
        // Check if it has any .lando.yml files
        const files = await fs.readdir(dir);
        for (const file of files) {
          const landoYml = path.join(dir, file, '.lando.yml');
          try {
            await fs.access(landoYml);
            return dir; // Found a Lando site!
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // Default fallback
  return path.join(os.homedir(), 'lando');
}

// Load config
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch (e) {
    // No config file yet, return defaults with Lando auto-detection only
    const config = { ...DEFAULT_CONFIG };
    config.landoPath = detectLandoPath();
    // sitesDirectory stays empty - user must provide it
    return config;
  }
}

// Save config
async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Verify Lando installation
function verifyLando(landoPath) {
  try {
    const cmd = landoPath === 'lando' ? 'lando version' : `"${landoPath}" version`;
    execSync(cmd, { encoding: 'utf8', timeout: 5000 });
    return true;
  } catch (e) {
    return false;
  }
}

// Verify sites directory
async function verifySitesDirectory(dir) {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch (e) {
    return false;
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  detectLandoPath,
  detectSitesDirectory,
  verifyLando,
  verifySitesDirectory,
  DEFAULT_CONFIG
};
