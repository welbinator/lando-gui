const API_URL = 'http://localhost:3000/api';

let currentDeleteSite = null;
let currentSettingsSite = null;
let activeOperations = new Map(); // Track multiple operations by operationId

// DOM Elements
const sitesContainer = document.getElementById('sitesContainer');
const createBtn = document.getElementById('createBtn');
const settingsBtn = document.getElementById('settingsBtn');
const createModal = document.getElementById('createModal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const createForm = document.getElementById('createForm');
const createProgress = document.getElementById('createProgress');
const progressText = document.getElementById('progressText');
const deleteModal = document.getElementById('deleteModal');
const deleteSiteName = document.getElementById('deleteSiteName');
const cancelDelete = document.getElementById('cancelDelete');
const confirmDelete = document.getElementById('confirmDelete');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const cancelSettings = document.getElementById('cancelSettings');
const settingsForm = document.getElementById('settingsForm');
const settingsSiteName = document.getElementById('settingsSiteName');
const loading = document.getElementById('loading');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSites();
  setupEventListeners();
});

function setupEventListeners() {
  createBtn.addEventListener('click', () => openModal());
  settingsBtn.addEventListener('click', () => window.location.href = '/setup.html');
  closeModal.addEventListener('click', () => hideModal());
  cancelBtn.addEventListener('click', () => hideModal());
  createForm.addEventListener('submit', handleCreateSite);
  cancelDelete.addEventListener('click', () => hideDeleteModal());
  confirmDelete.addEventListener('click', handleConfirmDelete);
  
  // Progress modal close button
  const closeProgress = document.getElementById('closeProgress');
  closeProgress.addEventListener('click', () => {
    // Get the current operation
    for (const [opId, opData] of activeOperations.entries()) {
      if (!opData.minimized) {
        minimizeOperation(opId);
        break;
      }
    }
  });
  
  // Close modal on outside click
  createModal.addEventListener('click', (e) => {
    if (e.target === createModal) hideModal();
  });
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) hideDeleteModal();
  });
  
  const progressModal = document.getElementById('progressModal');
  progressModal.addEventListener('click', (e) => {
    if (e.target === progressModal) {
      // Minimize instead of close
      for (const [opId, opData] of activeOperations.entries()) {
        if (!opData.minimized) {
          minimizeOperation(opId);
          break;
        }
      }
    }
  });
}

function openModal() {
  createModal.classList.remove('hidden');
  createForm.reset();
}

function hideModal() {
  createModal.classList.add('hidden');
  createProgress.classList.add('hidden');
  createForm.classList.remove('hidden');
}

function hideDeleteModal() {
  deleteModal.classList.add('hidden');
  currentDeleteSite = null;
}

// Operation Progress - Minimized Cards
function showOperationProgress(operation, siteName, operationId = null) {
  // Show the progress modal
  const progressModal = document.getElementById('progressModal');
  const progressTitle = document.getElementById('progressTitle');
  const terminalOutput = document.getElementById('terminalOutput');
  
  const operationLabels = {
    creating: 'Creating',
    starting: 'Starting',
    stopping: 'Stopping',
    restarting: 'Restarting',
    rebuilding: 'Rebuilding',
    migrating: 'Migrating',
    destroying: 'Destroying',
    updating: 'Updating'
  };
  
  const label = operationLabels[operation] || operation;
  progressTitle.textContent = `${label} ${siteName}`;
  terminalOutput.innerHTML = '<div class="log-line">Starting operation...</div>';
  progressModal.classList.remove('hidden');
  
  // Track this operation
  const opData = {
    operation,
    siteName,
    operationId,
    pollInterval: null,
    minimized: false
  };
  activeOperations.set(operationId, opData);
  
  // Start polling for logs if we have an operation ID
  if (operationId) {
    startLogPolling(operationId);
  }
}

