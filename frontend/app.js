/**
 * CloudVault — Dashboard Application Logic
 * Dropdown action menu · Share modal · Upload progress · File table
 */

'use strict';

// ── Config ────────────────────────────────────────────────────
const getApiBase = () => {
  const val = document.getElementById('apiBaseUrl')?.value?.trim();
  return val ? `http://${val}` : 'http://localhost:3001';
};
const buildShareLink = (fileId) => `${getApiBase()}/share/${fileId}`;

// ── DOM Refs ──────────────────────────────────────────────────
const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const selectedName    = document.getElementById('selectedFileName');
const browseBtn       = document.getElementById('browseBtn');
const uploadBtn       = document.getElementById('uploadBtn');
const progressWrap    = document.getElementById('progressWrap');
const progressFill    = document.getElementById('progressFill');
const progressLabel   = document.getElementById('progressLabel');
const progressPct     = document.getElementById('progressPct');
const toastArea       = document.getElementById('toastArea');
const refreshBtn      = document.getElementById('refreshBtn');
const emptyState      = document.getElementById('emptyState');
const skeletonList    = document.getElementById('skeletonList');
const fileTableWrap   = document.getElementById('fileTableWrap');
const fileTableBody   = document.getElementById('fileTableBody');
const fileCountChip   = document.getElementById('fileCountChip');
const server3001Pill  = document.getElementById('server3001');
const server3002Pill  = document.getElementById('server3002');

// Share modal
const shareModalOverlay  = document.getElementById('shareModalOverlay');
const shareModalFileName = document.getElementById('shareModalFileName');
const shareLinkUrl       = document.getElementById('shareLinkUrl');
const copyShareLinkBtn   = document.getElementById('copyShareLinkBtn');
const openShareLinkBtn   = document.getElementById('openShareLinkBtn');
const shareModalClose    = document.getElementById('shareModalClose');
const closeShareModalBtn = document.getElementById('closeShareModalBtn');

let selectedFile    = null;
let currentShareUrl = '';

// ═══════════════════════════════════════════════════════════════
//  DROPDOWN ACTION MENUS
//  Opens a dropdown with Share / Download / Delete per file row
// ═══════════════════════════════════════════════════════════════

function closeAllDropdowns(except) {
  document.querySelectorAll('.file-actions.open').forEach(el => {
    if (el !== except) el.classList.remove('open');
  });
}

document.addEventListener('click', (e) => {
  // Close any open dropdown if click is outside
  if (!e.target.closest('.file-actions')) {
    closeAllDropdowns(null);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllDropdowns(null);
    if (shareModalOverlay.classList.contains('visible')) closeShareModal();
  }
});

// Toggle a specific dropdown
function toggleDropdown(wrapper) {
  const isOpen = wrapper.classList.contains('open');
  closeAllDropdowns(null);
  if (!isOpen) wrapper.classList.add('open');
}

// ═══════════════════════════════════════════════════════════════
//  SHARE MODAL
// ═══════════════════════════════════════════════════════════════

function openShareModal(fileId, fileName) {
  currentShareUrl = buildShareLink(fileId);
  shareModalFileName.textContent = fileName;
  shareLinkUrl.textContent       = currentShareUrl;
  shareModalOverlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeShareModal() {
  shareModalOverlay.classList.remove('visible');
  document.body.style.overflow = '';
  currentShareUrl = '';
}

shareModalOverlay.addEventListener('click', (e) => {
  if (e.target === shareModalOverlay) closeShareModal();
});
shareModalClose.addEventListener('click', closeShareModal);
closeShareModalBtn.addEventListener('click', closeShareModal);

copyShareLinkBtn.addEventListener('click', () => copyToClipboard(currentShareUrl, copyShareLinkBtn));
openShareLinkBtn.addEventListener('click', () => window.open(currentShareUrl, '_blank'));

// Clipboard helper
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = original; btn.classList.remove('copied'); }, 2200);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Link copied!', 'success');
  });
}

// ═══════════════════════════════════════════════════════════════
//  FILE SELECTION
// ═══════════════════════════════════════════════════════════════

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', () => handleFileSelect(fileInput.files[0]));

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

function handleFileSelect(file) {
  if (!file) return;
  selectedFile = file;
  selectedName.textContent = `${file.name}  (${formatBytes(file.size)})`;
  uploadBtn.disabled = false;
}

// ═══════════════════════════════════════════════════════════════
//  UPLOAD
// ═══════════════════════════════════════════════════════════════

uploadBtn.addEventListener('click', uploadFile);

