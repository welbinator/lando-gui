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

async function openModal() {
  createModal.classList.remove('hidden');
  createForm.reset();
  
  // Load config and set default PHP version
  try {
    const response = await fetch(`${API_URL}/config`);
    const data = await response.json();
    if (data.success && data.config && data.config.defaultPhpVersion) {
      document.getElementById('php').value = data.config.defaultPhpVersion;
    }
  } catch (error) {
    console.error('Failed to load default PHP version:', error);
  }
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
  const card = document.createElement('article');
  card.className = 'site-card';
  
  // Validate site data
  if (!site.app) {
    console.error('Site missing app name:', site);
    return;
  }
  
  const status = site.running === 'yes' ? 'running' : 'stopped';
  const statusText = site.running === 'yes' ? 'Running' : 'Stopped';
  card.classList.add(`status-${status}`);
  
  const urls = site.urls || [];
  const mainUrl = urls[0] || `https://${site.app}.lndo.site`;
  const isRunning = status === 'running';
  
  // SVG Icons
  const globeIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;
  const keyIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`;
  const gearIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.04.17 0 .36.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.04-.17 0-.36-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;
  const clockIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;
  const eyeIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
  const stopIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>`;
  const playIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  const restartIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;
  const rebuildIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M9.01 14H2v2h7.01v3L13 15l-3.99-4v3zm5.98-1v-3H22V8h-7.01V5L11 9l3.99 4z"/></svg>`;
  const trashIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
  
  card.innerHTML = `
    <header class="card-header">
      <div class="header-main">
        <h3 class="site-name">${site.app}</h3>
        <span class="status-badge"><span class="status-dot"></span>${statusText}</span>
      </div>
      <button class="settings-btn" data-site="${site.app}" aria-label="Settings">
        ${gearIcon}
      </button>
    </header>
    
    <div class="card-body">
      <ul class="data-list">
        <li>
          ${globeIcon}
          <a href="${mainUrl}" target="_blank" class="data-link">${mainUrl}</a>
        </li>
        ${isRunning ? `
        <li>
          ${keyIcon}
          <a href="${mainUrl}/wp-admin" target="_blank" class="data-link">${mainUrl}/wp-admin</a>
        </li>
        ` : ''}
      </ul>
      <div class="meta-secondary">
        <span><strong>Recipe:</strong> ${site.recipe || 'Unknown'}</span>
        <span class="meta-separator">|</span>
        <span><strong>Location:</strong> ${site.dir || 'Unknown'}</span>
      </div>
      <div id="ngrok-status-${site.app}" class="ngrok-status"></div>
    </div>
    
    <div class="card-utility-actions">
      <button class="btn-utility" id="phpmyadmin-btn-${site.app}" data-site="${site.app}" data-action="phpmyadmin" data-url="${site.phpmyadminUrl || ''}" ${!site.phpmyadminUrl || !isRunning ? 'disabled' : ''}>
        ${clockIcon}
        phpMyAdmin
      </button>
      <button class="btn-utility" id="ngrok-btn-${site.app}" data-site="${site.app}" data-action="make-public" ${!isRunning ? 'disabled' : ''}>
        ${eyeIcon}
        Make Public
      </button>
    </div>
    
    <footer class="card-state-actions">
      ${status === 'running' ? `
        <button class="btn-state" data-site="${site.app}" data-action="stop">
          ${stopIcon}
          Stop
        </button>
      ` : `
        <button class="btn-state" data-site="${site.app}" data-action="start">
          ${playIcon}
          Start
        </button>
      `}
      <button class="btn-state" data-site="${site.app}" data-action="restart">
        ${restartIcon}
        Restart
      </button>
      <button class="btn-state" data-site="${site.app}" data-action="rebuild">
        ${rebuildIcon}
        Rebuild
      </button>
      <button class="btn-state destroy-btn" data-site="${site.app}" data-action="destroy">
        ${trashIcon}
        Destroy
      </button>
    </footer>
  `;
  
  sitesContainer.appendChild(card);
  
  // Check ngrok status if site is running
  if (isRunning) {
    checkNgrokStatus(site.app);
  }
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
  
  // Handle btn-state clicks (Start, Stop, Restart, Rebuild, Destroy)
  if (e.target.classList.contains('btn-state') || e.target.closest('.btn-state')) {
    const btn = e.target.classList.contains('btn-state') ? e.target : e.target.closest('.btn-state');
    const action = btn.getAttribute('data-action');
    const siteName = btn.getAttribute('data-site');
    
    if (siteName && action) {
      switch(action) {
        case 'start':
          startSite(siteName);
          break;
        case 'stop':
          stopSite(siteName);
          break;
        case 'restart':
          restartSite(siteName);
          break;
        case 'rebuild':
          rebuildSite(siteName);
          break;
        case 'destroy':
          confirmDeleteSite(siteName);
          break;
      }
    }
  }
  
  // Handle utility button clicks (Make Public, phpMyAdmin)
  if (e.target.classList.contains('btn-utility') || e.target.closest('.btn-utility')) {
    const btn = e.target.classList.contains('btn-utility') ? e.target : e.target.closest('.btn-utility');
    
    // Don't do anything if button is disabled
    if (btn.disabled) return;
    
    const action = btn.getAttribute('data-action');
    const siteName = btn.getAttribute('data-site');
    
    if (siteName) {
      if (action === 'make-public') {
        toggleNgrok(siteName);
      } else if (action === 'phpmyadmin') {
        const url = btn.getAttribute('data-url');
        if (url) {
          window.open(url, '_blank');
        }
      }
    }
  }
});

