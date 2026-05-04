/* ══════════════════════════════════════════════════════
   ANIMEVAULT — CORE API + UTILITIES
══════════════════════════════════════════════════════ */

// ── CONFIG ──────────────────────────────────────────
const API = {
  jikan: 'https://api.jikan.moe/v4',
  anilist: 'https://graphql.anilist.co',
  traceMoe: 'https://api.trace.moe',
  quotes: 'https://animechan.io/api/v1',
  nekos: 'https://nekos.best/api/v2'
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map();

// ── CACHE LAYER ──────────────────────────────────────
async function cachedFetch(url, options = {}) {
  const key = url + JSON.stringify(options.body || '');
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache.set(key, { data, time: Date.now() });
    return data;
  } catch (err) {
    console.warn('Fetch failed:', url, err.message);
    return null;
  }
}

// ── RATE LIMITER for Jikan (3 req/sec) ───────────────
let jikanQueue = Promise.resolve();
function jikanFetch(path) {
  jikanQueue = jikanQueue.then(() =>
    new Promise(resolve => setTimeout(resolve, 350))
  ).then(() => cachedFetch(API.jikan + path));
  return jikanQueue;
}

// ── JIKAN API ────────────────────────────────────────
const Jikan = {
  async topAnime(page = 1, filter = 'bypopularity') {
    return jikanFetch(`/top/anime?page=${page}&filter=${filter}&limit=20`);
  },
  async trending() {
    return jikanFetch('/top/anime?filter=airing&limit=12');
  },
  async seasonal(year, season) {
    return jikanFetch(`/seasons/${year}/${season}?limit=24`);
  },
  async currentSeason() {
    return jikanFetch('/seasons/now?limit=24');
  },
  async upcomingSeason() {
    return jikanFetch('/seasons/upcoming?limit=24');
  },
  async search(q, genres = '', type = '', page = 1) {
    let url = `/anime?q=${encodeURIComponent(q)}&limit=20&page=${page}&sfw=true`;
    if (genres) url += `&genres=${genres}`;
    if (type)   url += `&type=${type}`;
    return jikanFetch(url);
  },
  async getAnime(id) {
    return jikanFetch(`/anime/${id}/full`);
  },
  async getCharacters(id) {
    return jikanFetch(`/anime/${id}/characters`);
  },
  async getEpisodes(id, page = 1) {
    return jikanFetch(`/anime/${id}/episodes?page=${page}`);
  },
  async getRecommendations(id) {
    return jikanFetch(`/anime/${id}/recommendations`);
  },
  async getManga(id) {
    return jikanFetch(`/manga/${id}/full`);
  },
  async searchManga(q) {
    return jikanFetch(`/manga?q=${encodeURIComponent(q)}&limit=12`);
  },
  async getGenres() {
    return jikanFetch('/genres/anime');
  },
  async getStudios() {
    return jikanFetch('/producers?limit=20&order_by=count&sort=desc');
  },
  async searchByGenre(genreId, page = 1) {
    return jikanFetch(`/anime?genres=${genreId}&limit=20&page=${page}&order_by=score&sort=desc`);
  },
  async getVoiceActor(id) {
    return jikanFetch(`/people/${id}/full`);
  },
  async getSchedule() {
    return jikanFetch('/schedules?limit=30');
  },
  async getNewsLatest() {
    return jikanFetch('/anime?order_by=start_date&sort=desc&limit=20&sfw=true&status=airing');
  },
  async getTopManga() {
    return jikanFetch('/top/manga?limit=12');
  }
};

