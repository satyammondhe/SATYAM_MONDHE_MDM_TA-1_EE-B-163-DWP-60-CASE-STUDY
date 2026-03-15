/* ══════════════════════════════════════════════════════════════════════════
   YOUTIFY — app.js  (production-ready, all bugs fixed)
   ══════════════════════════════════════════════════════════════════════════
   FIX LOG:
   ① Invidious API as primary search  — zero quota issues, no API key needed
   ② YouTube Data API as secondary fallback (if key provided & Invidious down)
   ③ Result scoring — Topic channels & VEVO ranked first, covers/lives/karaoke penalised
   ④ Fixed parseSyncedLyrics  — regex was double-escaped (\\[ → \[) so lyrics never worked
   ⑤ state.currentLyrics / lastActiveLyricIndex added to state object
   ⑥ Embed-blocked retry  — now keeps the correct title/artist and tries other video IDs
   ⑦ Removed broken DuckDuckGo scrape fallback
   ══════════════════════════════════════════════════════════════════════════ */

'use strict';

/* ══ 1. CONFIGURATION ═══════════════════════════════════════════════════════ */

const YOUTUBE_API_KEY = 'AIzaSyBkGu3wCLqVskfm4RJeNZjGO4-VLcpYIM0'; // optional – Invidious is used first
const YT_SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const LS_KEY             = 'youtify_recently_played';
const MAX_HISTORY        = 20;
const SEARCH_TIMEOUT_MS  = 6000;

/*
 * Public Invidious instances — tried in order, first success wins.
 * These are open-source YouTube proxies with no quota restrictions.
 * If one is down, the app automatically falls back to the next one.
 */
const INVIDIOUS_INSTANCES = [
  'https://invidious.kavin.rocks',
  'https://yt.artemislena.eu',
  'https://iv.melmac.space',
  'https://invidious.privacydev.net',
  'https://invidious.snopyta.org',
  'https://invidious.nerdvpn.de',
];

/* ══ 2. MOCK DATA ════════════════════════════════════════════════════════════ */

const SPOTIFY_TRENDS = [
  { rank:  1, title: 'Blinding Lights',            artist: 'The Weeknd',                      searchQuery: 'The Weeknd Blinding Lights'            },
  { rank:  2, title: 'Shape of You',                artist: 'Ed Sheeran',                      searchQuery: 'Ed Sheeran Shape of You'                },
  { rank:  3, title: 'Stay',                        artist: 'The Kid LAROI, Justin Bieber',     searchQuery: 'The Kid LAROI Justin Bieber Stay'       },
  { rank:  4, title: 'Levitating',                  artist: 'Dua Lipa ft. DaBaby',             searchQuery: 'Dua Lipa Levitating'                    },
  { rank:  5, title: 'MONTERO (Call Me By Your Name)', artist: 'Lil Nas X',                    searchQuery: 'Lil Nas X MONTERO Call Me By Your Name' },
  { rank:  6, title: 'drivers license',             artist: 'Olivia Rodrigo',                  searchQuery: 'Olivia Rodrigo drivers license'          },
  { rank:  7, title: 'Peaches',                     artist: 'Justin Bieber',                   searchQuery: 'Justin Bieber Peaches'                  },
  { rank:  8, title: 'good 4 u',                    artist: 'Olivia Rodrigo',                  searchQuery: 'Olivia Rodrigo good 4 u'                },
  { rank:  9, title: 'Butter',                      artist: 'BTS',                             searchQuery: 'BTS Butter'                             },
  { rank: 10, title: 'Bad Guy',                     artist: 'Billie Eilish',                   searchQuery: 'Billie Eilish bad guy'                  },
  { rank: 11, title: 'Anti-Hero',                   artist: 'Taylor Swift',                    searchQuery: 'Taylor Swift Anti-Hero'                 },
  { rank: 12, title: 'As It Was',                   artist: 'Harry Styles',                    searchQuery: 'Harry Styles As It Was'                 },
  { rank: 13, title: 'Heat Waves',                  artist: 'Glass Animals',                   searchQuery: 'Glass Animals Heat Waves'               },
  { rank: 14, title: 'Flowers',                     artist: 'Miley Cyrus',                     searchQuery: 'Miley Cyrus Flowers'                    },
  { rank: 15, title: 'Cruel Summer',                artist: 'Taylor Swift',                    searchQuery: 'Taylor Swift Cruel Summer'              },
];