// ==================== Ngrok Functions ====================

async function checkNgrokStatus(siteName) {
  try {
    const response = await fetch(`${API_URL}/sites/${siteName}/ngrok/status`);
    const result = await response.json();
    
    if (result.active) {
      updateNgrokUI(siteName, result.url);
    }
  } catch (error) {
    console.error('Failed to check ngrok status:', error);
  }
}

async function toggleNgrok(siteName) {
  const statusDiv = document.getElementById(`ngrok-status-${siteName}`);
  const btn = document.getElementById(`ngrok-btn-${siteName}`);
  
  // Check current status
  try {
    const statusResponse = await fetch(`${API_URL}/sites/${siteName}/ngrok/status`);
    const status = await statusResponse.json();
    
    if (status.active) {
      // Stop tunnel
      btn.disabled = true;
      btn.textContent = '🔄 Stopping...';
      
      const response = await fetch(`${API_URL}/sites/${siteName}/ngrok/stop`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        statusDiv.innerHTML = '';
        btn.textContent = '🌐 Make Public';
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-info');
        showToast('Tunnel stopped', 'success');
      } else {
        throw new Error(result.error || 'Failed to stop tunnel');
      }
    } else {
      // Start tunnel
      btn.disabled = true;
      btn.textContent = '🔄 Starting...';
      
      const response = await fetch(`${API_URL}/sites/${siteName}/ngrok/start`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        updateNgrokUI(siteName, result.url);
        showToast('Tunnel started!', 'success');
      } else {
        throw new Error(result.error || 'Failed to start tunnel');
      }
    }
  } catch (error) {
    showToast(`Ngrok error: ${error.message}`, 'error');
    btn.textContent = '🌐 Make Public';
  } finally {
    btn.disabled = false;
  }
}

function updateNgrokUI(siteName, url) {
  const statusDiv = document.getElementById(`ngrok-status-${siteName}`);
  const btn = document.getElementById(`ngrok-btn-${siteName}`);
  
  const eyeIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
  const stopIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>`;
  
  statusDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: #e8f5e9; border-radius: 4px; border: 1px solid #4caf50;">
      <span style="color: #2e7d32; font-weight: 500;">🌐 Public:</span>
      <a href="${url}" target="_blank" style="color: #1976d2; text-decoration: none; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${url}</a>
      <button onclick="copyToClipboard('${url}')" class="btn btn-sm" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" title="Copy URL">📋</button>
    </div>
  `;
  
  if (btn) {
    btn.innerHTML = `${stopIcon} Stop Sharing`;
    btn.style.background = '#ffc107';
    btn.style.color = '#000';
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('URL copied to clipboard!', 'success');
  }).catch(err => {
    showToast('Failed to copy URL', 'error');
    console.error('Copy failed:', err);
  });
}
