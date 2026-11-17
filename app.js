const jobsEl = document.querySelector('#jobs');
const form = document.querySelector('#jobForm');
const formMessage = document.querySelector('#formMessage');
const dialog = document.querySelector('#jobDialog');
const dialogBody = document.querySelector('#dialogBody');
const closeDialog = document.querySelector('#closeDialog');
let jobs = [];

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const prettyDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Unknown date' : date.toLocaleString([], {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
};

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function renderJobs() {
  document.querySelector('#jobCount').textContent = jobs.length;
  document.querySelector('#assetCount').textContent = jobs.reduce((sum, job) => sum + (job.assets?.length || 0), 0);
  if (!jobs.length) {
    jobsEl.replaceChildren(document.querySelector('#emptyTemplate').content.cloneNode(true));
    return;
  }

  jobsEl.innerHTML = jobs.map((job, index) => {
    const completed = job.status === 'completed';
    const download = completed
      ? `<a class="download-button" href="/api/jobs/${encodeURIComponent(job.id)}/download">ZIP</a>`
      : '';
    return `<article class="job-card" data-status="${escapeHTML(job.status)}">
      <div class="job-index">${String(index + 1).padStart(2, '0')}</div>
      <div class="job-main">
        <h3>${escapeHTML(job.spec?.niche || job.id)}</h3>
        <p>${escapeHTML(job.spec?.style || 'production')} · ${escapeHTML(prettyDate(job.created_at))} · ${escapeHTML(job.status)}</p>
      </div>
      <div class="progress-wrap">
        <div class="progress-track"><span class="progress-fill" style="width:${Math.max(0, Math.min(100, job.progress || 0))}%"></span></div>
        <b>${job.status === 'failed' ? 'FAILED' : `${Math.round(job.progress || 0)}%`}</b>
        <span class="stage-label">${escapeHTML(job.stage || 'Queued')}</span>
      </div>
      <div class="job-actions">
        <button class="icon-button" data-detail="${escapeHTML(job.id)}" aria-label="View ${escapeHTML(job.spec?.niche || 'job')} details">View</button>
        ${download}
      </div>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-detail]').forEach(button => {
    button.addEventListener('click', () => openJob(button.dataset.detail));
  });
}

async function openJob(id) {
  try {
    const job = await request(`/api/jobs/${encodeURIComponent(id)}`);
    const assets = (job.assets || []).map(asset => {
      const imageURL = `/api/jobs/${encodeURIComponent(job.id)}/ready/${encodeURIComponent(asset.file)}`;
      const metadataURL = imageURL.replace(/\.png$/i, '.json');
      const sizeMB = asset.size_bytes ? (asset.size_bytes / 1048576).toFixed(2) : '—';
      return `<article class="asset-card">
        <img src="${imageURL}" alt="${escapeHTML(asset.title || asset.subject || asset.file)}" loading="lazy">
        <div>
          <b>${escapeHTML(asset.title || asset.subject || asset.file)}</b>
          <span>${escapeHTML(`${asset.width || 4500}×${asset.height || 5400} · ${sizeMB} MB · ${asset.tag_count || 0} tags`)}</span>
          <span>${asset.passed ? 'QA passed' : 'Review required'}${asset.opportunity_score != null ? ` · opportunity ${escapeHTML(asset.opportunity_score)}` : ''}</span>
          <span><a href="${metadataURL}" target="_blank" rel="noopener">Open metadata</a></span>
        </div>
      </article>`;
    }).join('');
    const logs = [...(job.logs || [])].reverse().map(item =>
      `<li><time>${escapeHTML(prettyDate(item.at))}</time><span>${escapeHTML(item.message)}</span></li>`
    ).join('');
    const download = job.status === 'completed'
      ? `<a class="download-button" href="/api/jobs/${encodeURIComponent(job.id)}/download">Download ready ZIP</a>`
      : '';

    dialogBody.innerHTML = `<div class="dialog-inner">
      <div class="section-kicker">Production record</div>
      <h2>${escapeHTML(job.spec?.niche || job.id)}</h2>
      <p class="dialog-meta">${escapeHTML(job.id)} · ${escapeHTML(job.stage)} · ${escapeHTML(job.progress)}% complete</p>
      ${download}
      <div class="asset-grid">${assets || `<div class="empty-state"><span>PIPELINE ACTIVE</span><h3>${escapeHTML(job.stage)}</h3><p>Validated previews appear here as they finish.</p></div>`}</div>
      <ul class="log-list">${logs}</ul>
    </div>`;
    dialog.showModal();
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

async function refreshJobs() {
  try {
    const data = await request('/api/jobs');
    jobs = data.jobs || [];
    renderJobs();
  } catch (error) {
    jobsEl.innerHTML = `<div class="empty-state"><span>CONNECTION ERROR</span><h3>Production ledger unavailable.</h3><p>${escapeHTML(error.message)}</p></div>`;
  }
}

async function checkHealth() {
  const healthText = document.querySelector('#healthText');
  try {
    await request('/api/health');
    healthText.textContent = 'Agent online';
  } catch {
    healthText.textContent = 'Agent offline';
    document.querySelector('.pulse').style.background = '#f16d3b';
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  formMessage.textContent = '';
  button.disabled = true;
  button.querySelector('span').textContent = 'Starting agent…';
  try {
    await request('/api/jobs', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        niche: form.niche.value.trim(),
        count: Number(form.count.value),
        style: form.style.value
      })
    });
    formMessage.textContent = 'Batch accepted. Live stages are visible in the ledger.';
    await refreshJobs();
  } catch (error) {
    formMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Run production agent';
  }
});

closeDialog.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

checkHealth();
refreshJobs();
setInterval(refreshJobs, 5000);