const GLOBAL_CHARTS = [
  { rank:  1, title: 'Flowers',                     artist: 'Miley Cyrus',                     searchQuery: 'Miley Cyrus Flowers'                    },
  { rank:  2, title: 'Kill Bill',                   artist: 'SZA',                             searchQuery: 'SZA Kill Bill'                          },
  { rank:  3, title: 'Unholy',                      artist: 'Sam Smith & Kim Petras',           searchQuery: 'Sam Smith Kim Petras Unholy'            },
  { rank:  4, title: 'Calm Down',                   artist: 'Rema & Selena Gomez',              searchQuery: 'Rema Selena Gomez Calm Down'            },
  { rank:  5, title: 'Bzrp Music Sessions #53',     artist: 'Bizarrap & Shakira',               searchQuery: 'Bizarrap Shakira Music Session 53'      },
  { rank:  6, title: "Creepin'",                    artist: 'Metro Boomin, The Weeknd, 21 Savage', searchQuery: 'Metro Boomin The Weeknd Creepin'      },
  { rank:  7, title: 'La Bebe (Remix)',             artist: 'Yng Lvcas & Peso Pluma',           searchQuery: 'Yng Lvcas Peso Pluma La Bebe Remix'    },
  { rank:  8, title: 'About Damn Time',             artist: 'Lizzo',                            searchQuery: 'Lizzo About Damn Time'                  },
  { rank:  9, title: 'Tití Me Preguntó',            artist: 'Bad Bunny',                        searchQuery: 'Bad Bunny Titi Me Pregunto'             },
  { rank: 10, title: 'Running Up That Hill',        artist: 'Kate Bush',                        searchQuery: 'Kate Bush Running Up That Hill'         },
  { rank: 11, title: "I Ain't Worried",             artist: 'OneRepublic',                      searchQuery: 'OneRepublic I Aint Worried'             },
  { rank: 12, title: 'Lift Me Up',                  artist: 'Rihanna',                          searchQuery: 'Rihanna Lift Me Up'                     },
  { rank: 13, title: 'Bzrp Music Sessions #52',     artist: 'Bizarrap & Quevedo',               searchQuery: 'Bizarrap Quevedo Music Session 52'     },
  { rank: 14, title: 'Te Felicito',                 artist: 'Shakira & Rauw Alejandro',          searchQuery: 'Shakira Rauw Alejandro Te Felicito'    },
  { rank: 15, title: 'Paint The Town Red',          artist: 'Doja Cat',                         searchQuery: 'Doja Cat Paint The Town Red'            },
];

/* ══ 3. APP STATE ════════════════════════════════════════════════════════════ */

const state = {
  activeTab          : 'home',
  ytPlayer           : null,
  playerReady        : false,
  isPlaying          : false,
  currentTrack       : null,
  progressTimer      : null,
  isSeeking          : false,
  searchResults      : [],
  pendingRetries     : [],
  // ① Added missing fields that caused lyrics sync to crash:
  currentLyrics      : null,
  lastActiveLyricIndex: -1,
};

/* ══ 4. DOM CACHE ════════════════════════════════════════════════════════════ */

const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const dom = {
  tabs              : $$('.tab-section'),
  navItems          : $$('.nav-item'),
  sidebarLinks      : $$('.sidebar-link'),
  progressTrack     : $('progress-track'),
  progressFill      : $('progress-fill'),
  progressKnob      : $('progress-knob'),
  playPauseBtn      : $('play-pause-btn'),
  iconPlay          : $('icon-play'),
  iconPause         : $('icon-pause'),
  prevBtn           : $('prev-btn'),
  nextBtn           : $('next-btn'),
  playerTitle       : $('player-track-title'),
  playerArtist      : $('player-track-artist'),
  playerThumbnail   : $('player-thumbnail'),
  playerArtFallback : $('player-art-fallback'),
  eqAnim            : $('equalizer-anim'),
  eqAnimMobile      : $('equalizer-anim-mobile'),
  breadcrumbLabel   : $('breadcrumb-label'),
  desktopSearchInput: $('desktop-search-input'),
  npArtImg          : $('np-art-img'),
  npArtFallback     : $('np-art-fallback'),
  npTrackTitle      : $('np-track-title'),
  npTrackArtist     : $('np-track-artist'),
  npLyricsContent   : $('np-lyrics-content'),
  npQueueList       : $('np-queue-list'),
  homeQuickPlays    : $('home-quick-plays'),
  quickPlaysContainer: $('quick-plays-container'),
  chartsToggle      : $('charts-toggle'),
  spotifyList       : $('spotify-list'),
  globalList        : $('global-list'),
  panelSpotify      : $('panel-spotify'),
  panelGlobal       : $('panel-global'),
  searchInput       : $('yt-search-input'),
  searchClearBtn    : $('search-clear'),
  searchGoBtn       : $('yt-search-btn'),
  searchBox         : $('search-box'),
  apiKeyWarning     : $('api-key-warning'),
  searchIdleState   : $('search-idle-state'),
  searchLoading     : $('search-loading'),
  searchResults     : $('search-results'),
  recentlyPlayedList: $('recently-played-list'),
  rpEmptyState      : $('rp-empty-state'),
  clearHistoryBtn   : $('clear-history-btn'),
  likedCount        : $('liked-count'),
  pbTimeCurrent     : $('pb-time-current'),
  pbTimeTotal       : $('pb-time-total'),
  volumeSlider      : $('volume-slider'),
  toast             : $('toast'),
};

/* ══ 5. YOUTUBE IFRAME PLAYER API ════════════════════════════════════════════ */

window.onYouTubeIframeAPIReady = function () {
  state.ytPlayer = new YT.Player('yt-player', {
    height   : '200',
    width    : '200',
    videoId  : '',
    playerVars: {
      autoplay       : 0,
      controls       : 0,
      disablekb      : 1,
      fs             : 0,
      iv_load_policy : 3,
      modestbranding : 1,
      rel            : 0,
      playsinline    : 1,
    },
    events: {
      onReady      : onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError      : onPlayerError,
    },
  });
};

function onPlayerReady() {
  state.playerReady = true;
  console.log('[Youtify] YouTube IFrame Player ready.');
  dom.playPauseBtn.disabled = false;
  if (dom.volumeSlider && state.ytPlayer) {
    state.ytPlayer.setVolume(parseInt(dom.volumeSlider.value, 10));
  }
}

