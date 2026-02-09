const API_URL = 'http://localhost:3000/api';

let currentDeleteSite = null;
let currentSettingsSite = null;
let activeOperation = null; // Track ongoing operations

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
  
  // Close modal on outside click
  createModal.addEventListener('click', (e) => {
    if (e.target === createModal) hideModal();
  });
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) hideDeleteModal();
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

// Operation Progress Modal
function showOperationProgress(operation, siteName, operationId = null) {
  activeOperation = { operation, siteName, operationId, pollInterval: null };
  
  // Create overlay if it doesn't exist
  let overlay = document.getElementById('operationOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'operationOverlay';
    overlay.className = 'operation-overlay';
    overlay.innerHTML = `
      <div class="operation-modal">
        <div class="operation-spinner"></div>
        <h3 id="operationTitle"></h3>
        <p id="operationMessage"></p>
        <div id="terminalOutput" class="terminal-output">
          <div id="terminalLines"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  
  const title = document.getElementById('operationTitle');
  const message = document.getElementById('operationMessage');
  const terminalLines = document.getElementById('terminalLines');
  
  // Clear previous logs
  terminalLines.innerHTML = '';
  
  const messages = {
    starting: {
      title: `Starting ${siteName}`,
      message: 'This may take 30-60 seconds...'
    },
    stopping: {
      title: `Stopping ${siteName}`,
      message: 'Stopping containers...'
    },
    restarting: {
      title: `Restarting ${siteName}`,
      message: 'This may take 30-60 seconds...'
    },
    rebuilding: {
      title: `Rebuilding ${siteName}`,
      message: 'This may take several minutes. Please wait...'
    },
    destroying: {
      title: `Destroying ${siteName}`,
      message: 'Removing site and cleaning up...'
    },
    updating: {
      title: `Updating ${siteName}`,
      message: 'Updating configuration and rebuilding...'
    }
  };
  
  const config = messages[operation] || { title: operation, message: 'Processing...' };
  title.textContent = config.title;
  message.textContent = config.message;
  
  overlay.classList.remove('hidden');
  
  // Disable all action buttons
  disableAllActions();
  
  // Start polling for logs if we have an operation ID
  if (operationId) {
    startLogPolling(operationId);
  }
}

function startLogPolling(operationId) {
  let lastLineCount = 0;
  
  const pollLogs = async () => {
    try {
      const response = await fetch(`${API_URL}/operations/${operationId}/logs`);
      const data = await response.json();
      
      if (data.success && data.logs) {
        const terminalLines = document.getElementById('terminalLines');
        
        // Only append new lines
        if (data.logs.length > lastLineCount) {
          const newLines = data.logs.slice(lastLineCount);
          newLines.forEach(line => {
            const lineDiv = document.createElement('div');
            lineDiv.textContent = line;
            terminalLines.appendChild(lineDiv);
          });
          lastLineCount = data.logs.length;
          
          // Auto-scroll to bottom
          const terminal = document.getElementById('terminalOutput');
          terminal.scrollTop = terminal.scrollHeight;
        }
        
        // Check if operation is complete
        if (data.completed) {
          clearInterval(activeOperation.pollInterval);
          activeOperation.pollInterval = null;
          
          // Wait a moment to show final output, then close
          setTimeout(() => {
            hideOperationProgress();
            loadSites(); // Refresh sites list
            
            if (data.operationSuccess) {
              showToast('Operation completed successfully', 'success');
            } else {
              showToast(`Operation failed: ${data.error || 'Unknown error'}`, 'error');
            }
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Error polling logs:', error);
    }
  };
  
  // Poll every 500ms
  activeOperation.pollInterval = setInterval(pollLogs, 500);
  pollLogs(); // Call immediately
}

function hideOperationProgress() {
  const overlay = document.getElementById('operationOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
  
  // Stop polling if active
  if (activeOperation && activeOperation.pollInterval) {
    clearInterval(activeOperation.pollInterval);
  }
  
  activeOperation = null;
  
  // Re-enable all action buttons
  enableAllActions();
}

function disableAllActions() {
  const buttons = document.querySelectorAll('.site-actions button, .settings-btn');
  buttons.forEach(btn => btn.disabled = true);
}

function enableAllActions() {
  const buttons = document.querySelectorAll('.site-actions button, .settings-btn');
  buttons.forEach(btn => btn.disabled = false);
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
  const data = {
    name: formData.get('name'),
    recipe: formData.get('recipe'),
    php: formData.get('php'),
    database: formData.get('database') || undefined,
    webroot: formData.get('webroot') || '.',
    phpmyadmin: formData.get('phpmyadmin') === 'on'
  };
  
  // Show progress
  createForm.classList.add('hidden');
  createProgress.classList.remove('hidden');
  progressText.textContent = 'Creating site... This may take a few minutes.';
  
  try {
    const response = await fetch(`${API_URL}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(`Site ${data.name} created successfully!`, 'success');
      hideModal();
      loadSites();
    } else {
      throw new Error(result.error || 'Failed to create site');
    }
  } catch (error) {
    showToast(error.message, 'error');
    createForm.classList.remove('hidden');
    createProgress.classList.add('hidden');
  }
}