// ── ANILIST GRAPHQL ──────────────────────────────────
const AniList = {
  async query(query, variables = {}) {
    return cachedFetch(API.anilist, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables })
    });
  },
  async trending() {
    return this.query(`
      query { Page(perPage:12) { media(sort:TRENDING_DESC, type:ANIME, isAdult:false) {
        id title { romaji english } coverImage { large } averageScore episodes status
        genres startDate { year } studios(isMain:true) { nodes { name } }
      }}}
    `);
  },
  async airingSchedule() {
    const today = Math.floor(Date.now() / 1000);
    const weekEnd = today + 7 * 86400;
    return this.query(`
      query { Page(perPage:20) { airingSchedules(airingAt_greater:${today}, airingAt_lesser:${weekEnd}, sort:TIME) {
        episode airingAt media { id title { romaji } coverImage { medium } }
      }}}
    `);
  },
  async getAnime(id) {
    return this.query(`
      query($id:Int) { Media(id:$id, type:ANIME) {
        id title { romaji english native } description coverImage { extraLarge } bannerImage
        averageScore meanScore popularity favourites episodes duration status season seasonYear
        genres tags { name } studios(isMain:true) { nodes { name siteUrl } }
        characters(sort:ROLE, perPage:12) { edges { role node { id name { full } image { large } } } }
        recommendations(perPage:6) { nodes { mediaRecommendation { id title { romaji } coverImage { large } averageScore } } }
        relations { edges { relationType node { id title { romaji } type coverImage { large } } } }
        externalLinks { url site } trailer { id site }
        nextAiringEpisode { episode airingAt }
        startDate { year month day } endDate { year month day }
      }}
    `, { id });
  }
};

// ── QUOTES API ───────────────────────────────────────
const Quotes = {
  async random() {
    return cachedFetch(`${API.quotes}/quotes/random`);
  },
  async byAnime(anime) {
    return cachedFetch(`${API.quotes}/quotes?anime=${encodeURIComponent(anime)}`);
  }
};

// ── TRACE.MOE ────────────────────────────────────────
const TraceMoe = {
  async searchByUrl(imgUrl) {
    return cachedFetch(`${API.traceMoe}/search?url=${encodeURIComponent(imgUrl)}&anilistInfo`);
  },
  async searchByFile(file) {
    const form = new FormData();
    form.append('file', file);
    return cachedFetch(`${API.traceMoe}/search?anilistInfo`, { method: 'POST', body: form });
  }
};

// ── LOCAL STORAGE (USER STATE) ───────────────────────
const UserState = {
  get() {
    try {
      return JSON.parse(localStorage.getItem('av_state') || '{}');
    } catch { return {}; }
  },
  save(state) {
    localStorage.setItem('av_state', JSON.stringify(state));
  },
  getWatchlist() { return this.get().watchlist || []; },
  addToWatchlist(anime) {
    const state = this.get();
    state.watchlist = state.watchlist || [];
    if (!state.watchlist.find(a => a.mal_id === anime.mal_id)) {
      state.watchlist.push(anime);
      this.save(state);
      showToast(`Added "${anime.title}" to watchlist ✓`, 'success');
      updateWatchlistCount();
      return true;
    }
    showToast('Already in watchlist', 'error');
    return false;
  },
  removeFromWatchlist(mal_id) {
    const state = this.get();
    state.watchlist = (state.watchlist || []).filter(a => a.mal_id !== mal_id);
    this.save(state);
    updateWatchlistCount();
  },
  isInWatchlist(mal_id) {
    return this.getWatchlist().some(a => a.mal_id === mal_id);
  },
  getWatched() { return this.get().watched || {}; },
  markEpisode(anime_id, ep) {
    const state = this.get();
    state.watched = state.watched || {};
    state.watched[anime_id] = state.watched[anime_id] || [];
    if (!state.watched[anime_id].includes(ep)) state.watched[anime_id].push(ep);
    this.save(state);
  },
  getPrefs() { return this.get().prefs || { genres: [], moods: [] }; },
  setPrefs(prefs) {
    const state = this.get();
    state.prefs = prefs;
    this.save(state);
  },
  getBadges() { return this.get().badges || []; },
  addBadge(badge) {
    const state = this.get();
    state.badges = state.badges || [];
    if (!state.badges.includes(badge)) {
      state.badges.push(badge);
      this.save(state);
      showToast(`🏆 Badge unlocked: ${badge}`, 'success');
    }
  }
};

// ── UI UTILITIES ─────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container') ||
    (() => {
      const el = document.createElement('div');
      el.id = 'toast-container';
      el.className = 'toast-container';
      document.body.appendChild(el);
      return el;
    })();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function updateWatchlistCount() {
  const count = UserState.getWatchlist().length;
  document.querySelectorAll('.watchlist-count').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? '' : 'none';
  });
}