function onPlayerStateChange(event) {
  switch (event.data) {
    case YT.PlayerState.PLAYING:
      state.isPlaying = true;
      setPlayPauseUI(true);
      startProgressTracking();
      setEqPlaying(true);
      break;
    case YT.PlayerState.PAUSED:
      state.isPlaying = false;
      setPlayPauseUI(false);
      stopProgressTracking();
      setEqPlaying(false);
      break;
    case YT.PlayerState.ENDED:
      state.isPlaying = false;
      setPlayPauseUI(false);
      stopProgressTracking();
      setEqPlaying(false);
      setProgressUI(0);
      // Auto-advance to next in queue if available
      if (state.pendingRetries.length > 0) {
        // do nothing — retries are for embed failures only
      }
      break;
    case YT.PlayerState.BUFFERING:
      break;
    default:
      break;
  }
}

function onPlayerError(event) {
  // ② Fixed retry: keep the correct title/artist metadata, only swap the videoId
  const embeddingBlocked = [101, 150, 153].includes(event.data);

  if (embeddingBlocked && state.pendingRetries.length > 0) {
    const next = state.pendingRetries.shift();
    console.log('[Youtify] Embed blocked, retrying with videoId:', next.videoId);
    // Use currentTrack metadata so title/artist never change on retry
    const t = state.currentTrack;
    playTrack(next.videoId, t.title, t.artist, t.thumbnail);
    return;
  }

  const codes = {
    2  : 'Invalid video ID',
    5  : 'HTML5 player error',
    100: 'Video not found or private',
    101: 'Embedding disabled by the video owner',
    150: 'Embedding disabled by the video owner',
    153: 'Embedding disabled by the video owner',
  };
  const msg = codes[event.data] || `Player error (${event.data})`;
  console.warn('[Youtify] Player error:', msg);

  if (embeddingBlocked) {
    showToast('⚠ Could not find a playable version for this track.');
  } else {
    showToast(`⚠ ${msg}`);
  }

  state.isPlaying = false;
  setPlayPauseUI(false);
  stopProgressTracking();
  setEqPlaying(false);
}

function setEqPlaying(playing) {
  dom.eqAnim?.classList.toggle('playing', playing);
  dom.eqAnimMobile?.classList.toggle('playing', playing);
}

// Load YouTube IFrame API
(function loadYTApi() {
  const tag   = document.createElement('script');
  tag.src     = 'https://www.youtube.com/iframe_api';
  tag.onerror = () => console.warn('[Youtify] Could not load YouTube IFrame API.');
  document.head.appendChild(tag);
})();

/* ══ 6. PLAYBACK CONTROLS ════════════════════════════════════════════════════ */

function playTrack(videoId, title, artist, thumbnail = '') {
  if (!state.ytPlayer || !state.playerReady) {
    showToast('Player not ready yet — please wait.');
    return;
  }
  if (!videoId) {
    showToast('No video ID available.');
    return;
  }

  state.currentTrack = { videoId, title, artist, thumbnail };

  // Player bar
  dom.playerTitle.textContent  = title     || 'Unknown title';
  dom.playerArtist.textContent = artist    || 'Unknown artist';

  if (thumbnail) {
    dom.playerThumbnail.src          = thumbnail;
    dom.playerThumbnail.style.display = 'block';
    dom.playerArtFallback.style.display = 'none';
  } else {
    dom.playerThumbnail.style.display   = 'none';
    dom.playerArtFallback.style.display = '';
  }

  dom.prevBtn.disabled     = false;
  dom.nextBtn.disabled     = false;
  dom.playPauseBtn.disabled = false;

  updateNowPlayingPanel(title, artist, thumbnail);

  state.ytPlayer.loadVideoById(videoId);
  state.ytPlayer.playVideo();

  saveToHistory({ videoId, title, artist, thumbnail });
  highlightNowPlaying(videoId);
}

function updateNowPlayingPanel(title, artist, thumbnail) {
  if (dom.npTrackTitle)  dom.npTrackTitle.textContent  = title  || 'Unknown title';
  if (dom.npTrackArtist) dom.npTrackArtist.textContent = artist || 'Unknown artist';

  fetchAndDisplayLyrics(title, artist);

  if (dom.npArtImg) {
    if (thumbnail) {
      dom.npArtImg.src            = thumbnail;
      dom.npArtImg.style.display  = 'block';
      if (dom.npArtFallback) dom.npArtFallback.style.display = 'none';
    } else {
      dom.npArtImg.style.display  = 'none';
      if (dom.npArtFallback) dom.npArtFallback.style.display = '';
    }
  }

  renderNowPlayingQueue();
}