function minimizeOperation(operationId) {
  const opData = activeOperations.get(operationId);
  if (!opData || opData.minimized) return;
  
  // Hide the modal
  document.getElementById('progressModal').classList.add('hidden');
  
  // Create operations container if it doesn't exist
  let container = document.getElementById('operationsContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'operationsContainer';
    container.className = 'operations-container';
    document.body.appendChild(container);
  }
  
  // Create minimized card for this operation
  const card = document.createElement('div');
  card.id = `op-${operationId}`;
  card.className = 'operation-card';
  
  const operationLabels = {
    creating: 'Creating',
    starting: 'Starting',
    stopping: 'Stopping',
    restarting: 'Restarting',
    rebuilding: 'Rebuilding',
    migrating: 'Migrating',
    destroying: 'Destroying',
    updating: 'Updating'
  };
  
  const label = operationLabels[opData.operation] || opData.operation;
  
  card.innerHTML = `
    <div class="operation-card-spinner"></div>
    <div class="operation-card-content">
      <div class="operation-card-title">${opData.siteName}</div>
      <div class="operation-card-status">${label}...</div>
    </div>
  `;
  
  // Click to re-open modal
  card.addEventListener('click', () => {
    restoreOperation(operationId);
  });
  
  container.appendChild(card);
  opData.card = card;
  opData.minimized = true;
}

function restoreOperation(operationId) {
  const opData = activeOperations.get(operationId);
  if (!opData) return;
  
  // Remove the minimized card
  if (opData.card) {
    opData.card.remove();
  }
  
  // Show the modal again
  const progressModal = document.getElementById('progressModal');
  const progressTitle = document.getElementById('progressTitle');
  
  const operationLabels = {
    creating: 'Creating',
    starting: 'Starting',
    stopping: 'Stopping',
    restarting: 'Restarting',
    rebuilding: 'Rebuilding',
    migrating: 'Migrating',
    destroying: 'Destroying',
    updating: 'Updating'
  };
  
  const label = operationLabels[opData.operation] || opData.operation;
  progressTitle.textContent = `${label} ${opData.siteName}`;
  progressModal.classList.remove('hidden');
  
  opData.minimized = false;
}