async function startSite(name) {
  if (activeOperation) {
    showToast('Please wait for the current operation to finish', 'error');
    return;
  }
  
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
  if (activeOperation) {
    showToast('Please wait for the current operation to finish', 'error');
    return;
  }
  
  showOperationProgress('stopping', name);
  
  try {
    const response = await fetch(`${API_URL}/sites/${name}/stop`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(`${name} stopped successfully`, 'success');
      await loadSites();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to stop ${name}: ${error.message}`, 'error');
  } finally {
    hideOperationProgress();
  }
}

async function restartSite(name) {
  if (activeOperation) {
    showToast('Please wait for the current operation to finish', 'error');
    return;
  }
  
  showOperationProgress('restarting', name);
  
  try {
    const response = await fetch(`${API_URL}/sites/${name}/restart`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(`${name} restarted successfully`, 'success');
      await loadSites();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to restart ${name}: ${error.message}`, 'error');
  } finally {
    hideOperationProgress();
  }
}

async function rebuildSite(name) {
  if (activeOperation) {
    showToast('Please wait for the current operation to finish', 'error');
    return;
  }
  
  showOperationProgress('rebuilding', name);
  
  try {
    const response = await fetch(`${API_URL}/sites/${name}/rebuild`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(`${name} rebuilt successfully`, 'success');
      await loadSites();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to rebuild ${name}: ${error.message}`, 'error');
  } finally {
    hideOperationProgress();
  }
}

function confirmDeleteSite(name) {
  currentDeleteSite = name;
  deleteSiteName.textContent = name;
  deleteModal.classList.remove('hidden');
}

async function handleConfirmDelete() {
  if (!currentDeleteSite) return;
  
  if (activeOperation) {
    showToast('Please wait for the current operation to finish', 'error');
    return;
  }
  
  const name = currentDeleteSite;
  hideDeleteModal();
  
  showOperationProgress('destroying', name);
  
  try {
    const response = await fetch(`${API_URL}/sites/${name}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(`${name} destroyed completely`, 'success');
      await loadSites();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to destroy ${name}: ${error.message}`, 'error');
  } finally {
    hideOperationProgress();
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
}

async function handleSaveSettings(e) {
  e.preventDefault();
  
  console.log('handleSaveSettings - currentSettingsSite:', currentSettingsSite);
  
  if (!currentSettingsSite || currentSettingsSite === 'null') {
    showToast('Error: No site selected', 'error');
    console.error('currentSettingsSite is null/invalid:', currentSettingsSite);
    return;
  }
  
  if (activeOperation) {
    showToast('Please wait for the current operation to finish', 'error');
    return;
  }
  
  const settings = {
    php: document.getElementById('settingsPhp').value,
    database: document.getElementById('settingsDatabase').value,
    phpmyadmin: document.getElementById('settingsPhpmyadmin').checked
  };
  
  console.log('Saving settings:', settings, 'for site:', currentSettingsSite);
  
  const siteToUpdate = currentSettingsSite;
  hideSettingsModal();
  
  showOperationProgress('updating', siteToUpdate);
  
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
      // Now rebuild the site
      const rebuildResponse = await fetch(`${API_URL}/sites/${siteToUpdate}/rebuild`, {
        method: 'POST'
      });
      
      const rebuildResult = await rebuildResponse.json();
      
      if (rebuildResult.success) {
        showToast(`${siteToUpdate} updated and rebuilt successfully`, 'success');
        await loadSites();
      } else {
        throw new Error(rebuildResult.error || 'Rebuild failed');
      }
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to update settings: ${error.message}`, 'error');
  } finally {
    hideOperationProgress();
  }
}

// Update event listeners
closeSettings.addEventListener('click', () => hideSettingsModal());
cancelSettings.addEventListener('click', () => hideSettingsModal());
settingsForm.addEventListener('submit', handleSaveSettings);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) hideSettingsModal();
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