function createLoader() {
  return `<div class="loader"><div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div></div>`;
}

function createSkeletonGrid(count = 10) {
  return Array(count).fill(0).map(() =>
    `<div class="skeleton skeleton-card"></div>`
  ).join('');
}

function scoreClass(score) {
  if (score >= 8) return 'high';
  if (score >= 6) return 'mid';
  return 'low';
}

function formatScore(score) {
  return score ? (score / 10).toFixed(1) : 'N/A';
}

function formatJikanScore(score) {
  return score ? score.toFixed(1) : 'N/A';
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const day = Math.floor(h / 24);
  return `${day}d ago`;
}

function countdownTo(unix) {
  const diff = unix * 1000 - Date.now();
  if (diff < 0) return 'Aired';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

function animeCardHTML(anime, rank) {
  const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || 'https://via.placeholder.com/225x320/0a1628/00f5ff?text=No+Image';
  const title = anime.title_english || anime.title || 'Unknown';
  const score = formatJikanScore(anime.score);
  const type = anime.type || '';
  const year = anime.year || (anime.aired?.prop?.from?.year) || '';
  return `
    <a class="anime-card" href="pages/detail.html?id=${anime.mal_id}" data-id="${anime.mal_id}">
      ${rank ? `<div class="anime-card-rank">#${rank}</div>` : ''}
      ${type ? `<div class="anime-card-type-badge">${type}</div>` : ''}
      <img class="anime-card-img" src="${img}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/225x320/0a1628/00f5ff?text=No+Image'">
      <div class="anime-card-overlay">
        <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.5rem">${anime.genres?.slice(0,2).map(g=>g.name).join(' · ') || ''}</div>
        <div style="font-weight:700;font-size:0.9rem">${title}</div>
      </div>
      <div class="anime-card-info">
        <div class="anime-card-title">${title}</div>
        <div class="anime-card-meta">
          ${score !== 'N/A' ? `<span class="anime-card-score">★ ${score}</span>` : ''}
          <span>${year}</span>
        </div>
      </div>
    </a>`;
}

function anilistCardHTML(media) {
  const img = media.coverImage?.large || 'https://via.placeholder.com/225x320/0a1628/00f5ff?text=No+Image';
  const title = media.title?.english || media.title?.romaji || 'Unknown';
  const score = media.averageScore ? (media.averageScore / 10).toFixed(1) : 'N/A';
  const year = media.startDate?.year || '';
  return `
    <a class="anime-card" href="pages/detail.html?alid=${media.id}">
      <div class="anime-card-type-badge">${media.episodes ? media.episodes + ' ep' : 'Ongoing'}</div>
      <img class="anime-card-img" src="${img}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/225x320/0a1628/00f5ff?text=No+Image'">
      <div class="anime-card-overlay">
        <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.5rem">${media.genres?.slice(0,2).join(' · ') || ''}</div>
        <div style="font-weight:700;font-size:0.9rem">${title}</div>
      </div>
      <div class="anime-card-info">
        <div class="anime-card-title">${title}</div>
        <div class="anime-card-meta">
          ${score !== 'N/A' ? `<span class="anime-card-score">★ ${score}</span>` : ''}
          <span>${year}</span>
        </div>
      </div>
    </a>`;
}

// ── NAVBAR ───────────────────────────────────────────
function initNavbar() {
  updateWatchlistCount();

  // Highlight active link
  const current = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (current.includes(a.getAttribute('href')?.split('/').pop())) {
      a.classList.add('active');
    }
  });

  // Hamburger
  const hamburger = document.querySelector('.nav-hamburger');
  const navLinks = document.querySelector('.nav-links');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      navLinks.style.display = navLinks.style.display === 'flex' ? '' : 'flex';
      navLinks.style.flexDirection = 'column';
      navLinks.style.position = 'fixed';
      navLinks.style.top = '64px';
      navLinks.style.left = '0';
      navLinks.style.right = '0';
      navLinks.style.background = 'var(--bg-deep)';
      navLinks.style.padding = '1rem';
      navLinks.style.borderBottom = '1px solid var(--border-subtle)';
      navLinks.style.zIndex = '999';
    });
  }

  // Navbar search
  const searchInput = document.getElementById('nav-search-input');
  const searchDropdown = document.getElementById('nav-search-dropdown');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = searchInput.value.trim();
      if (q.length < 2) { searchDropdown.innerHTML = ''; return; }
      searchTimeout = setTimeout(async () => {
        const data = await Jikan.search(q);
        if (!data?.data) return;
        searchDropdown.innerHTML = data.data.slice(0, 6).map(a => {
          const img = a.images?.jpg?.image_url || '';
          const title = a.title_english || a.title;
          return `
            <a class="search-result-item" href="pages/detail.html?id=${a.mal_id}">
              <img src="${img}" alt="${title}">
              <div>
                <div class="title">${title}</div>
                <div class="meta">${a.type || ''} · ${a.year || ''} · ★${formatJikanScore(a.score)}</div>
              </div>
            </a>`;
        }).join('');
      }, 400);
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.nav-search')) searchDropdown.innerHTML = '';
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (q) window.location.href = `pages/search.html?q=${encodeURIComponent(q)}`;
      }
    });
  }
}

// ── INTERSECTION OBSERVER FOR FADE ───────────────────
function initScrollAnimations() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.section').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

// ── TABS ─────────────────────────────────────────────
function initTabs(container) {
  const btns = container.querySelectorAll('.tab-btn');
  const panels = container.querySelectorAll('.tab-panel');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = container.querySelector(`#${btn.dataset.tab}`);
      if (target) target.classList.add('active');
    });
  });
}

