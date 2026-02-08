const API_URL = 'http://localhost:3000/api';

let currentDeleteSite = null;
let currentSettingsSite = null;

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
  showToast(`Starting ${name}... (this may take 30-60 seconds)`);
  try {
    // Disable the button to prevent double-clicks
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout
    
    const response = await fetch(`${API_URL}/sites/${name}/start`, {
      method: 'POST',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const result = await response.json();
    
    if (result.success) {
      showToast(`${name} started successfully`, 'success');
      loadSites();
    } else {
      // Check if rebuild is needed
      if (result.needsRebuild) {
        const shouldRebuild = confirm(
          `⚠️ ${name} has a Docker network error and needs to be rebuilt.\n\n` +
          `Click OK to rebuild now (this will take a few minutes), or Cancel to do it manually.`
        );
        
        if (shouldRebuild) {
          rebuildSite(name);
          return;
        }
      }
      
      throw new Error(result.error);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      showToast(`${name} took too long to start. Check the terminal.`, 'error');
    } else {
      showToast(`Failed to start ${name}: ${error.message}`, 'error');
    }
    loadSites(); // Still refresh in case it partially worked
  } finally {
    // Re-enable buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = false);
  }
}

async function stopSite(name) {
  showToast(`Stopping ${name}...`);
  try {
    const response = await fetch(`${API_URL}/sites/${name}/stop`, {
      method: 'POST'
    });
    const result = await response.json();
    
    if (result.success) {
      showToast(`${name} stopped successfully`, 'success');
      loadSites();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to stop ${name}: ${error.message}`, 'error');
  }
}

async function restartSite(name) {
  showToast(`Restarting ${name}...`);
  try {
    const response = await fetch(`${API_URL}/sites/${name}/restart`, {
      method: 'POST'
    });
    const result = await response.json();
    
    if (result.success) {
      showToast(`${name} restarted successfully`, 'success');
      loadSites();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to restart ${name}: ${error.message}`, 'error');
  }
}

async function rebuildSite(name) {
  showToast(`Rebuilding ${name}... This may take a while.`);
  try {
    const response = await fetch(`${API_URL}/sites/${name}/rebuild`, {
      method: 'POST'
    });
    const result = await response.json();
    
    if (result.success) {
      showToast(`${name} rebuilt successfully`, 'success');
      loadSites();
    } else {
      throw new Error(result.error);
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
  showToast(`Destroying ${name}...`);
  
  try {
    const response = await fetch(`${API_URL}/sites/${name}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    
    if (result.success) {
      showToast(`${name} destroyed completely`, 'success');
      loadSites();
    } else {
      throw new Error(result.error);
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
  
  const settings = {
    php: document.getElementById('settingsPhp').value,
    database: document.getElementById('settingsDatabase').value,
    phpmyadmin: document.getElementById('settingsPhpmyadmin').checked
  };
  
  console.log('Saving settings:', settings, 'for site:', currentSettingsSite);
  
  const siteToUpdate = currentSettingsSite; // Store before hiding modal
  
  showToast(`Updating ${siteToUpdate}...`);
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
      showToast(`Settings updated! Rebuilding ${siteToUpdate}...`);
      
      // Rebuild the site
      await rebuildSite(siteToUpdate);
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
