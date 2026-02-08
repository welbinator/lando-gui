const API_URL = 'http://localhost:3000/api';

let currentDeleteSite = null;

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
  
  const status = site.running === 'yes' ? 'running' : 'stopped';
  const statusText = site.running === 'yes' ? 'Running' : 'Stopped';
  
  const urls = site.urls || [];
  const mainUrl = urls[0] || `https://${site.app}.lndo.site`;
  
  card.innerHTML = `
    <div class="site-header">
      <h3 class="site-name">${site.app}</h3>
      <span class="site-status ${status}">${statusText}</span>
    </div>
    <div class="site-info">
      <a href="${mainUrl}" target="_blank" class="site-url">${mainUrl}</a>
      <div><strong>Recipe:</strong> ${site.recipe || 'Unknown'}</div>
      <div><strong>Location:</strong> ${site.dir || 'Unknown'}</div>
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
    webroot: formData.get('webroot') || '.'
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
