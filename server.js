const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

const execAsync = promisify(exec);
const app = express();
const PORT = 3000;

// Global config
let APP_CONFIG = null;

// Operation logs storage (in-memory)
const operationLogs = new Map();

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

// Helper: Execute Lando command with live output streaming
async function runLandoCommandWithLogs(operationId, command, cwd = null) {
            return new Promise((resolve, reject) => {
    // Initialize log storage for this operation
    operationLogs.set(operationId, {
      lines: [],
      completed: false,
      success: null,
      error: null
    });

    const landoPath = APP_CONFIG.landoPath === 'lando' ? 'lando' : APP_CONFIG.landoPath;
    const commandArray = command.split(' ');
    commandArray[0] = landoPath;

    const options = {
      cwd: cwd || process.cwd(),
      shell: true,
      env: { 
        ...process.env, 
        LANDO_NO_COLOR: '1',
        PYTHONUNBUFFERED: '1',
        NODE_NO_WARNINGS: '1'
      }
    };

    // Helper to strip ANSI escape codes
    const stripAnsi = (str) => {
      return str.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '') // CSI sequences
                .replace(/\x1B\][0-9];[^\x07]*\x07/g, '') // OSC sequences
                .replace(/\x1B[=>]/g, '') // Other escape sequences  
                .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, ''); // Control chars
    };

    console.log(`[${operationId}] Spawning command: ${commandArray.join(' ')}`);
    const child = spawn(commandArray.join(' '), [], options);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (data) => {
      const text = stripAnsi(data.toString());
      if (text.trim()) {
        console.log(`[${operationId}] stdout:`, text);
        const lines = text.split('\n').filter(line => line.trim());
        const log = operationLogs.get(operationId);
        if (log) {
          log.lines.push(...lines);
        }
      }
    });

    child.stderr.on('data', (data) => {
      const text = stripAnsi(data.toString());
      if (text.trim()) {
        console.log(`[${operationId}] stderr:`, text);
        const lines = text.split('\n').filter(line => line.trim());
        const log = operationLogs.get(operationId);
        if (log) {
          log.lines.push(...lines);
        }
      }
    });

    child.on('close', (code) => {
      console.log(`[${operationId}] Process closed with code ${code}`);
      const log = operationLogs.get(operationId);
      if (log) {
        log.completed = true;
        log.success = code === 0;
        if (code !== 0) {
          log.error = `Process exited with code ${code}`;
        }
      }
      
      if (code === 0) {
        resolve({ success: true, operationId });
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      console.error(`[${operationId}] Process error:`, error);
      const log = operationLogs.get(operationId);
      if (log) {
        log.completed = true;
        log.success = false;
        log.error = error.message;
      }
      reject(error);
    });
  });
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
      for (const service of services) {
        if (service.app && service.app !== '_global_' && service.src && service.src[0]) {
          const dir = service.src[0].replace('/.lando.yml', '');
          
          if (!sitesMap.has(dir)) {
            const siteData = {
              app: service.app,
              running: service.running ? 'yes' : 'no',
              dir: dir,
              urls: service.urls || [`https://${service.app}.lndo.site`],
              recipe: 'Unknown',
              _dockerName: service.app // Keep for reference
            };
            
            // Get full info to check for phpMyAdmin URLs
            if (service.running) {
              const infoResult = await runLandoCommand('lando info --format json', dir);
              if (infoResult.success) {
                try {
                  const info = JSON.parse(infoResult.stdout);
                  
                  // Look for phpMyAdmin service
                  if (Array.isArray(info)) {
                    const pmaService = info.find(s => s.type === 'phpmyadmin');
                    if (pmaService && pmaService.urls && pmaService.urls.length > 0) {
                      siteData.phpmyadminUrl = pmaService.urls[0];
                    }
                  }
                } catch (e) {}
              }
            }
            
            sitesMap.set(dir, siteData);
          }
        }
      }
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
        let phpmyadminEnabled = false;
        
        try {
          const content = await fs.readFile(landoYmlPath, 'utf-8');
          
          // Extract name from .lando.yml
          const nameMatch = content.match(/name:\s*(.+)/);
          if (nameMatch) siteName = nameMatch[1].trim();
          
          // Extract recipe
          const recipeMatch = content.match(/recipe:\s*(\w+)/);
          if (recipeMatch) recipe = recipeMatch[1];
          
          // Check for phpMyAdmin service
          const hasPhpMyAdmin = content.includes('type: phpmyadmin') || content.includes('type:phpmyadmin');
          
          // Only set URL if running (will be fetched from lando info above)
          // For stopped sites, just mark that it has phpMyAdmin
          if (hasPhpMyAdmin && !sitesMap.has(fullPath)) {
            // Will be populated when site starts
            phpmyadminEnabled = true;
          }
        } catch (e) {}
        
        // Check if this directory is already in the map (from running sites)
        if (sitesMap.has(fullPath)) {
          // Update the running site with correct name and recipe
          const site = sitesMap.get(fullPath);
          site.app = siteName; // Use name from .lando.yml (with dashes)
          site.recipe = recipe;
          site.urls = [`https://${siteName}.lndo.site`]; // Correct URL with dashes
          // phpMyAdmin URL already set from lando info if running
        } else {
          // Not running, add as stopped
          const siteData = {
            app: siteName,
            running: 'no',
            dir: fullPath,
            urls: [`https://${siteName}.lndo.site`],
            recipe: recipe
          };
          // Don't set phpMyAdmin URL for stopped sites (only when running)
          if (phpmyadminEnabled) {
            siteData.hasPhpMyAdmin = true;
          }
          sitesMap.set(fullPath, siteData);
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

// GET /api/operations/:id/logs - Get logs for an operation
app.get('/api/operations/:id/logs', (req, res) => {
  const { id } = req.params;
  const log = operationLogs.get(id);
  
  if (!log) {
    return res.status(404).json({ success: false, error: 'Operation not found' });
  }
  
  res.json({
    success: true,
    logs: log.lines,
    completed: log.completed,
    operationSuccess: log.success,
    error: log.error
  });
});

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
    const { name, recipe, php, database, webroot, phpmyadmin } = req.body;

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

    const operationId = `create-${name}-${Date.now()}`;
    
    // Send immediate response with operation ID
    res.json({ success: true, operationId });

    // Start the operation asynchronously
    (async () => {
      const log = operationLogs.get(operationId) || { lines: [], completed: false, success: null, error: null };
      operationLogs.set(operationId, log);

      try {
        // Create directory
        log.lines.push(`Creating directory: ${siteDir}`);
        await fs.mkdir(siteDir, { recursive: true });

        // Download WordPress if recipe is wordpress
        if (recipe === 'wordpress') {
          log.lines.push('Downloading WordPress...');
          await runLandoCommand('wget https://wordpress.org/latest.tar.gz', siteDir);
          
          log.lines.push('Extracting WordPress files...');
          await runLandoCommand('tar -xzf latest.tar.gz && mv wordpress/* . && rm -rf wordpress latest.tar.gz', siteDir);
        }

        // Create .lando.yml
        log.lines.push('Creating .lando.yml configuration...');
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

        let yamlContent = `name: ${landoConfig.name}
recipe: ${landoConfig.recipe}
config:
  webroot: ${landoConfig.config.webroot}
  php: '${landoConfig.config.php}'${database ? `\n  database: ${database}` : ''}
`;

        // Add phpMyAdmin service if requested
        if (phpmyadmin) {
          yamlContent += `\nservices:\n  myservice:\n    type: phpmyadmin\n`;
        }

        await fs.writeFile(path.join(siteDir, '.lando.yml'), yamlContent);

        // Start Lando with streaming output
        log.lines.push('Starting Lando (this may take a minute)...');
        await runLandoCommandWithLogs(operationId, 'lando start', siteDir);

        // If WordPress, create wp-config and install
        if (recipe === 'wordpress') {
          log.lines.push('Configuring WordPress database...');
          await runLandoCommand(
            'lando wp config create --dbname=wordpress --dbuser=wordpress --dbpass=wordpress --dbhost=database --skip-check',
            siteDir
          );
          
          log.lines.push('Installing WordPress...');
          await runLandoCommand(
            `lando wp core install --url=https://${name}.lndo.site --title="${name}'s Site" --admin_user=james --admin_password=pepsidude --admin_email=james.welbes@gmail.com`,
            siteDir
          );
          
          log.lines.push(`Site ready at: https://${name}.lndo.site`);
          log.lines.push('WordPress login: james / pepsidude');
        }

        log.lines.push('✅ Site created successfully!');
        log.completed = true;
        log.success = true;

      } catch (error) {
        log.lines.push(`❌ Error: ${error.message}`);
        log.completed = true;
        log.success = false;
        log.error = error.message;
      }
    })();

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
    
    // Generate unique operation ID
    const operationId = `start-${name}-${Date.now()}`;
    
    // Send immediate response with operation ID
    res.json({ success: true, operationId });
    
    // Start the operation asynchronously
    console.log(`Starting site ${name} in directory: ${siteDir}`);
    try {
      await runLandoCommandWithLogs(operationId, 'lando start', siteDir);
    } catch (error) {
      console.error(`Error starting ${name}:`, error.message);
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
    const operationId = `stop-${name}-${Date.now()}`;
    
    console.log(`Stopping site ${name} in directory: ${siteDir}`);
    
    // Send immediate response with operation ID
    res.json({ success: true, operationId });
    
    // Start the operation asynchronously
    try {
      await runLandoCommandWithLogs(operationId, 'lando stop', siteDir);
    } catch (error) {
      console.error(`Error stopping ${name}:`, error.message);
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
    const operationId = `restart-${name}-${Date.now()}`;
    
    console.log(`Restarting site ${name} in directory: ${siteDir}`);
    
    // Send immediate response with operation ID
    res.json({ success: true, operationId });
    
    // Start the operation asynchronously
    try {
      await runLandoCommandWithLogs(operationId, 'lando restart', siteDir);
    } catch (error) {
      console.error(`Error restarting ${name}:`, error.message);
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
    const operationId = `rebuild-${name}-${Date.now()}`;
    
    console.log(`Rebuilding site ${name} in directory: ${siteDir}`);
    
    // Send immediate response with operation ID
    res.json({ success: true, operationId });
    
    // Start the operation asynchronously
    try {
      await runLandoCommandWithLogs(operationId, 'lando rebuild -y', siteDir);
    } catch (error) {
      console.error(`Error rebuilding ${name}:`, error.message);
    }
  } catch (error) {
    console.error('Error in rebuild endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sites/:name/migrate-mysql - Safe MySQL version change with export/import
app.post('/api/sites/:name/migrate-mysql', async (req, res) => {
  try {
    const { name } = req.params;
    const { php, database, phpmyadmin } = req.body;
    
    // Find the site directory
    const sites = await getLandoSites();
    const site = sites.find(s => s.app === name);
    
    if (!site) {
      return res.status(404).json({ success: false, error: `Site ${name} not found` });
    }
    
    const siteDir = site.dir;
    const operationId = `migrate-mysql-${name}-${Date.now()}`;
    const backupFile = `backup-${Date.now()}.sql`;  // Lando adds .gz automatically
    
    console.log(`Migrating MySQL for ${name} to ${database}`);
    
    // Send immediate response with operation ID
    res.json({ success: true, operationId });
    
    // Initialize log storage
    operationLogs.set(operationId, {
      lines: [],
      completed: false,
      success: null,
      error: null
    });
    
    const log = operationLogs.get(operationId);
    
    // Helper to run command and append output to our log
    const runStep = async (stepMsg, command) => {
      log.lines.push(stepMsg);
      try {
        const { stdout, stderr } = await execPromise(command, { cwd: siteDir });
        if (stdout) {
          stdout.split('\n').filter(l => l.trim()).forEach(line => log.lines.push(line));
        }
        if (stderr) {
          stderr.split('\n').filter(l => l.trim()).forEach(line => log.lines.push(line));
        }
        return { success: true };
      } catch (error) {
        log.lines.push(`❌ Error: ${error.message}`);
        throw error;
      }
    };
    
    // Start the migration asynchronously
    (async () => {
      try {
        // Step 1: Export database
        await runStep('📦 Step 1/5: Exporting database...', `lando db-export ${backupFile}`);
        log.lines.push(`✅ Database exported to ${backupFile}`);
        log.lines.push('');
        
        // Step 2: Update config
        log.lines.push('📝 Step 2/5: Updating configuration...');
        const landoYmlPath = path.join(siteDir, '.lando.yml');
        let content = await fs.readFile(landoYmlPath, 'utf-8');
        
        // Update PHP if provided
        if (php) {
          if (content.includes('php:')) {
            content = content.replace(/php:\s*['"]?[^'\n"]+['"]?/, `php: '${php}'`);
          } else {
            if (content.includes('webroot:')) {
              content = content.replace(/(webroot:[^\n]+)/, `$1\n  php: '${php}'`);
            }
          }
        }
        
        // Update database version
        if (database) {
          if (content.includes('database:')) {
            content = content.replace(/database:\s*.+/, `database: ${database}`);
          } else {
            if (content.includes('php:')) {
              content = content.replace(/(php:\s*['"]?[^'\n"]+['"]?)/, `$1\n  database: ${database}`);
            } else if (content.includes('webroot:')) {
              content = content.replace(/(webroot:[^\n]+)/, `$1\n  database: ${database}`);
            }
          }
        }
        
        // Update phpMyAdmin
        const hasServices = content.includes('services:');
        const hasPhpMyAdmin = content.includes('type: phpmyadmin');
        
        if (phpmyadmin && !hasPhpMyAdmin) {
          if (hasServices) {
            content = content.replace(/services:/, `services:\n  myservice:\n    type: phpmyadmin`);
          } else {
            content += `\nservices:\n  myservice:\n    type: phpmyadmin\n`;
          }
        } else if (!phpmyadmin && hasPhpMyAdmin) {
          content = content.replace(/services:\s*\n\s*myservice:\s*\n\s*type:\s*phpmyadmin\s*\n?/, '');
          content = content.replace(/\nservices:\s*\n?$/, '');
        }
        
        await fs.writeFile(landoYmlPath, content);
        log.lines.push(`✅ Configuration updated to ${database}`);
        log.lines.push('');
        
        // Step 3: Destroy app (removes all containers and volumes)
        await runStep('🗑️  Step 3/6: Destroying app and removing old database...', 'lando destroy -y');
        log.lines.push('✅ App destroyed (all old containers and data removed)');
        log.lines.push('');
        
        // Step 4: Start with new MySQL version (recreates from scratch)
        await runStep('🚀 Step 4/5: Starting app with new MySQL version...', 'lando start');
        log.lines.push('✅ App started with new MySQL version');
        log.lines.push('');
        
        // Step 5: Import database (backup file is still in site directory - lando destroy doesn't delete files)
        await runStep('📥 Step 5/5: Importing database...', `lando db-import ${backupFile}`);
        log.lines.push('✅ Database imported successfully');
        log.lines.push('');
        
        // Cleanup backup file
        log.lines.push('🧹 Cleaning up backup file...');
        try {
          await fs.unlink(path.join(siteDir, backupFile));
          log.lines.push('✅ Backup file removed');
        } catch (err) {
          // File might already be gone, that's okay
          log.lines.push('✅ Backup cleanup complete');
        }
        log.lines.push('');
        
        log.lines.push('🎉 MySQL migration completed successfully!');
        log.completed = true;
        log.success = true;
        
      } catch (error) {
        console.error(`Error migrating MySQL for ${name}:`, error);
        log.lines.push('');
        log.lines.push(`❌ Migration failed: ${error.message}`);
        log.lines.push('⚠️  Your site may be in an incomplete state. Try running "lando rebuild -y" manually.');
        log.completed = true;
        log.success = false;
        log.error = error.message;
      }
    })();
    
  } catch (error) {
    console.error('Error in migrate-mysql endpoint:', error);
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
    const operationId = `destroy-${name}-${Date.now()}`;
    
    // Send immediate response with operation ID
    res.json({ success: true, operationId });
    
    // Start the operation asynchronously
    (async () => {
      try {
        // Destroy Lando site with logs
        await runLandoCommandWithLogs(operationId, 'lando destroy -y', siteDir);
        
        // Append cleanup messages to logs
        const log = operationLogs.get(operationId);
        if (log) {
          log.lines.push('Removing Docker volumes...');
        }
        
        // Remove Docker volumes
        await runLandoCommand(`docker volume rm ${name}_data_database ${name}_home_appserver ${name}_home_database 2>/dev/null || true`);
        
        if (log) {
          log.lines.push('Removing Docker network...');
        }
        
        // Remove Docker network
        await runLandoCommand(`docker network rm ${name}_default 2>/dev/null || true`);
        
        if (log) {
          log.lines.push('Deleting site directory...');
        }
        
        // Delete directory
        await fs.rm(siteDir, { recursive: true, force: true });
        
        if (log) {
          log.lines.push('Site destroyed completely!');
          log.completed = true;
          log.success = true;
        }
      } catch (error) {
        const log = operationLogs.get(operationId);
        if (log) {
          log.lines.push(`Error: ${error.message}`);
          log.completed = true;
          log.success = false;
          log.error = error.message;
        }
      }
    })();
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

// GET /api/sites/:name/config - Get site configuration
app.get('/api/sites/:name/config', async (req, res) => {
  try {
    const { name } = req.params;
    
    // Find the site directory
    const sites = await getLandoSites();
    const site = sites.find(s => s.app === name);
    
    if (!site) {
      return res.status(404).json({ success: false, error: `Site ${name} not found` });
    }
    
    const siteDir = site.dir;
    const landoYmlPath = path.join(siteDir, '.lando.yml');
    
    // Read .lando.yml
    const content = await fs.readFile(landoYmlPath, 'utf-8');
    
    // Parse config
    const phpMatch = content.match(/php:\s*['"]?([^'\n"]+)['"]?/);
    const databaseMatch = content.match(/database:\s*(.+)/);
    const hasPhpMyAdmin = content.includes('type: phpmyadmin') || content.includes('type:phpmyadmin');
    
    const config = {
      php: phpMatch ? phpMatch[1] : '8.1',
      database: databaseMatch ? databaseMatch[1].trim() : 'mysql:8.0',
      hasPhpMyAdmin
    };
    
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/sites/:name/config - Update site configuration
app.put('/api/sites/:name/config', async (req, res) => {
  try {
    const { name } = req.params;
    const { php, database, phpmyadmin } = req.body;
    
    // Find the site directory
    const sites = await getLandoSites();
    const site = sites.find(s => s.app === name);
    
    if (!site) {
      return res.status(404).json({ success: false, error: `Site ${name} not found` });
    }
    
    const siteDir = site.dir;
    const landoYmlPath = path.join(siteDir, '.lando.yml');
    
    // Read current .lando.yml
    let content = await fs.readFile(landoYmlPath, 'utf-8');
    
    // Update PHP version
    if (php) {
      if (content.includes('php:')) {
        // Replace existing php line
        content = content.replace(/php:\s*['"]?[^'\n"]+['"]?/, `php: '${php}'`);
      } else {
        // Add php line after webroot (or at end of config section)
        if (content.includes('webroot:')) {
          content = content.replace(/(webroot:[^\n]+)/, `$1\n  php: '${php}'`);
        } else if (content.includes('config:')) {
          content = content.replace(/(config:\s*)/, `$1\n  php: '${php}'`);
        }
      }
    }
    
    // Update database
    if (database) {
      if (content.includes('database:')) {
        content = content.replace(/database:\s*.+/, `database: ${database}`);
      } else {
        // Add database line after php or webroot
        if (content.includes('php:')) {
          content = content.replace(/(php:\s*['"]?[^'\n"]+['"]?)/, `$1\n  database: ${database}`);
        } else if (content.includes('webroot:')) {
          content = content.replace(/(webroot:[^\n]+)/, `$1\n  database: ${database}`);
        }
      }
    }
    
    // Update phpMyAdmin
    const hasServices = content.includes('services:');
    const hasPhpMyAdmin = content.includes('type: phpmyadmin') || content.includes('type:phpmyadmin');
    
    if (phpmyadmin && !hasPhpMyAdmin) {
      // Add phpMyAdmin service
      if (hasServices) {
        // Add to existing services
        content = content.replace(/services:/, `services:\n  myservice:\n    type: phpmyadmin`);
      } else {
        // Add services section
        content += `\nservices:\n  myservice:\n    type: phpmyadmin\n`;
      }
    } else if (!phpmyadmin && hasPhpMyAdmin) {
      // Remove phpMyAdmin service
      content = content.replace(/services:\s*\n\s*myservice:\s*\n\s*type:\s*phpmyadmin\s*\n?/, '');
      content = content.replace(/\nservices:\s*\n?$/, ''); // Remove empty services section
    }
    
    // Write updated .lando.yml
    await fs.writeFile(landoYmlPath, content);
    
    res.json({ success: true, message: 'Configuration updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