function renderNowPlayingQueue() {
  if (!dom.npQueueList) return;
  const history = loadHistory().slice(0, 5);

  if (!history.length) {
    dom.npQueueList.innerHTML =
      '<p style="font-size:0.78rem;color:var(--text-3);padding:8px;">No tracks in queue</p>';
    return;
  }

  dom.npQueueList.innerHTML = history.map(t => `
    <div class="np-queue-item" data-video-id="${escHtml(t.videoId)}">
      <div class="np-queue-art">
        ${t.thumbnail
          ? `<img src="${escHtml(t.thumbnail)}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div style="width:100%;height:100%;display:grid;place-items:center;font-size:0.9rem;">🎵</div>`}
      </div>
      <div class="np-queue-info">
        <p class="np-queue-title">${escHtml(t.title)}</p>
      </div>
    </div>
  `).join('');
}

/* ── Lyrics (LRCLib) ─────────────────────────────────────────────────────── */

async function fetchAndDisplayLyrics(title, artist) {
  if (!dom.npLyricsContent) return;
  dom.npLyricsContent.innerHTML =
    '<p class="lyrics-placeholder" style="font-size:0.78rem;color:var(--text-3);padding:8px;line-height:1.6;">Searching for lyrics…</p>';

  // Reset lyrics state
  state.currentLyrics       = null;
  state.lastActiveLyricIndex = -1;

  if (!title) return;

  const cleanTitle  = title
    .replace(/\(official.*?\)/gi, '')
    .replace(/\[official.*?\]/gi, '')
    .replace(/\(lyric.*?\)/gi,    '')
    .replace(/official\s+video/gi,'')
    .replace(/official\s+audio/gi,'')
    .replace(/\(audio\)/gi,       '')
    .replace(/\(video\)/gi,       '')
    .trim();

  const cleanArtist = artist ? artist.replace(/VEVO/gi, '').replace(/\s*-\s*Topic$/i, '').trim() : '';

  try {
    const query = encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim());
    const res   = await fetch(`https://lrclib.net/api/search?q=${query}`);
    if (!res.ok) throw new Error('Network error');

    const data = await res.json();
    if (!data || !data.length) throw new Error('No results');

    const best = data[0];

    if (best.syncedLyrics) {
      state.currentLyrics = parseSyncedLyrics(best.syncedLyrics);
      renderLyrics();
    } else if (best.plainLyrics) {
      dom.npLyricsContent.innerHTML =
        `<p style="padding:8px;white-space:pre-wrap;font-size:0.82rem;line-height:1.7;">${escHtml(best.plainLyrics)}</p>`;
    } else {
      throw new Error('No lyrics data in response');
    }
  } catch (err) {
    console.warn('[Youtify] Lyrics fetch failed:', err.message);
    dom.npLyricsContent.innerHTML =
      '<p class="lyrics-placeholder" style="font-size:0.78rem;color:var(--text-3);padding:8px;line-height:1.6;">Lyrics not available for this track.</p>';
  }
}

// ④ FIXED: was using double-escaped \\[ \\d which compiled to wrong regex
function parseSyncedLyrics(lrcString) {
  const lines     = lrcString.split('\n');          // was: '\\n'  — literal backslash-n
  const timeRegex = /\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/;  // was: /\\[...\\]/ — never matched
  const result    = [];

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (!match) continue;
    const min    = parseInt(match[1], 10);
    const sec    = parseFloat(match[2]);
    const text   = match[3].trim();
    if (text) result.push({ timeMs: (min * 60 + sec) * 1000, text });
  }

  return result;
}

function renderLyrics() {
  if (!dom.npLyricsContent || !state.currentLyrics) return;
  dom.npLyricsContent.innerHTML = state.currentLyrics
    .map((line, i) => `<div class="lyric-line" id="lyric-line-${i}">${escHtml(line.text)}</div>`)
    .join('');
}

function togglePlayPause() {
  if (!state.ytPlayer || !state.playerReady || !state.currentTrack) return;
  state.isPlaying ? state.ytPlayer.pauseVideo() : state.ytPlayer.playVideo();
}