// ── NAVBAR HTML (shared) ──────────────────────────────
function getNavbarHTML(basePath = '') {
  return `
  <nav class="navbar">
    <a href="${basePath}index.html" class="nav-logo">ANIME<span>VAULT</span></a>
    <ul class="nav-links">
      <li><a href="${basePath}index.html">Home</a></li>
      <li><a href="${basePath}pages/seasonal.html">Seasonal</a></li>
      <li><a href="${basePath}pages/search.html">Browse</a></li>
      <li><a href="${basePath}pages/manga.html">Manga</a></li>
      <li><a href="${basePath}pages/characters.html">Characters</a></li>
      <li><a href="${basePath}pages/scene.html">Scene Finder</a></li>
      <li><a href="${basePath}pages/explore.html">Explore</a></li>
      <li><a href="${basePath}pages/watchlist.html">Watchlist <span class="watchlist-count" style="display:none">0</span></a></li>
    </ul>
    <div class="nav-search" style="position:relative">
      <span class="search-icon">🔍</span>
      <input id="nav-search-input" type="text" placeholder="Search anime..." autocomplete="off">
      <div id="nav-search-dropdown" class="search-dropdown" style="min-width:320px"></div>
    </div>
    <div class="nav-hamburger"><span></span><span></span><span></span></div>
  </nav>`;
}

function getFooterHTML() {
  return `
  <footer class="footer">
    <div class="footer-logo">ANIME<span style="color:var(--neon-pink)">VAULT</span></div>
    <p style="color:var(--text-secondary);font-size:0.875rem;margin-bottom:1rem">Your ultimate anime universe — powered by Jikan, AniList & more</p>
    <ul class="footer-links">
      <li><a href="../index.html">Home</a></li>
      <li><a href="seasonal.html">Seasonal</a></li>
      <li><a href="search.html">Browse</a></li>
      <li><a href="manga.html">Manga</a></li>
      <li><a href="characters.html">Characters</a></li>
      <li><a href="scene.html">Scene Finder</a></li>
      <li><a href="explore.html">Explore</a></li>
      <li><a href="watchlist.html">Watchlist</a></li>
    </ul>
    <p class="footer-copy">Data from <a href="https://jikan.moe" style="color:var(--neon-cyan)">Jikan</a> & <a href="https://anilist.co" style="color:var(--neon-cyan)">AniList</a> · AnimeVault © 2026</p>
  </footer>
  <div class="toast-container" id="toast-container"></div>`;
}

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initScrollAnimations();
  document.querySelectorAll('[data-tabs]').forEach(initTabs);
});
