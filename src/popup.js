const SHORT_THRESHOLD_SEC = 30;

let allEntries = [];
let currentFilter = 'all';
let currentSearch = '';

const grid = document.getElementById('grid');
const stats = document.getElementById('stats');
const searchInput = document.getElementById('searchInput');
const pills = document.querySelectorAll('.pill');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');

function safeHttpUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch {
    return '';
  }
}

function matchesSearch(entry, query) {
  if (!query) return true;
  const q = query.toLowerCase().replace(/^#/, '');
  const haystacks = [
    entry.creatorUsername,
    entry.creatorDisplayName,
    entry.caption,
    entry.soundName
  ];
  if (haystacks.some(s => typeof s === 'string' && s.toLowerCase().includes(q))) return true;
  if (Array.isArray(entry.hashtags) && entry.hashtags.some(h => h.toLowerCase().includes(q))) return true;
  return false;
}

function matchesFilter(entry, filter) {
  if (filter === 'all') return true;
  if (filter === 'short') return entry.durationSec < SHORT_THRESHOLD_SEC;
  if (filter === 'long') return entry.durationSec >= SHORT_THRESHOLD_SEC;
  return true;
}

function fmtDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function createEmptyState() {
  const wrap = document.createElement('div');
  wrap.className = 'empty';
  const isTrulyEmpty = allEntries.length === 0;
  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.textContent = '\uD83C\uDFAC';
  const h2 = document.createElement('h2');
  h2.textContent = isTrulyEmpty ? 'No history yet' : 'Nothing matches';
  const p = document.createElement('p');
  p.textContent = isTrulyEmpty
    ? 'Browse TikTok and videos will appear here automatically.'
    : 'Try a different search or filter.';
  wrap.append(icon, h2, p);
  return wrap;
}

function createGridItem(entry) {
  const link = document.createElement('a');
  link.className = 'grid-item';
  const safeUrl = safeHttpUrl(entry.url);
  if (safeUrl) {
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener';
  }
  link.dataset.id = entry.videoId;

  const safeThumb = safeHttpUrl(entry.thumbnailUrl);
  if (safeThumb) {
    const img = document.createElement('img');
    img.src = safeThumb;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    link.appendChild(img);
  }

  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const top = document.createElement('div');
  top.className = 'overlay-top';
  const badge = document.createElement('span');
  badge.className = 'duration-badge';
  badge.textContent = fmtDuration(entry.durationSec);
  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.type = 'button';
  del.title = 'Remove';
  del.textContent = '\u2715';
  del.dataset.del = entry.videoId;
  top.append(badge, del);

  const bottom = document.createElement('div');
  bottom.className = 'overlay-bottom';
  const user = document.createElement('span');
  user.className = 'username';
  user.textContent = '@' + (entry.creatorUsername || '');
  bottom.appendChild(user);
  if (entry.soundName) {
    const sound = document.createElement('span');
    sound.className = 'sound';
    sound.textContent = '\u266A ' + entry.soundName;
    bottom.appendChild(sound);
  }

  overlay.append(top, bottom);
  link.appendChild(overlay);
  return link;
}

function render() {
  const filtered = allEntries.filter(e => matchesFilter(e, currentFilter) && matchesSearch(e, currentSearch));
  const suffix = filtered.length !== allEntries.length ? ` of ${allEntries.length}` : '';
  stats.textContent = `${filtered.length}${suffix} items`;

  grid.textContent = '';
  if (filtered.length === 0) {
    grid.appendChild(createEmptyState());
    return;
  }

  const frag = document.createDocumentFragment();
  for (const entry of filtered) frag.appendChild(createGridItem(entry));
  grid.appendChild(frag);

  grid.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = btn.getAttribute('data-del');
      await chrome.runtime.sendMessage({ type: 'tiktok-view-history:delete', videoId: id });
      allEntries = allEntries.filter(e => e.videoId !== id);
      render();
    });
  });
}

async function load() {
  const res = await chrome.runtime.sendMessage({ type: 'tiktok-view-history:get' });
  allEntries = res?.history || [];
  render();
}

searchInput.addEventListener('input', (e) => {
  currentSearch = e.target.value;
  render();
});

pills.forEach(p => p.addEventListener('click', () => {
  pills.forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  currentFilter = p.getAttribute('data-filter');
  render();
}));

exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(allEntries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tiktok-view-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('Clear all TikTok view history? This cannot be undone.')) return;
  await chrome.runtime.sendMessage({ type: 'tiktok-view-history:clear' });
  allEntries = [];
  render();
});

load();