function setPlayPauseUI(playing) {
  dom.iconPlay.style.display  = playing ? 'none' : '';
  dom.iconPause.style.display = playing ? ''     : 'none';
  dom.playPauseBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

/* ── Progress ────────────────────────────────────────────────────────────── */

function startProgressTracking() {
  stopProgressTracking();
  state.progressTimer = setInterval(updateProgress, 500);
}

function stopProgressTracking() {
  if (state.progressTimer) {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
}

function updateProgress() {
  if (!state.ytPlayer || state.isSeeking) return;
  try {
    const current  = state.ytPlayer.getCurrentTime() || 0;
    const duration = state.ytPlayer.getDuration()    || 0;
    if (duration === 0) return;

    const pct = (current / duration) * 100;
    setProgressUI(pct);

    if (dom.pbTimeCurrent) dom.pbTimeCurrent.textContent = formatTime(current);
    if (dom.pbTimeTotal)   dom.pbTimeTotal.textContent   = formatTime(duration);

    // Sync lyrics highlight
    if (state.currentLyrics && dom.npLyricsContent) {
      const ms          = current * 1000;
      let   activeIndex = -1;

      for (let i = 0; i < state.currentLyrics.length; i++) {
        if (ms >= state.currentLyrics[i].timeMs) activeIndex = i;
        else break;
      }

      if (activeIndex !== -1 && activeIndex !== state.lastActiveLyricIndex) {
        dom.npLyricsContent.querySelector('.lyric-line.active')?.classList.remove('active');
        const el = dom.npLyricsContent.querySelector(`#lyric-line-${activeIndex}`);
        if (el) {
          el.classList.add('active');
          const container  = dom.npLyricsContent;
          const scrollTop  = el.offsetTop - container.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
          container.scrollTo({ top: scrollTop, behavior: 'smooth' });
        }
        state.lastActiveLyricIndex = activeIndex;
      }
    }
  } catch (_) { /* player not ready */ }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function setProgressUI(pct) {
  const c = Math.max(0, Math.min(100, pct));
  dom.progressFill.style.width = `${c}%`;
  dom.progressKnob.style.left  = `${c}%`;
}

/* ── Seekbar ─────────────────────────────────────────────────────────────── */

function seekToPercent(pct) {
  if (!state.ytPlayer || !state.playerReady || !state.currentTrack) return;
  try {
    const duration = state.ytPlayer.getDuration() || 0;
    state.ytPlayer.seekTo(duration * pct, true);
    setProgressUI(pct * 100);
  } catch (_) { }
}

function getSeekPercent(event, element) {
  const rect = element.getBoundingClientRect();
  const x    = (event.touches ? event.touches[0].clientX : event.clientX) - rect.left;
  return Math.max(0, Math.min(1, x / rect.width));
}

/* ══ 7. SEARCH ENGINE — Invidious primary, YouTube API fallback ══════════════ */

/**
 * Score a search result to prefer official audio.
 * Topic channels (+10) and VEVO (+5) float to the top;
 * covers, live sets, and karaoke are penalised.
 */
function scoreResult(item, originalQuery) {
  let score = 0;
  const ch  = item.channel.toLowerCase();
  const t   = item.title.toLowerCase();
  const q   = originalQuery.toLowerCase();

  // Prefer official sources
  if (ch.endsWith('- topic'))   score += 10;   // YouTube's auto-generated artist channels
  if (ch.includes('vevo'))      score +=  5;
  if (ch.includes('official'))  score +=  3;

  // Penalise alternates
  if (t.includes('cover'))                              score -=  8;
  if (t.includes('karaoke'))                            score -= 12;
  if (t.includes('tutorial'))                           score -= 10;
  if (t.includes('reaction'))                           score -= 10;
  if (t.includes(' live') || t.includes('(live'))       score -=  5;
  if (t.includes('concert'))                            score -=  5;
  if (t.includes('remix') && !q.includes('remix'))      score -=  4;
  if (t.includes('lyrics video'))                       score -=  2;
  if (t.includes('how to play'))                        score -= 10;

  return score;
}

/**
 * ① Primary: Invidious — no API key, no daily quota.
 */
async function searchInvidious(query, maxResults = 15) {
  const params = new URLSearchParams({ q: query, type: 'video', sort_by: 'relevance' });

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

      const res = await fetch(`${instance}/api/v1/search?${params}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data) || !data.length) continue;

      const results = data
        .filter(item => item.videoId && item.type === 'video')
        .slice(0, maxResults)
        .map(item => ({
          videoId    : item.videoId,
          title      : item.title,
          channel    : item.author,
          thumbnail  : `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
          publishedAt: new Date((item.published || 0) * 1000).toISOString(),
        }));

      if (results.length) {
        console.log(`[Youtify] Invidious OK: ${instance}`);
        return results;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn(`[Youtify] Invidious ${instance} failed:`, err.message);
      }
    }
  }

  throw new Error('All Invidious instances failed');
}

/**
 * ② Secondary: YouTube Data API v3 (costs quota, used as fallback only).
 */
async function searchYouTubeAPI(query, maxResults = 15) {
  if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_DATA_API_KEY_HERE') {
    throw new Error('API_KEY_MISSING');
  }

  const params = new URLSearchParams({
    part          : 'snippet',
    type          : 'video',
    videoEmbeddable: 'true',
    q             : query,
    key           : YOUTUBE_API_KEY,
    maxResults    : String(maxResults),
  });

  const res = await fetch(`${YT_SEARCH_ENDPOINT}?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  return (data.items || []).map(item => ({
    videoId    : item.id.videoId,
    title      : item.snippet.title,
    channel    : item.snippet.channelTitle,
    thumbnail  : item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
    publishedAt: item.snippet.publishedAt,
  }));
}

/**
 * Unified search: tries Invidious first, falls back to YouTube API.
 */
async function search(query, maxResults = 15) {
  // Try Invidious instances (no quota)
  try {
    return await searchInvidious(query, maxResults);
  } catch (invErr) {
    console.warn('[Youtify] Invidious unavailable, trying YouTube API…');
  }

  // YouTube Data API fallback
  try {
    return await searchYouTubeAPI(query, maxResults);
  } catch (ytErr) {
    if (ytErr.message.toLowerCase().includes('quota')) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw ytErr;
  }
}

/**
 * Rank results, build retry list, and start playback.
 * ③ Results are scored so the original/official version plays first.
 */
async function searchAndPlay(query, title, artist, el = null, overrideThumbnail = null) {
  if (el) {
    el.classList.add('loading');
    const hint = el.querySelector('.chart-play-hint');
    if (hint) hint.innerHTML = '<div class="chart-loading-dot"></div>';
  }

  try {
    // Build a targeted query: "Artist – Song title" gives better results
    const targetQuery = [artist, title].filter(Boolean).join(' ');
    const rawResults  = await search(targetQuery || query, 10);

    if (!rawResults.length) {
      showToast('No results found for this track.');
      return;
    }

    // Score & sort — official audio first
    const scored = rawResults
      .map(r => ({ ...r, _score: scoreResult(r, targetQuery) }))
      .sort((a, b) => b._score - a._score);

    const bestThumbnail = overrideThumbnail || scored[0].thumbnail;

    // ② Retry list only swaps the videoId, not the track metadata
    state.pendingRetries = scored.slice(1).map(r => ({
      ...r,
      thumbnail: bestThumbnail,      // keep the original artwork on every retry
    }));

    playTrack(scored[0].videoId, title, artist, bestThumbnail);
  } catch (err) {
    console.error('[Youtify] searchAndPlay error:', err);
    if (err.message === 'QUOTA_EXCEEDED') {
      showToast('⚠ YouTube API quota exceeded. Invidious also unavailable — try again later.');
    } else {
      showToast(`⚠ Search failed: ${err.message}`);
    }
  } finally {
    if (el) {
      el.classList.remove('loading');
      const hint = el.querySelector('.chart-play-hint');
      if (hint) hint.innerHTML =
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
    }
  }
}

/* ══ 8. NOW-PLAYING HIGHLIGHT ════════════════════════════════════════════════ */

function highlightNowPlaying(videoId) {
  $$('.chart-item, .result-item, .history-item, .quick-tile, .np-queue-item').forEach(el => {
    el.classList.toggle('now-playing', el.dataset.videoId === videoId);
  });
}

/* ══ 9. SEARCH UI ════════════════════════════════════════════════════════════ */

async function handleSearch(query) {
  const q = query || dom.searchInput?.value.trim() || '';
  if (!q) return;

  if (state.activeTab !== 'youtube') switchTab('youtube');

  if (dom.searchIdleState) dom.searchIdleState.style.display = 'none';
  if (dom.searchResults)   dom.searchResults.innerHTML       = '';
  if (dom.searchLoading)   dom.searchLoading.style.display   = 'flex';

  try {
    const results      = await search(q, 20);
    state.searchResults = results;
    if (dom.searchLoading) dom.searchLoading.style.display = 'none';
    renderSearchResults(results);
  } catch (err) {
    if (dom.searchLoading) dom.searchLoading.style.display = 'none';
    console.error('[Youtify] Search error:', err);
    if (err.message === 'QUOTA_EXCEEDED') {
      showToast('⚠ Quota exceeded — Invidious fallback also failed. Try again later.');
    } else {
      showToast(`Search failed: ${err.message}`);
    }
    if (dom.searchIdleState) dom.searchIdleState.style.display = '';
  }
}

function renderSearchResults(results) {
  if (!results.length) {
    dom.searchResults.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p class="empty-title">No results found</p>
        <p class="empty-sub">Try a different search term</p>
      </div>`;
    return;
  }

  dom.searchResults.innerHTML = results.map(r => `
    <div class="result-item"
         role="listitem"
         data-video-id="${escHtml(r.videoId)}"
         data-title="${escHtml(r.title)}"
         data-channel="${escHtml(r.channel)}"
         data-thumbnail="${escHtml(r.thumbnail)}"
         tabindex="0"
         aria-label="Play ${escHtml(r.title)} by ${escHtml(r.channel)}">
      <div class="result-thumb-wrap">
        <img class="result-thumb-img" src="${escHtml(r.thumbnail)}" alt="" loading="lazy" />
        <div class="result-thumb-overlay">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
        </div>
      </div>
      <div class="result-details">
        <p class="result-title">${escHtml(r.title)}</p>
        <p class="result-channel">${escHtml(r.channel)}</p>
      </div>
    </div>
  `).join('');

  if (state.currentTrack) highlightNowPlaying(state.currentTrack.videoId);
}