async function uploadFile() {
  if (!selectedFile) return;
  const formData = new FormData();
  formData.append('file', selectedFile);
  const fileName = selectedFile.name;

  uploadBtn.disabled = true;
  progressWrap.style.display = 'block';
  setProgress(0, 'Uploading…');

  try {
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 95), 'Streaming to S3…');
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(100, 'Done!');
          resolve(JSON.parse(xhr.responseText));
        } else {
          let detail = xhr.responseText;
          try { detail = JSON.parse(xhr.responseText).error || detail; } catch (_) {}
          reject(new Error(`${xhr.status}: ${detail}`));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Network error — is the server running?')));
      xhr.open('POST', `${getApiBase()}/upload`);
      xhr.send(formData);
    });

    resetUploadUI();
    await loadFiles();
    if (result.fileId) {
      setTimeout(() => openShareModal(result.fileId, result.fileName || fileName), 400);
    }
  } catch (err) {
    showToast(`✗ Upload failed: ${err.message}`, 'error');
    setProgress(0, 'Failed');
    uploadBtn.disabled = false;
  }
}

function setProgress(pct, label) {
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = label;
  progressPct.textContent   = `${pct}%`;
}

function resetUploadUI() {
  selectedFile = null;
  fileInput.value = '';
  selectedName.textContent = '';
  uploadBtn.disabled = true;
  setTimeout(() => { progressWrap.style.display = 'none'; setProgress(0, 'Uploading…'); }, 1400);
}

// ═══════════════════════════════════════════════════════════════
//  FILE LIST
// ═══════════════════════════════════════════════════════════════

refreshBtn.addEventListener('click', loadFiles);

