"use strict";

// ============================================================
// === LOGGING ================================================
// ============================================================
const LOG_CONFIG = {
    enabled: true,
    showTimestamp: true,
    logToConsole: true,
    logToScreen: false
};
const EVENT_TYPES = {
    AUDIO: '🎵', UI: '🖱️', API: '🌐', LYRICS: '📝',
    PLAYER: '⏯️', SEARCH: '🔍', ERROR: '❌', SUCCESS: '✅', INFO: 'ℹ️'
};

function logEvent(eventType, message, data = null) {
    if (!LOG_CONFIG.enabled) return;
    const ts   = new Date().toISOString().split('T')[1].slice(0, -1);
    const icon = EVENT_TYPES[eventType] || 'ℹ️';
    const msg  = `${icon} [${ts}] ${message}`;
    if (LOG_CONFIG.logToConsole) data ? console.log(msg, data) : console.log(msg);
}

// ============================================================
// === STATO GLOBALE ==========================================
// ============================================================
let isPlaying       = false;
let isShuffle       = false;
let isLoop          = false;
let currentSongIndex = 0;           // indice in currentPlaylist
let currentPlaylist  = [];          // playlist attiva in riproduzione
let isNavigatingBack = false;
let shuffleHistory   = [];
const MAX_SHUFFLE_HISTORY = 20;

// Dati persistenti
let myPlaylist   = JSON.parse(localStorage.getItem('myPlaylist'))  || [];
let likedSongs   = JSON.parse(localStorage.getItem('likedSongs'))  || [];

// Tutte le canzoni disponibili (scritte da scopri.js)
let ALL_AVAILABLE_SONGS = JSON.parse(localStorage.getItem('allSongsDataStore')) || [];