/* ══ 10. CHARTS — Live iTunes + Mock ═════════════════════════════════════════ */

async function fetchAndRenderLiveCharts() {
  if (!dom.globalList) return;
  dom.globalList.innerHTML = `
    <div style="padding:20px;text-align:center;color:var(--text-3);font-size:0.85rem;">
      <div class="chart-loading-dot" style="margin:0 auto 10px;"></div>
      Loading live charts…
    </div>`;

  try {
    const res = await fetch('https://itunes.apple.com/us/rss/topsongs/limit=15/json');
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();

    const liveCharts = data.feed.entry.map((entry, i) => {
      const title     = entry['im:name'].label;
      const artist    = entry['im:artist'].label;
      const images    = entry['im:image'];
      const coverArt  = images?.length ? images[images.length - 1].label : '';
      return {
        rank       : i + 1,
        title,
        artist,
        thumbnail  : coverArt,
        searchQuery: `${title.split(' (')[0]} ${artist}`,
      };
    });

    renderChartsList(liveCharts, dom.globalList);
  } catch (err) {
    console.warn('[Youtify] Live charts fetch failed:', err);
    renderChartsList(GLOBAL_CHARTS, dom.globalList);
  }
}

function renderChartsList(tracks, container) {
  container.innerHTML = tracks.map(t => `
    <div class="chart-item"
         data-query="${escHtml(t.searchQuery)}"
         data-title="${escHtml(t.title)}"
         data-artist="${escHtml(t.artist)}"
         ${t.thumbnail ? `data-thumbnail="${escHtml(t.thumbnail)}"` : ''}
         tabindex="0"
         aria-label="Play ${escHtml(t.title)} by ${escHtml(t.artist)}">
      <div class="chart-rank">${String(t.rank).padStart(2, '0')}</div>
      <div class="chart-thumb">
        ${t.thumbnail
          ? `<img src="${escHtml(t.thumbnail)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r-xs);" />`
          : `<div class="chart-thumb-fallback">🎵</div>`}
        <div class="chart-thumb-overlay">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
        </div>
      </div>
      <div class="chart-details">
        <p class="chart-track-name">${escHtml(t.title)}</p>
        <p class="chart-track-artist">${escHtml(t.artist)}</p>
      </div>
      <div class="chart-play-hint">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
      </div>
    </div>
  `).join('');
}

