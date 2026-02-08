const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

const execAsync = promisify(exec);
const app = express();
const PORT = 3000;

// Global config
let APP_CONFIG = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper: Execute Lando commands
async function runLandoCommand(command, cwd = null) {
  try {
    // Use configured lando path
    const landoPath = APP_CONFIG.landoPath === 'lando' ? 'lando' : `"${APP_CONFIG.landoPath}"`;
    const fullCommand = command.replace('lando', landoPath);
    
    const options = { 
      maxBuffer: 1024 * 1024 * 10,
      timeout: 300000
    };
    
    if (cwd) {
      options.cwd = cwd;
    }
    
    // 5 minute timeout for slow operations
    const { stdout, stderr } = await execAsync(fullCommand, options);
    return { success: true, stdout, stderr };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
}

// Helper: Get all Lando sites (running + stopped)
async function getLandoSites() {
  const sitesMap = new Map();
  
  // 1. Get running sites from lando list
  const result = await runLandoCommand('lando list --format json');
  if (result.success) {
    try {
      const services = JSON.parse(result.stdout);
      
      // Group by directory (not app name, since Docker normalizes it)
      services.forEach(service => {
        if (service.app && service.app !== '_global_' && service.src && service.src[0]) {
          const dir = service.src[0].replace('/.lando.yml', '');
          
          if (!sitesMap.has(dir)) {
            sitesMap.set(dir, {
              app: service.app,
              running: service.running ? 'yes' : 'no',
              dir: dir,
              urls: service.urls || [`https://${service.app}.lndo.site`],
              recipe: 'Unknown',
              _dockerName: service.app // Keep for reference
            });
          }
        }
      });
    } catch (e) {
      // Continue to filesystem scan
    }
  }
  
  // 2. Scan filesystem for stopped sites and update names
  try {
    const dirs = await fs.readdir(APP_CONFIG.sitesDirectory);
    
    for (const dir of dirs) {
      const fullPath = path.join(APP_CONFIG.sitesDirectory, dir);
      const landoYmlPath = path.join(fullPath, '.lando.yml');
      
      try {
        await fs.access(landoYmlPath);
        
        // Read the .lando.yml to get the actual site name
        let siteName = dir; // fallback to folder name
        let recipe = 'Unknown';
        
        try {
          const content = await fs.readFile(landoYmlPath, 'utf-8');
          
          // Extract name from .lando.yml
          const nameMatch = content.match(/name:\s*(.+)/);
          if (nameMatch) siteName = nameMatch[1].trim();
          
          // Extract recipe
          const recipeMatch = content.match(/recipe:\s*(\w+)/);
          if (recipeMatch) recipe = recipeMatch[1];
        } catch (e) {}
        
        // Check if this directory is already in the map (from running sites)
        if (sitesMap.has(fullPath)) {
          // Update the running site with correct name and recipe
          const site = sitesMap.get(fullPath);
          site.app = siteName; // Use name from .lando.yml (with dashes)
          site.recipe = recipe;
          site.urls = [`https://${siteName}.lndo.site`]; // Correct URL with dashes
        } else {
          // Not running, add as stopped
          sitesMap.set(fullPath, {
            app: siteName,
            running: 'no',
            dir: fullPath,
            urls: [`https://${siteName}.lndo.site`],
            recipe: recipe
          });
        }
      } catch (e) {
        // No .lando.yml in this directory, skip
      }
    }
  } catch (e) {
    // LANDO_BASE_DIR doesn't exist or can't be read
  }
  
  return Array.from(sitesMap.values());
}

// API Routes

// GET /api/sites - List all sites
app.get('/api/sites', async (req, res) => {
  try {
    const sites = await getLandoSites();
    res.json({ success: true, sites });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sites - Create new site
app.post('/api/sites', async (req, res) => {
  try {
    const { name, recipe, php, database, webroot } = req.body;

    if (!name || !recipe) {
      return res.status(400).json({ success: false, error: 'Name and recipe are required' });
    }

    const siteDir = path.join(APP_CONFIG.sitesDirectory, name);

    // Check if site already exists
    try {
      await fs.access(siteDir);
      return res.status(400).json({ success: false, error: 'Site already exists' });
    } catch (e) {
      // Directory doesn't exist, good to proceed
    }

    // Create directory
    await fs.mkdir(siteDir, { recursive: true });

    // Download WordPress if recipe is wordpress
    if (recipe === 'wordpress') {
      await runLandoCommand('wget https://wordpress.org/latest.tar.gz', siteDir);
      await runLandoCommand('tar -xzf latest.tar.gz && mv wordpress/* . && rm -rf wordpress latest.tar.gz', siteDir);
    }

    // Create .lando.yml
    const landoConfig = {
      name: name,
      recipe: recipe,
      config: {
        webroot: webroot || '.',
        php: php || '8.1'
      }
    };

    if (database) {
      landoConfig.config.database = database;
    }

    const yamlContent = `name: ${landoConfig.name}
recipe: ${landoConfig.recipe}
config:
  webroot: ${landoConfig.config.webroot}
  php: '${landoConfig.config.php}'${database ? `\n  database: ${database}` : ''}
`;

    await fs.writeFile(path.join(siteDir, '.lando.yml'), yamlContent);

    // Start Lando
    const startResult = await runLandoCommand('lando start', siteDir);

    if (!startResult.success) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to start Lando',
        details: startResult.stderr || startResult.error
      });
    }

    // If WordPress, create wp-config and install
    if (recipe === 'wordpress') {
      await runLandoCommand(
        'lando wp config create --dbname=wordpress --dbuser=wordpress --dbpass=wordpress --dbhost=database --skip-check',
        siteDir
      );
      
      await runLandoCommand(
        `lando wp core install --url=https://${name}.lndo.site --title="${name}'s Site" --admin_user=james --admin_password=pepsidude --admin_email=james.welbes@gmail.com`,
        siteDir
      );
    }

    res.json({ 
      success: true, 
      message: `Site ${name} created successfully`,
      url: `https://${name}.lndo.site`
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sites/:name/start
app.post('/api/sites/:name/start', async (req, res) => {
  try {
    const { name } = req.params;
    
    // Find the site directory by searching for the site with this name
    const sites = await getLandoSites();
    const site = sites.find(s => s.app === name);
    
    if (!site) {
      return res.status(404).json({ 
        success: false, 
        error: `Site ${name} not found` 
      });
    }
    
    const siteDir = site.dir;
    
    // Verify directory exists
    try {
      await fs.access(siteDir);
    } catch (e) {
      return res.status(404).json({ 
        success: false, 
        error: `Site directory not found: ${siteDir}` 
      });
    }
    
    // Set a longer timeout for this request (5 minutes)
    req.setTimeout(300000);
    
    console.log(`Starting site ${name} in directory: ${siteDir}`);
    const result = await runLandoCommand('lando start', siteDir);
    
    // Check for specific Docker network errors
    if (!result.success && (result.stderr || result.error)) {
      const errorText = result.stderr || result.error;
      
      console.error(`Error starting ${name}:`, errorText);
      
      if (errorText.includes('network') && errorText.includes('not found')) {
        return res.status(500).json({ 
          success: false, 
          error: 'Docker network error detected. This site needs to be rebuilt.',
          needsRebuild: true
        });
      }
    }
    
    if (result.success || (result.stdout && result.stdout.includes('started successfully'))) {
      res.json({ success: true, message: `Site ${name} started` });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.stderr || result.error || 'Failed to start site',
        details: result.stderr
      });
    }
  } catch (error) {
    console.error('Error in start endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sites/:name/stop
app.post('/api/sites/:name/stop', async (req, res) => {
  try {
    const { name } = req.params;
    
    // Find the site directory
    const sites = await getLandoSites();
    const site = sites.find(s => s.app === name);
    
    if (!site) {
      return res.status(404).json({ success: false, error: `Site ${name} not found` });
    }
    
    const siteDir = site.dir;
    console.log(`Stopping site ${name} in directory: ${siteDir}`);
    
    const result = await runLandoCommand('lando stop', siteDir);
    
    if (result.success) {
      res.json({ success: true, message: `Site ${name} stopped` });
    } else {
      console.error(`Error stopping ${name}:`, result.stderr || result.error);
      res.status(500).json({ success: false, error: result.stderr || result.error });
    }
  } catch (error) {
    console.error('Error in stop endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sites/:name/restart
app.post('/api/sites/:name/restart', async (req, res) => {
  try {
    const { name } = req.params;
    
    // Find the site directory
    const sites = await getLandoSites();
    const site = sites.find(s => s.app === name);
    
    if (!site) {
      return res.status(404).json({ success: false, error: `Site ${name} not found` });
    }
    
    const siteDir = site.dir;
    console.log(`Restarting site ${name} in directory: ${siteDir}`);
    
    const result = await runLandoCommand('lando restart', siteDir);
    
    if (result.success) {
      res.json({ success: true, message: `Site ${name} restarted` });
    } else {
      console.error(`Error restarting ${name}:`, result.stderr || result.error);
      res.status(500).json({ success: false, error: result.stderr || result.error });
    }
  } catch (error) {
    console.error('Error in restart endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sites/:name/rebuild
app.post('/api/sites/:name/rebuild', async (req, res) => {
  try {
    const { name } = req.params;
    
    // Find the site directory
    const sites = await getLandoSites();
    const site = sites.find(s => s.app === name);
    
    if (!site) {
      return res.status(404).json({ success: false, error: `Site ${name} not found` });
    }
    
    const siteDir = site.dir;
    console.log(`Rebuilding site ${name} in directory: ${siteDir}`);
    
    const result = await runLandoCommand('lando rebuild -y', siteDir);
    
    if (result.success) {
      res.json({ success: true, message: `Site ${name} rebuilt` });
    } else {
      console.error(`Error rebuilding ${name}:`, result.stderr || result.error);
      res.status(500).json({ success: false, error: result.stderr || result.error });
    }
  } catch (error) {
    console.error('Error in rebuild endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/sites/:name
app.delete('/api/sites/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    // Find the site directory
    const sites = await getLandoSites();
    const site = sites.find(s => s.app === name);
    
    if (!site) {
      return res.status(404).json({ success: false, error: `Site ${name} not found` });
    }
    
    const siteDir = site.dir;
    
    // Destroy Lando site
    await runLandoCommand('lando destroy -y', siteDir);
    
    // Remove Docker volumes
    await runLandoCommand(`docker volume rm ${name}_data_database ${name}_home_appserver ${name}_home_database 2>/dev/null || true`);
    
    // Remove Docker network
    await runLandoCommand(`docker network rm ${name}_default 2>/dev/null || true`);
    
    // Delete directory
    await fs.rm(siteDir, { recursive: true, force: true });
    
    res.json({ success: true, message: `Site ${name} destroyed completely` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sites/:name/info
app.get('/api/sites/:name/info', async (req, res) => {
  try {
    const { name } = req.params;
    
    // Find the site directory
    const sites = await getLandoSites();
    const site = sites.find(s => s.app === name);
    
    if (!site) {
      return res.status(404).json({ success: false, error: `Site ${name} not found` });
    }
    
    const siteDir = site.dir;
    
    // Read .lando.yml
    const landoYml = await fs.readFile(path.join(siteDir, '.lando.yml'), 'utf-8');
    
    // Get Lando info
    const result = await runLandoCommand('lando info --format json', siteDir);
    let info = {};
    if (result.success) {
      try {
        info = JSON.parse(result.stdout);
      } catch (e) {}
    }
    
    res.json({ 
      success: true, 
      config: landoYml,
      info: info
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/config - Get current config
app.get('/api/config', async (req, res) => {
  res.json({ success: true, config: APP_CONFIG });
});

// POST /api/config - Update config
app.post('/api/config', async (req, res) => {
  try {
    const updates = req.body;
    APP_CONFIG = { ...APP_CONFIG, ...updates };
    await config.saveConfig(APP_CONFIG);
    res.json({ success: true, config: APP_CONFIG });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/config/detect - Auto-detect settings
app.get('/api/config/detect', async (req, res) => {
  try {
    const detected = {
      landoPath: config.detectLandoPath(),
      sitesDirectory: await config.detectSitesDirectory()
    };
    
    // Verify detected values
    detected.landoValid = config.verifyLando(detected.landoPath);
    detected.sitesDirectoryValid = await config.verifySitesDirectory(detected.sitesDirectory);
    
    res.json({ success: true, detected });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/config/verify - Verify user-provided settings
app.post('/api/config/verify', async (req, res) => {
  try {
    const { landoPath, sitesDirectory } = req.body;
    
    const landoValid = config.verifyLando(landoPath);
    const sitesDirectoryValid = await config.verifySitesDirectory(sitesDirectory);
    
    res.json({ 
      success: true, 
      landoValid, 
      sitesDirectoryValid 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
async function startServer() {
  // Load config
  APP_CONFIG = await config.loadConfig();
  
  app.listen(PORT, () => {
    console.log(`🦙 Lando GUI running at http://localhost:${PORT}`);
    console.log(`📁 Managing sites in: ${APP_CONFIG.sitesDirectory}`);
    console.log(`🔧 Lando path: ${APP_CONFIG.landoPath}`);
    
    if (!APP_CONFIG.setupComplete) {
      console.log(`\n⚠️  First-time setup required!`);
      console.log(`   Open http://localhost:${PORT} to complete setup.\n`);
    }
  });
}

startServer();