function startLogPolling(operationId) {
  const opData = activeOperations.get(operationId);
  if (!opData) return;
  
  const pollLogs = async () => {
    try {
      const response = await fetch(`${API_URL}/operations/${operationId}/logs`);
      const data = await response.json();
      
      if (data.success && data.logs) {
        // Update terminal output if modal is visible
        if (!opData.minimized) {
          const terminalOutput = document.getElementById('terminalOutput');
          terminalOutput.innerHTML = data.logs
            .map(line => `<div class="log-line">${escapeHtml(line)}</div>`)
            .join('');
          // Auto-scroll to bottom
          terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
        
        // Check if operation is complete
        if (data.completed) {
          clearInterval(opData.pollInterval);
          
          if (data.operationSuccess) {
            showToast(`${opData.siteName} ${opData.operation} completed`, 'success');
            
            // If minimized, update card
            if (opData.minimized && opData.card) {
              const statusEl = opData.card.querySelector('.operation-card-status');
              statusEl.textContent = 'Complete ✓';
              opData.card.classList.add('success');
              
              // Remove spinner
              const spinner = opData.card.querySelector('.operation-card-spinner');
              if (spinner) spinner.remove();
              
              // Remove card after 3 seconds
              setTimeout(() => {
                opData.card.remove();
                activeOperations.delete(operationId);
              }, 3000);
            } else {
              // Close modal and show success
              document.getElementById('progressModal').classList.add('hidden');
              activeOperations.delete(operationId);
            }
            
            loadSites(); // Refresh sites list
          } else {
            showToast(`${opData.siteName} ${opData.operation} failed: ${data.error || 'Unknown error'}`, 'error');
            
            // If minimized, update card
            if (opData.minimized && opData.card) {
              const statusEl = opData.card.querySelector('.operation-card-status');
              statusEl.textContent = 'Failed ✗';
              opData.card.classList.add('error');
              
              // Remove spinner
              const spinner = opData.card.querySelector('.operation-card-spinner');
              if (spinner) spinner.remove();
              
              // Keep card visible so user can click to see logs
            } else {
              // Keep modal open so user can see error logs
            }
          }
        }
      }
    } catch (error) {
      console.error('Error polling logs:', error);
    }
  };
  
  // Poll every 500ms
  opData.pollInterval = setInterval(pollLogs, 500);
  pollLogs(); // Call immediately
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadSites() {
  loading.classList.remove('hidden');
  sitesContainer.innerHTML = '';
  
  try {
    const response = await fetch(`${API_URL}/sites`);
    const data = await response.json();
    
    if (data.success && data.sites.length > 0) {
      data.sites.forEach(site => renderSiteCard(site));
    } else {
      showEmptyState();
    }
  } catch (error) {
    showToast('Failed to load sites', 'error');
    console.error(error);
  } finally {
    loading.classList.add('hidden');
  }
}

function renderSiteCard(site) {
  const card = document.createElement('div');
  card.className = 'site-card';
  
  // Validate site data
  if (!site.app) {
    console.error('Site missing app name:', site);
    return;
  }
  
  const status = site.running === 'yes' ? 'running' : 'stopped';
  const statusText = site.running === 'yes' ? 'Running' : 'Stopped';
  
  const urls = site.urls || [];
  const mainUrl = urls[0] || `https://${site.app}.lndo.site`;
  const isRunning = status === 'running';
  
  card.innerHTML = `
    <div class="site-header">
      <h3 class="site-name">${site.app}</h3>
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <button class="btn-icon settings-btn" data-site="${site.app}" title="Settings">⚙️</button>
        <span class="site-status ${status}">${statusText}</span>
      </div>
    </div>
    <div class="site-info">
      <a href="${mainUrl}" target="_blank" class="site-url">${mainUrl}</a>
      ${isRunning ? `<a href="${mainUrl}/wp-admin" target="_blank" class="site-url" style="font-size: 0.9rem; opacity: 0.8;">→ WP Admin</a>` : ''}
      <div><strong>Recipe:</strong> ${site.recipe || 'Unknown'}</div>
      <div><strong>Location:</strong> ${site.dir || 'Unknown'}</div>
      ${isRunning && site.phpmyadminUrl ? `<a href="${site.phpmyadminUrl}" target="_blank" class="btn btn-info btn-sm" style="margin-top: 0.5rem;">📊 phpMyAdmin</a>` : ''}
    </div>
    <div class="site-actions">
      ${status === 'stopped' ? 
        `<button class="btn btn-success btn-sm" onclick="startSite('${site.app}')">Start</button>` :
        `<button class="btn btn-secondary btn-sm" onclick="stopSite('${site.app}')">Stop</button>`
      }
      <button class="btn btn-secondary btn-sm" onclick="restartSite('${site.app}')">Restart</button>
      <button class="btn btn-secondary btn-sm" onclick="rebuildSite('${site.app}')">Rebuild</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDeleteSite('${site.app}')">Destroy</button>
    </div>
  `;
  
  sitesContainer.appendChild(card);
}

function showEmptyState() {
  sitesContainer.innerHTML = `
    <div class="empty-state">
      <h2>No Sites Yet</h2>
      <p>Create your first Lando site to get started!</p>
    </div>
  `;
}

async function handleCreateSite(e) {
  e.preventDefault();
  
  const formData = new FormData(createForm);
  
  // Sanitize site name to match Lando conventions (lowercase, hyphens)
  const rawName = formData.get('name');
  const sanitizedName = rawName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // spaces to hyphens
    .replace(/[^a-z0-9-]/g, '')     // remove non-alphanumeric except hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '');         // trim leading/trailing hyphens
  
  const data = {
    name: sanitizedName,
    recipe: formData.get('recipe'),
    php: formData.get('php'),
    database: formData.get('database') || undefined,
    webroot: formData.get('webroot') || '.',
    phpmyadmin: formData.get('phpmyadmin') === 'on'
  };
  
  try {
    const response = await fetch(`${API_URL}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success && result.operationId) {
      // Hide the create modal
      hideModal();
      // Show progress modal with terminal output
      showOperationProgress('creating', data.name, result.operationId);
    } else {
      throw new Error(result.error || 'Failed to create site');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function startSite(name) {
  try {
    const response = await fetch(`${API_URL}/sites/${name}/start`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success && result.operationId) {
      // Show progress modal with terminal output
      showOperationProgress('starting', name, result.operationId);
    } else if (result.needsRebuild) {
      const shouldRebuild = confirm(
        `⚠️ ${name} has a Docker network error and needs to be rebuilt.\n\n` +
        `Click OK to rebuild now (this will take a few minutes), or Cancel to do it manually.`
      );
      
      if (shouldRebuild) {
        await rebuildSite(name);
      }
    } else {
      throw new Error(result.error || 'Failed to start site');
    }
  } catch (error) {
    showToast(`Failed to start ${name}: ${error.message}`, 'error');
  }
}

async function stopSite(name) {
  try {
    const response = await fetch(`${API_URL}/sites/${name}/stop`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success && result.operationId) {
      showOperationProgress('stopping', name, result.operationId);
    } else {
      throw new Error(result.error || 'Failed to stop site');
    }
  } catch (error) {
    showToast(`Failed to stop ${name}: ${error.message}`, 'error');
  }
}

async function restartSite(name) {
  try {
    const response = await fetch(`${API_URL}/sites/${name}/restart`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success && result.operationId) {
      showOperationProgress('restarting', name, result.operationId);
    } else {
      throw new Error(result.error || 'Failed to restart site');
    }
  } catch (error) {
    showToast(`Failed to restart ${name}: ${error.message}`, 'error');
  }
}

async function rebuildSite(name) {
  try {
    const response = await fetch(`${API_URL}/sites/${name}/rebuild`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success && result.operationId) {
      showOperationProgress('rebuilding', name, result.operationId);
    } else {
      throw new Error(result.error || 'Failed to rebuild site');
    }
  } catch (error) {
    showToast(`Failed to rebuild ${name}: ${error.message}`, 'error');
  }
}

function confirmDeleteSite(name) {
  currentDeleteSite = name;
  deleteSiteName.textContent = name;
  deleteModal.classList.remove('hidden');
}

async function handleConfirmDelete() {
  if (!currentDeleteSite) return;
  
  const name = currentDeleteSite;
  hideDeleteModal();
  
  try {
    const response = await fetch(`${API_URL}/sites/${name}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success && result.operationId) {
      showOperationProgress('destroying', name, result.operationId);
    } else {
      throw new Error(result.error || 'Failed to destroy site');
    }
  } catch (error) {
    showToast(`Failed to destroy ${name}: ${error.message}`, 'error');
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Site Settings Modal Functions
let originalDatabaseVersion = null;

async function openSiteSettings(siteName) {
  console.log('openSiteSettings called with:', siteName);
  
  if (!siteName || siteName === 'null' || siteName === 'undefined') {
    showToast('Error: Invalid site name', 'error');
    console.error('openSiteSettings called with invalid siteName:', siteName);
    return;
  }
  
  currentSettingsSite = siteName;
  console.log('currentSettingsSite set to:', currentSettingsSite);
  settingsSiteName.textContent = siteName;
  
  // Fetch current site settings
  showToast('Loading site settings...');
  try {
    const url = `${API_URL}/sites/${encodeURIComponent(siteName)}/config`;
    console.log('Fetching config from:', url);
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.success) {
      // Populate form with current values
      document.getElementById('settingsPhp').value = result.config.php || '8.1';
      document.getElementById('settingsDatabase').value = result.config.database || 'mysql:8.0';
      document.getElementById('settingsPhpmyadmin').checked = result.config.hasPhpMyAdmin || false;
      
      // Store original database version for comparison
      originalDatabaseVersion = result.config.database || 'mysql:8.0';
      
      settingsModal.classList.remove('hidden');
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to load settings: ${error.message}`, 'error');
  }
}

function hideSettingsModal() {
  settingsModal.classList.add('hidden');
  currentSettingsSite = null;
  originalDatabaseVersion = null;
}

async function handleSaveSettings(e) {
  e.preventDefault();
  
  console.log('handleSaveSettings - currentSettingsSite:', currentSettingsSite);
  
  if (!currentSettingsSite || currentSettingsSite === 'null') {
    showToast('Error: No site selected', 'error');
    console.error('currentSettingsSite is null/invalid:', currentSettingsSite);
    return;
  }
  
  const settings = {
    php: document.getElementById('settingsPhp').value,
    database: document.getElementById('settingsDatabase').value,
    phpmyadmin: document.getElementById('settingsPhpmyadmin').checked
  };
  
  console.log('Saving settings:', settings, 'for site:', currentSettingsSite);
  
  // Check if database version changed
  if (settings.database !== originalDatabaseVersion) {
    console.log(`Database version changed from ${originalDatabaseVersion} to ${settings.database}`);
    // Store settings for later and show warning modal
    window.pendingMysqlMigration = {
      siteName: currentSettingsSite,
      settings: settings
    };
    hideSettingsModal();
    document.getElementById('mysqlWarningModal').classList.remove('hidden');
    return;
  }
  
  // Normal save (no MySQL change)
  const siteToUpdate = currentSettingsSite;
  hideSettingsModal();
  
  try {
    const url = `${API_URL}/sites/${encodeURIComponent(siteToUpdate)}/config`;
    console.log('PUT to:', url);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Now rebuild the site with streaming
      const rebuildResponse = await fetch(`${API_URL}/sites/${siteToUpdate}/rebuild`, {
        method: 'POST'
      });
      
      const rebuildResult = await rebuildResponse.json();
      
            if (rebuildResult.success && rebuildResult.operationId) {
        showOperationProgress('updating', siteToUpdate, rebuildResult.operationId);
      } else {
        throw new Error(rebuildResult.error || 'Rebuild failed');
      }
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to update settings: ${error.message}`, 'error');
  }
}

// Update event listeners
closeSettings.addEventListener('click', () => hideSettingsModal());
cancelSettings.addEventListener('click', () => hideSettingsModal());
settingsForm.addEventListener('submit', handleSaveSettings);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) hideSettingsModal();
});