function switchChartPanel(target) {
  $$('.toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.target === target));
  dom.chartsToggle.setAttribute('data-active', target);
  dom.panelSpotify.classList.toggle('active', target === 'spotify');
  dom.panelGlobal.classList.toggle('active', target === 'global');
}

/* ══ 11. LIBRARY — LOCAL STORAGE ══════════════════════════════════════════════ */

function saveToHistory(track) {
  let history = loadHistory().filter(h => h.videoId !== track.videoId);
  history.unshift(track);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  try { localStorage.setItem(LS_KEY, JSON.stringify(history)); } catch (_) { }
  renderHistory();
  renderQuickPlays();
  renderNowPlayingQueue();
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function clearHistory() {
  try { localStorage.removeItem(LS_KEY); } catch (_) { }
  renderHistory();
  renderQuickPlays();
  renderNowPlayingQueue();
  showToast('Listening history cleared.');
}

function renderHistory() {
  const history   = loadHistory();
  const container = dom.recentlyPlayedList;

  if (!history.length) {
    container.innerHTML = `
      <div class="empty-state" id="rp-empty-state">
        <div class="empty-icon">🎧</div>
        <p class="empty-title">No history yet</p>
        <p class="empty-sub">Songs you play will appear here</p>
      </div>`;
    return;
  }

  container.innerHTML = history.map(t => `
    <div class="history-item"
         data-video-id="${escHtml(t.videoId)}"
         tabindex="0"
         aria-label="Play ${escHtml(t.title)}">
      <div class="history-art">
        ${t.thumbnail
          ? `<img src="${escHtml(t.thumbnail)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" />`
          : `<div style="width:100%;height:100%;display:grid;place-items:center;font-size:1.1rem;">🎵</div>`}
        <div class="history-art-overlay">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
        </div>
      </div>
      <div class="history-details">
        <p class="history-title">${escHtml(t.title)}</p>
        <p class="history-artist">${escHtml(t.artist || 'Unknown artist')}</p>
      </div>
    </div>
  `).join('');

  if (state.currentTrack) highlightNowPlaying(state.currentTrack.videoId);
}

function renderQuickPlays() {
  const history = loadHistory().slice(0, 4);
  if (!history.length) {
    dom.homeQuickPlays.style.display = 'none';
    return;
  }

  dom.homeQuickPlays.style.display = '';
  dom.quickPlaysContainer.innerHTML = history.map(t => `
    <button class="quick-tile"
            data-video-id="${escHtml(t.videoId)}"
            aria-label="Play ${escHtml(t.title)}">
      <div class="quick-tile-art">
        ${t.thumbnail
          ? `<img src="${escHtml(t.thumbnail)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" />`
          : `<div style="width:100%;height:100%;background:var(--bg-input);display:grid;place-items:center;font-size:1.1rem;">🎵</div>`}
      </div>
      <span class="quick-tile-name">${escHtml(t.title)}</span>
    </button>
  `).join('');

  if (state.currentTrack) highlightNowPlaying(state.currentTrack.videoId);
}

/* ══ 12. TAB NAVIGATION ══════════════════════════════════════════════════════ */

const TAB_LABELS = {
  home   : 'Browse',
  charts : 'Top Charts',
  youtube: 'Search',
  library: 'Library',
};

function switchTab(tabName) {
  if (state.activeTab === tabName) return;
  state.activeTab = tabName;

  dom.tabs.forEach(section => {
    const isTarget = section.id === `tab-${tabName}`;
    section.classList.toggle('active', isTarget);
    section.setAttribute('aria-hidden', String(!isTarget));
  });

  dom.navItems.forEach(item => {
    const isTarget = item.dataset.tab === tabName;
    item.classList.toggle('active', isTarget);
    item.setAttribute('aria-current', isTarget ? 'page' : 'false');
  });

  dom.sidebarLinks.forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tabName);
  });

  if (dom.breadcrumbLabel) dom.breadcrumbLabel.textContent = TAB_LABELS[tabName] || tabName;

  $('main-content').scrollTop = 0;

  if (tabName === 'library') renderHistory();
}

/* ══ 13. EVENT LISTENERS ═════════════════════════════════════════════════════ */