async function loadFiles() {
  showSkeleton();
  try {
    const res = await fetch(`${getApiBase()}/files`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { files } = await res.json();
    renderFiles(files || []);
  } catch (err) {
    showEmptyState();
    showToast(`Could not load files: ${err.message}`, 'error');
  }
}

function renderFiles(files) {
  fileCountChip.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
  if (files.length === 0) { showEmptyState(); return; }

  fileTableBody.innerHTML = '';

  files.forEach((f) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="file-name-cell">
          <div class="file-icon" style="background:${fileIconBg(f.mimeType)}">${fileIconEmoji(f.mimeType)}</div>
          <div>
            <div class="file-name-text" title="${escHtml(f.fileName)}">${escHtml(f.fileName)}</div>
            <div class="file-id">${f.fileId}</div>
          </div>
        </div>
      </td>
      <td><span class="mime-badge">${shortMime(f.mimeType)}</span></td>
      <td>${formatBytes(f.size)}</td>
      <td>${formatDate(f.uploadDate)}</td>
      <td style="text-align:right">
        <div class="file-actions" data-id="${f.fileId}" data-name="${escHtml(f.fileName)}">
          <button class="actions-trigger" aria-label="File options" aria-haspopup="true">
            <div class="dot-menu">
              <span></span><span></span><span></span>
            </div>
          </button>
          <div class="actions-menu" role="menu">
            <button class="actions-item" data-action="share" role="menuitem">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Share Link
            </button>
            <button class="actions-item" data-action="download" role="menuitem">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              Download
            </button>
            <div class="actions-divider"></div>
            <button class="actions-item actions-item--danger" data-action="delete" role="menuitem">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1h3a.5.5 0 01.5.5v1H6v-1a.5.5 0 01.5-.5zM11 2.5v-1A1.5 1.5 0 009.5 0h-3A1.5 1.5 0 005 1.5v1H2.506a.58.58 0 00-.01 0H1.5a.5.5 0 000 1h.538l.853 10.66A2 2 0 004.885 16h6.23a2 2 0 001.994-1.84l.853-10.66H13.5a.5.5 0 000-1h-.995a.59.59 0 00-.01 0H11zm1.958 1l-.846 10.58a1 1 0 01-.997.92H4.885a1 1 0 01-.997-.92L3.042 3.5h9.916zm-7.487 1a.5.5 0 01.528.47l.5 8.5a.5.5 0 01-.998.06L5 6.03a.5.5 0 01.47-.53zm5.058 0a.5.5 0 01.47.53l-.5 8.5a.5.5 0 10-.998-.06l.5-8.5a.5.5 0 01.528-.47zM8 5.5a.5.5 0 01.5.5v8a.5.5 0 01-1 0V6a.5.5 0 01.5-.5z"/></svg>
              Delete
            </button>
          </div>
        </div>
      </td>
    `;

    // Wire up the trigger button
    const wrapper = tr.querySelector('.file-actions');
    const trigger = wrapper.querySelector('.actions-trigger');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(wrapper);
    });

    // Wire up menu items
    wrapper.querySelectorAll('.actions-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.remove('open');
        const action = item.dataset.action;
        const id     = wrapper.dataset.id;
        const name   = wrapper.dataset.name;
        if (action === 'share')    handleShare(id, name);
        if (action === 'download') handleDownload(id, name, item);
        if (action === 'delete')   handleDelete(id, tr);
      });
    });

    fileTableBody.appendChild(tr);
  });

  emptyState.style.display    = 'none';
  skeletonList.style.display  = 'none';
  fileTableWrap.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
//  SHARE
// ═══════════════════════════════════════════════════════════════

function handleShare(fileId, fileName) {
  openShareModal(fileId, fileName);
}

// ═══════════════════════════════════════════════════════════════
//  DOWNLOAD
// ═══════════════════════════════════════════════════════════════

async function handleDownload(fileId, fileName, btn) {
  const original = btn.innerHTML;
  btn.innerHTML  = '⏳ Downloading…';
  btn.disabled   = true;

  try {
    const res = await fetch(`${getApiBase()}/download/${fileId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { downloadUrl } = await res.json();

    const a = document.createElement('a');
    a.href = downloadUrl; a.download = fileName; a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`↓ Downloading "${fileName}"…`, 'info');
  } catch (err) {
    showToast(`Download failed: ${err.message}`, 'error');
  } finally {
    btn.innerHTML = original;
    btn.disabled  = false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  DELETE
// ═══════════════════════════════════════════════════════════════

async function handleDelete(fileId, rowEl) {
  if (!confirm('Permanently delete this file from S3 and DynamoDB?')) return;
  rowEl.style.opacity = '0.4';
  rowEl.style.pointerEvents = 'none';

  try {
    const res = await fetch(`${getApiBase()}/delete/${fileId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast('✓ File deleted.', 'success');
    rowEl.style.transition = 'all 0.3s ease';
    rowEl.style.height = rowEl.offsetHeight + 'px';
    requestAnimationFrame(() => {
      rowEl.style.height = '0';
      rowEl.style.opacity = '0';
      rowEl.style.overflow = 'hidden';
      setTimeout(() => { rowEl.remove(); updateFileCount(); }, 300);
    });
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
    rowEl.style.opacity = '1';
    rowEl.style.pointerEvents = '';
  }
}

function updateFileCount() {
  const rows = fileTableBody.querySelectorAll('tr').length;
  fileCountChip.textContent = `${rows} file${rows !== 1 ? 's' : ''}`;
  if (rows === 0) {
    fileTableWrap.style.display = 'none';
    emptyState.style.display    = 'flex';
  }
}

// ═══════════════════════════════════════════════════════════════
//  SERVER HEALTH
// ═══════════════════════════════════════════════════════════════

async function checkServerHealth(port, pillEl) {
  const dot = pillEl.querySelector('.dot');
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res   = await fetch(`http://localhost:${port}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    dot.className = res.ok ? 'dot dot--healthy' : 'dot dot--unhealthy';
  } catch (_) {
    dot.className = 'dot dot--unhealthy';
  }
}

function pollHealth() {
  checkServerHealth(3001, server3001Pill);
  checkServerHealth(3002, server3002Pill);
}

// ═══════════════════════════════════════════════════════════════
//  UI STATE HELPERS
// ═══════════════════════════════════════════════════════════════

function showSkeleton() {
  emptyState.style.display    = 'none';
  fileTableWrap.style.display = 'none';
  skeletonList.style.display  = 'flex';
}

function showEmptyState() {
  skeletonList.style.display  = 'none';
  fileTableWrap.style.display = 'none';
  emptyState.style.display    = 'flex';
}

function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastArea.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(-6px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch (_) { return iso; }
}

function shortMime(mime) {
  if (!mime) return 'unknown';
  const map = { 'application/pdf':'PDF','application/zip':'ZIP','application/json':'JSON','application/octet-stream':'BIN','text/plain':'TXT','text/html':'HTML','text/csv':'CSV' };
  if (map[mime]) return map[mime];
  if (mime.startsWith('image/')) return mime.split('/')[1].toUpperCase();
  if (mime.startsWith('video/')) return mime.split('/')[1].toUpperCase();
  if (mime.startsWith('audio/')) return mime.split('/')[1].toUpperCase();
  return mime.split('/').pop().substring(0, 8);
}

function fileIconEmoji(mime) {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📑';
  if (mime.includes('zip')) return '🗜';
  if (mime === 'application/json') return '{}';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  return '📄';
}

function fileIconBg(mime) {
  if (!mime) return 'rgba(255,255,255,0.06)';
  if (mime.startsWith('image/')) return 'rgba(59,130,246,0.15)';
  if (mime.startsWith('video/')) return 'rgba(168,85,247,0.15)';
  if (mime.startsWith('audio/')) return 'rgba(34,197,94,0.15)';
  if (mime === 'application/pdf') return 'rgba(239,68,68,0.15)';
  if (mime.includes('zip')) return 'rgba(245,158,11,0.15)';
  return 'rgba(255,255,255,0.06)';
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════

(function init() {
  loadFiles();
  pollHealth();
  setInterval(pollHealth, 8000);
})();