// ============================================================
// === UTILITY ================================================
// ============================================================
function normalizeAudioSrc(src) {
    if (!src) return '';
    if (src.includes('/music/')) return src.substring(src.lastIndexOf('/music/') + 1);
    return src;
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.minerify-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'minerify-toast';
    const colors = { info: '#333', success: '#1db954', error: '#e22134', warning: '#f59f00' };
    toast.style.cssText = `
        position:fixed; bottom:100px; right:20px;
        background:${colors[type] || colors.info}; color:#fff;
        padding:12px 20px; border-radius:8px;
        z-index:10000; opacity:0;
        transition:opacity 0.3s ease;
        font-family:'Roboto',sans-serif; font-size:14px;
        box-shadow:0 4px 15px rgba(0,0,0,0.4);
        max-width:300px; word-break:break-word;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = '1');
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function reloadAvailableSongs() {
    ALL_AVAILABLE_SONGS = JSON.parse(localStorage.getItem('allSongsDataStore')) || [];
    logEvent('INFO', `${ALL_AVAILABLE_SONGS.length} canzoni disponibili`);
}

// ============================================================
// === PLAYER STATE ===========================================
// ============================================================
/**
 * Salva uno stato UNIFICATO — stesso formato di scopri.js
 * così i due si leggono reciprocamente senza corruzione.
 */
function savePlayerState() {
    const ap           = document.getElementById('audio-player');
    const currentSongEl = document.getElementById('current-song');
    const albumCoverEl  = document.getElementById('current-album-cover');
    if (!ap) return;

    const state = {
        src:          ap.src,
        currentTime:  ap.currentTime,
        isPlaying,
        songName:     currentSongEl?.textContent || '',
        albumCover:   albumCoverEl?.src  || '',
        volume:       ap.volume,
        isShuffle,
        isLoop,
        currentPlaylist,
        currentPlaylistIndex: currentSongIndex
    };
    localStorage.setItem('playerState', JSON.stringify(state));
    logEvent('INFO', 'Stato salvato', { song: currentSongEl?.textContent });
}

/**
 * Ripristina lo stato — compatibile con playerState scritto sia da scopri che da playlist.
 */
function restorePlayerState() {
    try {
        const saved = JSON.parse(localStorage.getItem('playerState'));
        if (!saved || !saved.src) return;

        const ap           = document.getElementById('audio-player');
        const playPauseBtn = document.getElementById('play-pause');
        const currentSongEl = document.getElementById('current-song');
        const albumCoverEl  = document.getElementById('current-album-cover');
        const volControl    = document.getElementById('volume-control');

        ap.src         = saved.src;
        ap.currentTime = saved.currentTime || 0;
        ap.volume      = saved.volume != null ? saved.volume : 1;
        if (volControl) volControl.value = (saved.volume != null ? saved.volume : 1) * 100;

        currentSongEl.textContent = saved.songName || 'Nessuna canzone in riproduzione';
        if (albumCoverEl) albumCoverEl.src = saved.albumCover || '';

        // Ripristina currentPlaylist
        if (saved.currentPlaylist?.length) {
            currentPlaylist = saved.currentPlaylist;
            currentSongIndex = saved.currentPlaylistIndex || 0;
        }

        isShuffle = saved.isShuffle || false;
        isLoop = saved.isLoop || false;

        logEvent('INFO', 'Stato ripristinato', { song: saved.songName });

        updateShuffleLoopButtons();
        updateLikeButton();
        updatePlaylistButton();
        highlightCurrentSongInList();

        if (saved.isPlaying && ap.src) {
            ap.play()
                .then(() => {
                    isPlaying = true;
                    playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                    logEvent('SUCCESS', 'Riproduzione ripristinata');
                })
                .catch(() => {
                    isPlaying = false;
                    playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                    logEvent('INFO', 'Autoplay bloccato dal browser');
                });
        }
    } catch (err) {
        logEvent('ERROR', 'Errore ripristino stato', err);
    }
}

// ============================================================
// === CORE PLAYER ============================================
// ============================================================
function playSong(song, index) {
    if (!song) { logEvent('ERROR', 'playSong: song è null'); return; }

    const ap           = document.getElementById('audio-player');
    const playPauseBtn = document.getElementById('play-pause');
    const currentSongEl = document.getElementById('current-song');
    const artistEl     = document.getElementById('current-artist');
    const albumCoverEl = document.getElementById('current-album-cover');
    const loadingEl    = document.getElementById('audio-loading');

    ap.src = song.src;
    currentSongIndex = index;
    currentSongEl.textContent = song.name;
    if (artistEl)    artistEl.textContent = song.artist || '';
    if (albumCoverEl) albumCoverEl.src    = song.cover  || '';
    if (loadingEl)   loadingEl.style.display = 'block';

    logEvent('PLAYER', `Riproduzione: ${song.name}`);

    ap.play().then(() => {
        isPlaying = true;
        playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';

        if (isShuffle && !isNavigatingBack) {
            shuffleHistory.push(song.src);
            if (shuffleHistory.length > MAX_SHUFFLE_HISTORY) shuffleHistory.shift();
        }
        isNavigatingBack = false;

        updateLikeButton();
        updatePlaylistButton();
        highlightCurrentSongInList();
        savePlayerState();
        logEvent('SUCCESS', `Avviato: ${song.name}`);
    }).catch(err => {
        isPlaying = false;
        playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
        logEvent('ERROR', 'Errore riproduzione', err);
    });

    ap.oncanplay = () => { if (loadingEl) loadingEl.style.display = 'none'; };
    ap.onerror   = () => { if (loadingEl) loadingEl.style.display = 'none'; };
}

// ============================================================
// === PROGRESS BAR ===========================================
// ============================================================
function updateProgressBar() {
    const ap = document.getElementById('audio-player');
    if (!ap?.duration || isNaN(ap.duration)) return;
    const cm = Math.floor(ap.currentTime / 60);
    const cs = Math.floor(ap.currentTime % 60);
    const dm = Math.floor(ap.duration / 60);
    const ds = Math.floor(ap.duration % 60);
    const ct = document.getElementById('current-time');
    const td = document.getElementById('total-duration');
    const pb = document.getElementById('progress-bar');
    if (ct) ct.textContent = `${cm}:${cs < 10 ? '0' : ''}${cs}`;
    if (td) td.textContent = `${dm}:${ds < 10 ? '0' : ''}${ds}`;
    if (pb) pb.value = (ap.currentTime / ap.duration) * 100;
}

function updateShuffleLoopButtons() {
    document.getElementById('loop')?.classList.toggle('active', isLoop);
    document.getElementById('shuffle')?.classList.toggle('active', isShuffle);
}

// ============================================================
// === LIKE / PLAYLIST ========================================
// ============================================================
function saveLikedSongs()  { localStorage.setItem('likedSongs',  JSON.stringify(likedSongs)); }
function saveMyPlaylist()  { localStorage.setItem('myPlaylist',  JSON.stringify(myPlaylist)); }

function updateLikeButton() {
    const ap  = document.getElementById('audio-player');
    const btn = document.getElementById('like-button');
    if (!btn || !ap) return;
    btn.textContent = likedSongs.some(s => s.src === ap.src) ? '❤️' : '🤍';
}

function updatePlaylistButton() {
    const btn = document.getElementById('add-to-playlist-button');
    const ap  = document.getElementById('audio-player');
    if (!btn || !ap?.src) return;
    const norm = normalizeAudioSrc(ap.src);
    const isIn = myPlaylist.some(s => normalizeAudioSrc(s.src) === norm);
    btn.style.color = isIn ? '#1ed760' : '';
    btn.title       = isIn ? 'Già in playlist' : 'Aggiungi alla mia playlist';
}

function highlightCurrentSongInList() {
    document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('playing'));
    const song = currentPlaylist[currentSongIndex];
    if (!song) return;
    const el = document.querySelector(`.playlist-item[data-src="${CSS.escape(song.src)}"]`);
    if (el) { el.classList.add('playing'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

// ============================================================
// === PLAYLIST MANAGEMENT ====================================
// ============================================================
function addSongToMyPlaylist(songData) {
    if (!songData) return;
    const norm = normalizeAudioSrc(songData.src);
    if (myPlaylist.some(s => normalizeAudioSrc(s.src) === norm)) {
        showToast(`"${songData.name}" è già nella playlist.`, 'warning'); return;
    }
    myPlaylist.push({
        src:      songData.src,
        name:     songData.name,
        artist:   songData.artist    || 'Artista Sconosciuto',
        albumName: songData.albumName || '',
        cover:    songData.cover     || '',
        duration: songData.duration  || 0
    });
    saveMyPlaylist();
    renderMyPlaylist();
    updatePlaylistButton();
    showToast(`"${songData.name}" aggiunta!`, 'success');
    logEvent('SUCCESS', `Playlist: aggiunta ${songData.name}`);
}

function removeSongFromMyPlaylist(songSrc) {
    const before = myPlaylist.length;
    myPlaylist = myPlaylist.filter(s => s.src !== songSrc);
    if (myPlaylist.length < before) {
        saveMyPlaylist();
        renderMyPlaylist();
        updatePlaylistButton();
        showToast('Brano rimosso dalla playlist.', 'info');
    }
}

function addSongToLiked(songData) {
    if (!songData) return;
    if (likedSongs.some(s => s.src === songData.src)) {
        removeSongFromLiked(songData.src); return;
    }
    likedSongs.push({
        src:      songData.src,
        name:     songData.name,
        artist:   songData.artist  || '',
        cover:    songData.cover   || '',
        duration: songData.duration || 0
    });
    saveLikedSongs();
    renderLikedSongs();
    updateLikeButton();
    showToast(`"${songData.name}" aggiunto ai preferiti!`, 'success');
}

function removeSongFromLiked(songSrc) {
    likedSongs = likedSongs.filter(s => s.src !== songSrc);
    saveLikedSongs();
    renderLikedSongs();
    updateLikeButton();
    showToast('Rimosso dai preferiti.', 'info');
}

// ============================================================
// === RENDERING ==============================================
// ============================================================
function renderMyPlaylist() {
    const container = document.getElementById('user-playlist-list');
    if (!container) return;
    container.innerHTML = '';

    if (myPlaylist.length === 0) {
        container.innerHTML = `
            <li class="table-header"><span>Titolo</span><span>Artista</span><span>Azioni</span></li>
            <li><p class="empty-list-message">Playlist vuota. Aggiungi canzoni con il pulsante <strong>+</strong>!</p></li>`;
        return;
    }

    const header = document.createElement('li');
    header.className = 'table-header';
    header.innerHTML = '<span>Titolo</span><span>Artista</span><span>Azioni</span>';
    container.appendChild(header);

    myPlaylist.forEach((song, index) => {
        const li = document.createElement('li');
        li.classList.add('playlist-item');
        li.dataset.src = song.src;
        li.draggable   = true;
        li.innerHTML = `
            <img src="${song.cover || ''}" alt="Cover" class="playlist-item-cover">
            <div class="playlist-item-info">
                <span class="playlist-item-name">${song.name}</span>
                <span class="playlist-item-artist">${song.artist || 'Artista Sconosciuto'}</span>
            </div>
            <span class="playlist-item-duration">${formatDuration(song.duration)}</span>
            <div class="playlist-item-actions">
                <button class="playlist-action-btn play-btn"   title="Riproduci"><i class="bi bi-play-fill"></i></button>
                <button class="playlist-action-btn remove-btn" title="Rimuovi"><i class="bi bi-trash"></i></button>
            </div>`;
        li.querySelector('.play-btn').addEventListener('click', e => {
            e.stopPropagation();
            currentPlaylist = [...myPlaylist];
            playSong(song, index);
        });
        li.querySelector('.remove-btn').addEventListener('click', e => {
            e.stopPropagation();
            removeSongFromMyPlaylist(song.src);
        });
        // Click sulla riga per riprodurre
        li.addEventListener('click', e => {
            if (e.target.closest('.playlist-item-actions')) return;
            currentPlaylist = [...myPlaylist];
            playSong(song, index);
        });
        container.appendChild(li);
    });

    addDragAndDropListeners();
    highlightCurrentSongInList();
    logEvent('SUCCESS', `Playlist renderizzata (${myPlaylist.length} canzoni)`);
}

function renderLikedSongs() {
    const container = document.getElementById('favorite-songs-list');
    if (!container) return;
    container.innerHTML = '';

    if (likedSongs.length === 0) {
        container.innerHTML = `
            <li class="table-header"><span>Titolo</span><span>Artista</span><span>Azioni</span></li>
            <li><p class="empty-list-message">Nessun preferito. Clicca ❤️ su un brano per aggiungerlo!</p></li>`;
        return;
    }

    const header = document.createElement('li');
    header.className = 'table-header';
    header.innerHTML = '<span>Titolo</span><span>Artista</span><span>Azioni</span>';
    container.appendChild(header);

    likedSongs.forEach(song => {
        const li = document.createElement('li');
        li.classList.add('playlist-item');
        li.dataset.src = song.src;
        li.innerHTML = `
            <img src="${song.cover || ''}" alt="Cover" class="playlist-item-cover">
            <div class="playlist-item-info">
                <span class="playlist-item-name">${song.name}</span>
                <span class="playlist-item-artist">${song.artist || 'Artista Sconosciuto'}</span>
            </div>
            <span class="playlist-item-duration">${formatDuration(song.duration)}</span>
            <div class="playlist-item-actions">
                <button class="playlist-action-btn play-btn"            title="Riproduci"><i class="bi bi-play-fill"></i></button>
                <button class="playlist-action-btn add-to-playlist-btn" title="Aggiungi alla playlist"><i class="bi bi-plus-circle"></i></button>
                <button class="playlist-action-btn remove-btn"          title="Rimuovi dai preferiti"><i class="bi bi-trash"></i></button>
            </div>`;
        li.querySelector('.play-btn').addEventListener('click', e => {
            e.stopPropagation();
            currentPlaylist = [...likedSongs];
            const idx = currentPlaylist.findIndex(s => s.src === song.src);
            playSong(song, idx !== -1 ? idx : 0);
        });
        li.querySelector('.remove-btn').addEventListener('click', e => {
            e.stopPropagation();
            removeSongFromLiked(song.src);
        });
        li.querySelector('.add-to-playlist-btn').addEventListener('click', e => {
            e.stopPropagation();
            const full = ALL_AVAILABLE_SONGS.find(s => s.src === song.src) || song;
            addSongToMyPlaylist(full);
        });
        li.addEventListener('click', e => {
            if (e.target.closest('.playlist-item-actions')) return;
            currentPlaylist = [...likedSongs];
            const idx = currentPlaylist.findIndex(s => s.src === song.src);
            playSong(song, idx !== -1 ? idx : 0);
        });
        container.appendChild(li);
    });
    highlightCurrentSongInList();
}

// ============================================================
// === OVERLAY RICERCA CANZONI ================================
// ============================================================
function openAddSongSearch() {
    reloadAvailableSongs();
    const overlay    = document.getElementById('add-songs-overlay');
    const searchInput = document.getElementById('overlay-search-bar');
    if (!overlay) return;
    overlay.classList.add('active');
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    displayOverlayResults('');
}

function closeAddSongSearch() {
    document.getElementById('add-songs-overlay')?.classList.remove('active');
}

function displayOverlayResults(query) {
    // Rilegge myPlaylist sempre aggiornata
    myPlaylist = JSON.parse(localStorage.getItem('myPlaylist')) || [];
    const grid = document.getElementById('overlay-songs-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (ALL_AVAILABLE_SONGS.length === 0) {
        grid.innerHTML = '<p class="empty-list-message">Nessuna canzone disponibile. Visita prima la pagina <strong>Scopri</strong>!</p>';
        return;
    }

    const lq = query.toLowerCase().trim();
    const filtered = lq.length === 0
        ? ALL_AVAILABLE_SONGS
        : ALL_AVAILABLE_SONGS.filter(s =>
            s.name.toLowerCase().includes(lq) ||
            (s.artist || '').toLowerCase().includes(lq) ||
            (s.albumName || '').toLowerCase().includes(lq)
          );

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-list-message">Nessun brano trovato.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach(song => {
        const card = document.createElement('div');
        card.classList.add('overlay-song-card');
        const isIn = myPlaylist.some(s => normalizeAudioSrc(s.src) === normalizeAudioSrc(song.src));
        if (isIn) card.classList.add('added');

        card.innerHTML = `
            <img src="${song.cover || ''}" alt="Cover" class="overlay-song-cover">
            <div class="overlay-song-info">
                <div class="overlay-song-title">${song.name}</div>
                <div class="overlay-song-artist">${song.artist || ''} — ${song.albumName || ''}</div>
            </div>
            <button class="overlay-add-btn" ${isIn ? 'disabled' : ''}>
                <i class="bi bi-${isIn ? 'check' : 'plus'}"></i> ${isIn ? 'Aggiunta' : 'Aggiungi'}
            </button>`;

        const btn = card.querySelector('.overlay-add-btn');
        if (!isIn) {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                addSongToMyPlaylist(song);
                btn.disabled = true;
                btn.innerHTML = '<i class="bi bi-check"></i> Aggiunta';
                card.classList.add('added');
            });
        }
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

// ============================================================
// === DRAG & DROP ============================================
// ============================================================
let _draggedItem = null;

function addDragAndDropListeners() {
    const container = document.getElementById('user-playlist-list');
    if (!container) return;
    container.querySelectorAll('.playlist-item').forEach(item => {
        item.addEventListener('dragstart', onDragStart);
        item.addEventListener('dragover',  onDragOver);
        item.addEventListener('dragleave', onDragLeave);
        item.addEventListener('drop',      onDrop);
        item.addEventListener('dragend',   onDragEnd);
    });
}

function onDragStart(e) { _draggedItem = e.currentTarget; e.dataTransfer.effectAllowed = 'move'; }
function onDragOver(e)  { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (e.currentTarget !== _draggedItem) e.currentTarget.style.borderTop = '2px solid #007acc'; }
function onDragLeave(e) { e.currentTarget.style.borderTop = ''; }

function onDrop(e) {
    e.stopPropagation();
    const target = e.currentTarget;
    target.style.borderTop = '';
    if (!_draggedItem || _draggedItem === target) return;

    const fromSrc = _draggedItem.dataset.src;
    const toSrc   = target.dataset.src;
    const fromIdx = myPlaylist.findIndex(s => s.src === fromSrc);
    const toIdx   = myPlaylist.findIndex(s => s.src === toSrc);
    if (fromIdx === -1 || toIdx === -1) return;

    const [removed] = myPlaylist.splice(fromIdx, 1);
    myPlaylist.splice(toIdx, 0, removed);

    // Aggiorna currentSongIndex se stiamo riproducendo da myPlaylist
    const playingSrc = currentPlaylist[currentSongIndex]?.src;
    if (playingSrc) {
        currentPlaylist = [...myPlaylist];
        const newIdx = currentPlaylist.findIndex(s => s.src === playingSrc);
        if (newIdx !== -1) currentSongIndex = newIdx;
    }

    saveMyPlaylist();
    renderMyPlaylist();
    showToast('Canzone riordinata!', 'info');
}

function onDragEnd() {
    _draggedItem = null;
    document.getElementById('user-playlist-list')?.querySelectorAll('.playlist-item')
        .forEach(item => item.style.borderTop = '');
}

// ============================================================
// === PLAYER BAR =============================================
// ============================================================
function initPlayerBar() {
    const ap           = document.getElementById('audio-player');
    const playPauseBtn = document.getElementById('play-pause');
    const prevSongBtn  = document.getElementById('prev-song');
    const nextSongBtn  = document.getElementById('next-song');
    const shuffleBtn   = document.getElementById('shuffle');
    const loopBtn      = document.getElementById('loop');
    const progressBar  = document.getElementById('progress-bar');
    const volumeControl = document.getElementById('volume-control');
    const likeButton   = document.getElementById('like-button');
    const addToPlaylistBtn = document.getElementById('add-to-playlist-button');
    const currentSongEl    = document.getElementById('current-song');
    const albumCoverEl     = document.getElementById('current-album-cover');

    if (!ap || !playPauseBtn) { logEvent('ERROR', 'Player bar: elementi mancanti'); return; }

    // --- Play/Pause ---
    playPauseBtn.addEventListener('click', () => {
        if (isPlaying) {
            ap.pause();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            isPlaying = false;
        } else {
            // Se nessuna canzone caricata, avvia dalla playlist
            if ((!ap.src || ap.src === window.location.href) && myPlaylist.length > 0) {
                currentPlaylist = [...myPlaylist];
                playSong(currentPlaylist[0], 0);
                return;
            }
            ap.play().catch(() => {});
            playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
            isPlaying = true;
        }
        savePlayerState();
    });

    // --- Precedente ---
    prevSongBtn.addEventListener('click', () => {
        if (isShuffle) {
            if (shuffleHistory.length > 1) {
                shuffleHistory.pop();
                const prevSrc = shuffleHistory[shuffleHistory.length - 1];
                const song    = currentPlaylist.find(s => s.src === prevSrc);
                if (song) { isNavigatingBack = true; playSong(song, currentPlaylist.indexOf(song)); }
            }
            return;
        }
        if (currentSongIndex > 0) {
            playSong(currentPlaylist[currentSongIndex - 1], currentSongIndex - 1);
        } else if (isLoop && currentPlaylist.length > 0) {
            playSong(currentPlaylist[currentPlaylist.length - 1], currentPlaylist.length - 1);
        }
    });

    // --- Successivo ---
    nextSongBtn.addEventListener('click', () => {
        if (isShuffle) {
            let idx;
            do { idx = Math.floor(Math.random() * currentPlaylist.length); }
            while (currentPlaylist.length > 1 && currentPlaylist[idx]?.src === ap.src);
            if (currentPlaylist[idx]) playSong(currentPlaylist[idx], idx);
        } else if (currentSongIndex < currentPlaylist.length - 1) {
            playSong(currentPlaylist[currentSongIndex + 1], currentSongIndex + 1);
        } else if (isLoop && currentPlaylist.length > 0) {
            playSong(currentPlaylist[0], 0);
        }
    });

    // --- Fine canzone ---
    ap.addEventListener('ended', () => {
        if (isLoop) {
            playSong(currentPlaylist[currentSongIndex], currentSongIndex);
        } else if (isShuffle) {
            let idx;
            do { idx = Math.floor(Math.random() * currentPlaylist.length); }
            while (currentPlaylist.length > 1 && currentPlaylist[idx]?.src === ap.src);
            if (currentPlaylist[idx]) playSong(currentPlaylist[idx], idx);
        } else if (currentSongIndex < currentPlaylist.length - 1) {
            playSong(currentPlaylist[currentSongIndex + 1], currentSongIndex + 1);
        }
        // Fine playlist: si ferma
    });

    // --- Volume ---
    volumeControl.addEventListener('input', () => {
        ap.volume = volumeControl.value / 100;
        savePlayerState();
    });

    // --- Progress bar ---
    ap.addEventListener('timeupdate', () => {
        updateProgressBar();
        savePlayerState(); // throttled
    });
    progressBar.addEventListener('input', () => {
        if (!isNaN(ap.duration)) ap.currentTime = (progressBar.value / 100) * ap.duration;
    });
    ap.addEventListener('loadedmetadata', updateProgressBar);
    ap.addEventListener('canplaythrough', () => {
        const l = document.getElementById('audio-loading');
        if (l) l.style.display = 'none';
    });
    ap.addEventListener('error', () => {
        const l = document.getElementById('audio-loading');
        if (l) l.style.display = 'none';
        currentSongEl.textContent = 'Errore di riproduzione';
        playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
        isPlaying = false;
    });
    ap.addEventListener('play',  savePlayerState);
    ap.addEventListener('pause', savePlayerState);

    // --- Loop / Shuffle ---
    loopBtn.addEventListener('click', () => {
        isLoop = !isLoop;
        if (isLoop) { isShuffle = false; shuffleBtn.classList.remove('active'); }
        updateShuffleLoopButtons();
        savePlayerState();
    });
    shuffleBtn.addEventListener('click', () => {
        isShuffle = !isShuffle;
        if (isShuffle) { isLoop = false; loopBtn.classList.remove('active'); }
        updateShuffleLoopButtons();
        savePlayerState();
    });

    // --- Like ---
    likeButton.addEventListener('click', () => {
        const src   = ap.src;
        const name  = currentSongEl.textContent;
        const cover = albumCoverEl?.src || '';
        const songData = ALL_AVAILABLE_SONGS.find(s => s.src === src) || currentPlaylist[currentSongIndex];
        const isLiked  = likedSongs.some(s => s.src === src);
        if (isLiked) {
            likedSongs = likedSongs.filter(s => s.src !== src);
            showToast('Rimosso dai preferiti', 'info');
        } else {
            likedSongs.push({
                src,
                name,
                cover,
                artist:   songData?.artist   || '',
                duration: ap.duration || songData?.duration || 0
            });
            showToast('Aggiunto ai preferiti!', 'success');
        }
        saveLikedSongs();
        updateLikeButton();
        renderLikedSongs();
    });

    // --- Aggiungi alla playlist dalla playerbar ---
    if (addToPlaylistBtn) {
        addToPlaylistBtn.addEventListener('click', () => {
            if (!ap.src || currentSongEl.textContent === 'Nessuna canzone in riproduzione') {
                showToast('Nessuna canzone in riproduzione', 'warning'); return;
            }
            const norm   = normalizeAudioSrc(ap.src);
            const songData = ALL_AVAILABLE_SONGS.find(s => normalizeAudioSrc(s.src) === norm)
                          || currentPlaylist[currentSongIndex];
            if (!songData) { showToast('Dati canzone non trovati', 'error'); return; }
            addSongToMyPlaylist(songData);
            addToPlaylistBtn.style.transform = 'scale(1.2)';
            setTimeout(() => addToPlaylistBtn.style.transform = 'scale(1)', 300);
        });
    }

    // --- Equalizzatore ---
    const eqButton   = document.getElementById('equalizer-button');
    const eqPanel    = document.getElementById('equalizer-panel');
    const eqCloseBtn = document.getElementById('eq-close-btn');
    if (eqButton && eqPanel) {
        eqButton.addEventListener('click', e => {
            e.stopPropagation();
            const shown = eqPanel.classList.toggle('show');
            eqButton.classList.toggle('active', shown);
        });
        eqCloseBtn?.addEventListener('click', e => {
            e.stopPropagation();
            eqPanel.classList.remove('show');
            eqButton.classList.remove('active');
        });
        document.addEventListener('click', e => {
            if (!eqPanel.classList.contains('show')) return;
            if (eqButton.contains(e.target) || eqPanel.contains(e.target)) return;
            eqPanel.classList.remove('show');
            eqButton.classList.remove('active');
        });
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape' && eqPanel.classList.contains('show')) {
                eqPanel.classList.remove('show');
                eqButton.classList.remove('active');
            }
        });
    }

    window.addEventListener('beforeunload', savePlayerState);
    logEvent('SUCCESS', 'Player bar inizializzata');
}

// ============================================================
// === INIZIALIZZAZIONE =======================================
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    logEvent('INFO', '=== PLAYLIST PAGE AVVIATA ===');

    if (ALL_AVAILABLE_SONGS.length === 0) {
        logEvent('INFO', 'allSongsDataStore vuoto — visita Scopri per caricare le canzoni');
        showToast('Visita "Scopri" per caricare le canzoni disponibili.', 'warning');
    }

    // -- LOGICA ACCOUNT UTENTE --
    const currentUserJSON = localStorage.getItem('currentUser');
    let currentUser = null;
    try {
        if (currentUserJSON) currentUser = JSON.parse(currentUserJSON);
    } catch(e){}

    const userAvatar = document.getElementById('user-avatar');
    const userMenuName = document.getElementById('user-menu-name');
    const logoutBtn = document.getElementById('logout-btn');

    if (currentUser && currentUser.nome) {
        if (userMenuName) userMenuName.textContent = currentUser.nome;
        if (userAvatar) userAvatar.textContent = currentUser.nome.charAt(0).toUpperCase();
    } else {
        if (userMenuName) userMenuName.textContent = "Ospite";
        if (userAvatar) userAvatar.textContent = "?";
        alert("Devi accedere per visualizzare la libreria.");
        window.location.href = "../accesso_pagina/accedi/accedi.html";
        return;
    }

    // Renderizza ascoltati di recente nel menu
    renderRecentlyPlayed();

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('currentUser');
            window.location.href = "../accesso_pagina/accedi/accedi.html";
        });
    }

    // Renderizza ascoltati di recente nel menu
    renderRecentlyPlayed();

    initPlayerBar();
    renderLikedSongs();
    renderMyPlaylist();
    restorePlayerState();

    // --- Play playlist button ---
    document.getElementById('play-playlist-btn')?.addEventListener('click', () => {
        if (myPlaylist.length > 0) {
            currentPlaylist = [...myPlaylist];
            playSong(currentPlaylist[0], 0);
            showToast('Riproduzione playlist avviata!', 'success');
        } else {
            showToast('La playlist è vuota!', 'warning');
        }
    });

    // --- Overlay aggiungi canzoni ---
    document.getElementById('open-overlay-btn')?.addEventListener('click', openAddSongSearch);
    document.getElementById('close-overlay-btn')?.addEventListener('click', closeAddSongSearch);
    document.getElementById('overlay-search-bar')?.addEventListener('input', e => displayOverlayResults(e.target.value));

    const overlay = document.getElementById('add-songs-overlay');
    overlay?.addEventListener('click', e => { if (e.target === overlay) closeAddSongSearch(); });

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeAddSongSearch();
    });

    // --- Sync stato UI ---
    updateLikeButton();
    updatePlaylistButton();
    updateShuffleLoopButtons();

    logEvent('SUCCESS', `Playlist inizializzata – ${myPlaylist.length} brani, ${likedSongs.length} preferiti`);
});

// ================================================================
// === FUNZIONI PER ASCOLTATI DI RECENTE (LIBRERIA) ===
// ================================================================

function getRecentlyPlayed() {
    try {
        const data = localStorage.getItem('minerifyRecent');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function renderRecentlyPlayed() {
    const strip = document.getElementById('user-menu-recents-list');
    if (!strip) return;

    const recent = getRecentlyPlayed();
    strip.innerHTML = '';

    if (recent.length === 0) {
        strip.innerHTML = '<p style="color: rgba(255,255,255,0.5); font-style: italic; font-size: 0.8em; margin: 0;">Nessun ascolto recente.</p>';
        return;
    }

    recent.forEach(item => {
        const rawName  = item.name || '';
        const title    = rawName.includes(' - ') ? rawName.split(' - ')[0].trim() : rawName;

        const el = document.createElement('div');
        el.className = 'recent-item-menu';
        el.title = item.name || '';
        el.innerHTML = `
            <img src="${item.cover || '../images/placeholder-album.png'}" alt="Cover" class="recent-item-menu-cover" onerror="this.src='../images/placeholder-album.png'">
            <div class="recent-item-menu-info">
                <p class="recent-item-menu-title">${title}</p>
                <p class="recent-item-menu-artist">${item.artist || 'Sconosciuto'}</p>
            </div>
            <i class="bi bi-play-fill recent-item-menu-play"></i>
        `;
        el.addEventListener('click', () => {
            const songData = ALL_AVAILABLE_SONGS.find(s => normalizeAudioSrc(s.src) === normalizeAudioSrc(item.src));
            if (songData) playSong(songData, null); 
        });
        strip.appendChild(el);
    });
}