function initEventListeners() {

  // Bottom nav (mobile)
  dom.navItems.forEach(item => item.addEventListener('click', () => switchTab(item.dataset.tab)));

  // Sidebar (desktop)
  dom.sidebarLinks.forEach(link => link.addEventListener('click', () => switchTab(link.dataset.tab)));

  // Play / Pause
  dom.playPauseBtn.addEventListener('click', togglePlayPause);

  // Prev / Next (basic — queue could be wired up here in future)
  dom.prevBtn.addEventListener('click', () => {
    if (!state.currentTrack) return;
    const history = loadHistory();
    const idx     = history.findIndex(h => h.videoId === state.currentTrack.videoId);
    if (idx < history.length - 1) {
      const prev = history[idx + 1];
      playTrack(prev.videoId, prev.title, prev.artist, prev.thumbnail);
    } else {
      showToast('No previous track in history.');
    }
  });

  dom.nextBtn.addEventListener('click', () => {
    if (!state.currentTrack) return;
    const history = loadHistory();
    const idx     = history.findIndex(h => h.videoId === state.currentTrack.videoId);
    if (idx > 0) {
      const next = history[idx - 1];
      playTrack(next.videoId, next.title, next.artist, next.thumbnail);
    } else {
      showToast('No next track yet — play more songs!');
    }
  });

  // Progress bar seek
  dom.progressTrack.addEventListener('mousedown', handleSeekStart);
  dom.progressTrack.addEventListener('touchstart', handleSeekStart, { passive: true });

  function handleSeekStart(e) {
    state.isSeeking = true;
    dom.progressTrack.classList.add('seeking');
    setProgressUI(getSeekPercent(e, dom.progressTrack) * 100);

    function onMove(ev) { setProgressUI(getSeekPercent(ev, dom.progressTrack) * 100); }
    function onEnd(ev) {
      const touch = ev.changedTouches ? { clientX: ev.changedTouches[0].clientX } : ev;
      seekToPercent(getSeekPercent(touch, dom.progressTrack));
      state.isSeeking = false;
      dom.progressTrack.classList.remove('seeking');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchend', onEnd);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }

  // Volume
  dom.volumeSlider?.addEventListener('input', () => {
    if (state.ytPlayer && state.playerReady) {
      state.ytPlayer.setVolume(parseInt(dom.volumeSlider.value, 10));
    }
  });

  // Mobile search input
  dom.searchInput?.addEventListener('input', () => {
    if (dom.searchClearBtn) dom.searchClearBtn.style.display = dom.searchInput.value ? '' : 'none';
  });
  dom.searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') handleSearch(); });
  dom.searchGoBtn?.addEventListener('click', () => handleSearch());

  dom.searchClearBtn?.addEventListener('click', () => {
    dom.searchInput.value = '';
    dom.searchClearBtn.style.display = 'none';
    dom.searchResults.innerHTML = '';
    if (dom.searchIdleState) dom.searchIdleState.style.display = '';
    dom.searchInput.focus();
  });

  // Desktop search
  dom.desktopSearchInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = dom.desktopSearchInput.value.trim();
      if (q) { if (dom.searchInput) dom.searchInput.value = q; handleSearch(q); }
    }
  });

  // Search results: click / keyboard
  dom.searchResults?.addEventListener('click', e => {
    const item = e.target.closest('.result-item');
    if (item) playTrack(item.dataset.videoId, item.dataset.title, item.dataset.channel, item.dataset.thumbnail);
  });
  dom.searchResults?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.result-item');
      if (item) { e.preventDefault(); playTrack(item.dataset.videoId, item.dataset.title, item.dataset.channel, item.dataset.thumbnail); }
    }
  });

  // Charts toggle
  $$('.toggle-btn').forEach(btn => btn.addEventListener('click', () => switchChartPanel(btn.dataset.target)));

  // Charts: click/keyboard
  [dom.spotifyList, dom.globalList].forEach(list => {
    if (!list) return;
    list.addEventListener('click', e => {
      const item = e.target.closest('.chart-item');
      if (item) searchAndPlay(item.dataset.query, item.dataset.title, item.dataset.artist, item, item.dataset.thumbnail);
    });
    list.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const item = e.target.closest('.chart-item');
        if (item) { e.preventDefault(); searchAndPlay(item.dataset.query, item.dataset.title, item.dataset.artist, item, item.dataset.thumbnail); }
      }
    });
  });

  // Home: radio cards
  $('radios-scroll')?.addEventListener('click', e => {
    const card  = e.target.closest('.radio-card');
    if (!card) return;
    const title = card.querySelector('.radio-title')?.textContent || 'Radio';
    searchAndPlay(card.dataset.query, title, 'Youtify Radio', card, null);
  });

  // Home: recommended cards
  document.querySelector('.rec-grid')?.addEventListener('click', e => {
    const card = e.target.closest('.rec-card');
    if (card) searchAndPlay(card.dataset.query, card.dataset.title, card.dataset.artist, card, null);
  });

  // Home: artist chips
  $('artists-scroll')?.addEventListener('click', e => {
    const chip = e.target.closest('.artist-chip');
    if (!chip) return;
    const name = chip.querySelector('.artist-name')?.textContent || 'Artist';
    searchAndPlay(chip.dataset.query, name + ' Mix', name, chip, null);
  });

  // Home: quick-plays
  dom.quickPlaysContainer.addEventListener('click', e => {
    const tile  = e.target.closest('.quick-tile');
    if (!tile)  return;
    const track = loadHistory().find(h => h.videoId === tile.dataset.videoId);
    if (track)  playTrack(track.videoId, track.title, track.artist, track.thumbnail);
  });

  // Library: recently played
  dom.recentlyPlayedList.addEventListener('click', e => {
    const item  = e.target.closest('.history-item');
    if (!item)  return;
    const track = loadHistory().find(h => h.videoId === item.dataset.videoId);
    if (track)  playTrack(track.videoId, track.title, track.artist, track.thumbnail);
  });
  dom.recentlyPlayedList.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.history-item');
      if (item) { e.preventDefault(); item.click(); }
    }
  });

  // Now Playing queue
  dom.npQueueList?.addEventListener('click', e => {
    const item  = e.target.closest('.np-queue-item');
    if (!item)  return;
    const track = loadHistory().find(h => h.videoId === item.dataset.videoId);
    if (track)  playTrack(track.videoId, track.title, track.artist, track.thumbnail);
  });

  // Library: clear history
  dom.clearHistoryBtn?.addEventListener('click', clearHistory);
}

/* ══ 14. TOAST ════════════════════════════════════════════════════════════════ */

let toastTimer = null;

function showToast(message, duration = 2800) {
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), duration);
}

/* ══ 15. UTILITIES ════════════════════════════════════════════════════════════ */

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ══ 16. INIT ═════════════════════════════════════════════════════════════════ */

function init() {
  renderChartsList(SPOTIFY_TRENDS, dom.spotifyList);
  fetchAndRenderLiveCharts();
  renderQuickPlays();
  renderNowPlayingQueue();
  initEventListeners();
  console.log('[Youtify] App initialised — streaming via Invidious + YouTube IFrame API 🎵');
}

init();