// MySQL Warning Modal handlers
document.getElementById('cancelMysqlMigration').addEventListener('click', () => {
  document.getElementById('mysqlWarningModal').classList.add('hidden');
  window.pendingMysqlMigration = null;
});

document.getElementById('confirmMysqlMigration').addEventListener('click', async () => {
  const migration = window.pendingMysqlMigration;
  if (!migration) return;
  
  document.getElementById('mysqlWarningModal').classList.add('hidden');
  
  try {
    const response = await fetch(`${API_URL}/sites/${migration.siteName}/migrate-mysql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(migration.settings)
    });
    
    const result = await response.json();
    
    if (result.success && result.operationId) {
      showOperationProgress('migrating', migration.siteName, result.operationId);
    } else {
      throw new Error(result.error || 'Migration failed');
    }
  } catch (error) {
    showToast(`Failed to migrate MySQL: ${error.message}`, 'error');
  } finally {
    window.pendingMysqlMigration = null;
  }
});

// Delegate settings button clicks (since buttons are dynamically added)
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('settings-btn') || e.target.closest('.settings-btn')) {
    const btn = e.target.classList.contains('settings-btn') ? e.target : e.target.closest('.settings-btn');
    const siteName = btn.getAttribute('data-site');
    if (siteName) {
      openSiteSettings(siteName);
    }
  }
});
