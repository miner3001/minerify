// === NUOVE FEATURE: MODALE FULLSCREEN NOW PLAYING ===
// ================================================================
let npVisualizerRAF = null;
let npCurrentHighlightedLine = -1;
let npLyricsLines = [];
let npTimePerLine = 0;
let npSyncOffset = 0;

function openNowPlayingModal() {
    const modal = document.getElementById('nowplaying-modal');
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Aggiorna info con la canzone corrente
    const currentSong = {
        name: document.getElementById('current-song')?.textContent || '',
        artist: currentArtist,
        cover: document.getElementById('current-album-cover')?.src || '',
        albumName: ''
    };
    updateNowPlayingModal(currentSong);
    // Applica sfondo dinamico SOLO all'apertura del fullscreen
    const coverSrc = document.getElementById('current-album-cover')?.src || '';
    if (coverSrc) extractAndApplyDynamicBg(coverSrc);
    // Sincronizza stato play/pause
    syncNpPlayPause();
    // Avvia visualizzatore
    startNpVisualizer();
    // Carica testi
    loadNpLyrics();
    // Sincronizza progress
    syncNpProgress();
}

function closeNowPlayingModal() {
    const modal = document.getElementById('nowplaying-modal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    // Rimuovi sfondo dinamico all'uscita dal fullscreen
    document.body.classList.remove('dynamic-bg-active');
    if (npVisualizerRAF) { cancelAnimationFrame(npVisualizerRAF); npVisualizerRAF = null; }
}

function updateNowPlayingModal(songData) {
    if (!songData) return;
    const modal = document.getElementById('nowplaying-modal');
    if (!modal || !modal.classList.contains('open')) return;
    // Estrai nome canzone
    const rawName = songData.name || '';
    const songTitle = rawName.includes(' - ') ? rawName.split(' - ')[0].trim() : rawName;
    const el = (id) => document.getElementById(id);
    if (el('nowplaying-cover')) el('nowplaying-cover').src = songData.cover || '';
    if (el('nowplaying-title')) el('nowplaying-title').textContent = songTitle || 'Nessuna canzone';
    if (el('nowplaying-artist-name')) el('nowplaying-artist-name').textContent = songData.artist || 'â€”';
    if (el('nowplaying-album-name')) el('nowplaying-album-name').textContent = songData.albumName || 'â€”';
    if (el('np-lyrics-title')) el('np-lyrics-title').textContent = `Testi â€“ ${songTitle}`;
    // Like
    const npLike = el('np-like');
    if (npLike) {
        const audioPlayer = document.getElementById('audio-player');
        const isLiked = likedSongs.some(s => s.src === audioPlayer?.src);
        npLike.textContent = isLiked ? 'â¤ï¸' : 'ðŸ¤';
    }
}

function syncNpPlayPause() {
    const audioPlayer = document.getElementById('audio-player');
    const npBtn = document.getElementById('np-play-pause');
    if (!npBtn || !audioPlayer) return;
    npBtn.innerHTML = audioPlayer.paused
        ? '<i class="bi bi-play-fill"></i>'
        : '<i class="bi bi-pause-fill"></i>';
}

function syncNpProgress() {
    const audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer) return;
    const npProg = document.getElementById('np-progress-bar');
    const npCur = document.getElementById('np-current-time');
    const npTot = document.getElementById('np-total-duration');

    function fmt(s) {
        const m = Math.floor(s / 60), sec = Math.floor(s % 60);
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    }
    function update() {
        if (!audioPlayer.duration || isNaN(audioPlayer.duration)) return;
        if (npProg) npProg.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        if (npCur) npCur.textContent = fmt(audioPlayer.currentTime);
        if (npTot) npTot.textContent = fmt(audioPlayer.duration);
    }
    audioPlayer.addEventListener('timeupdate', update);
    audioPlayer.addEventListener('loadedmetadata', update);
    update();
}

// Progress bar np â†’ scrub audio
document.addEventListener('DOMContentLoaded', () => {
    const npProg = document.getElementById('np-progress-bar');
    const audioPlayer = document.getElementById('audio-player');
    if (npProg && audioPlayer) {
        npProg.addEventListener('input', () => {
            if (!isNaN(audioPlayer.duration)) {
                audioPlayer.currentTime = (npProg.value / 100) * audioPlayer.duration;
            }
        });
    }
    // Play/pause NP
    const npPlay = document.getElementById('np-play-pause');
    if (npPlay) {
        npPlay.addEventListener('click', () => {
            document.getElementById('play-pause')?.click();
            setTimeout(syncNpPlayPause, 50);
        });
    }
    // Prev/Next NP
    document.getElementById('np-prev')?.addEventListener('click', () => document.getElementById('prev-song')?.click());
    document.getElementById('np-next')?.addEventListener('click', () => document.getElementById('next-song')?.click());
    // Like NP
    document.getElementById('np-like')?.addEventListener('click', () => {
        document.getElementById('like-button')?.click();
        setTimeout(() => {
            const audioPlayer = document.getElementById('audio-player');
            const npLike = document.getElementById('np-like');
            if (npLike) npLike.textContent = likedSongs.some(s => s.src === audioPlayer?.src) ? 'â¤ï¸' : 'ðŸ¤';
        }, 50);
    });
    // Artista cliccabile nel modal
    document.getElementById('nowplaying-artist-name')?.addEventListener('click', () => {
        closeNowPlayingModal();
        setTimeout(() => openArtistPanel(currentArtist), 300);
    });
    // Sincronizza isPlaying â†’ np-btn
    const audioEl = document.getElementById('audio-player');
    if (audioEl) {
        audioEl.addEventListener('play', syncNpPlayPause);
        audioEl.addEventListener('pause', syncNpPlayPause);
    }
    // Apri/chiudi modal
    document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('nowplaying-modal');
        if (modal.classList.contains('open')) closeNowPlayingModal();
        else openNowPlayingModal();
    });
    document.getElementById('nowplaying-close')?.addEventListener('click', closeNowPlayingModal);
    // ESC chiude modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('nowplaying-modal')?.classList.contains('open')) {
            closeNowPlayingModal();
        }
    });
});

// ================================================================
// === NUOVE FEATURE: AUDIO VISUALIZER ===
// ================================================================
let audioCtx = null;
let analyser = null;
let audioSourceNode = null;

function initAudioContext() {
    if (audioCtx) return;
    const audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        audioSourceNode = audioCtx.createMediaElementSource(audioPlayer);
        audioSourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);
    } catch(e) {
        console.warn('AudioContext non disponibile:', e);
    }
}

function startNpVisualizer() {
    const canvas = document.getElementById('nowplaying-visualizer');
    if (!canvas) return;
    // Init AudioContext al primo avvio (richiede interazione utente)
    if (!audioCtx) initAudioContext();
    if (!analyser) {
        // Fallback: barre animate finte se AudioContext non Ã¨ disponibile
        drawFakeVisualizer(canvas);
        return;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        npVisualizerRAF = requestAnimationFrame(draw);
        const modal = document.getElementById('nowplaying-modal');
        if (!modal || !modal.classList.contains('open')) return;
        analyser.getByteFrequencyData(dataArray);
        const W = canvas.offsetWidth || 360;
        const H = canvas.offsetHeight || 70;
        canvas.width = W;
        canvas.height = H;
        ctx.clearRect(0, 0, W, H);
        const barCount = 48;
        const barW = W / barCount - 2;
        for (let i = 0; i < barCount; i++) {
            const val = dataArray[Math.floor(i * bufferLength / barCount)];
            const barH = (val / 255) * H;
            const hue = 200 + (val / 255) * 40;
            const gradient = ctx.createLinearGradient(0, H, 0, H - barH);
            gradient.addColorStop(0, `hsla(${hue}, 80%, 45%, 0.9)`);
            gradient.addColorStop(1, `hsla(${hue + 20}, 90%, 70%, 0.6)`);
            ctx.fillStyle = gradient;
            const x = i * (barW + 2);
            ctx.beginPath();
            ctx.roundRect(x, H - barH, barW, barH, [3, 3, 0, 0]);
            ctx.fill();
        }
    }
    draw();
}

function drawFakeVisualizer(canvas) {
    const ctx = canvas.getContext('2d');
    let phase = 0;
    function draw() {
        npVisualizerRAF = requestAnimationFrame(draw);
        const modal = document.getElementById('nowplaying-modal');
        if (!modal || !modal.classList.contains('open')) return;
        const W = canvas.offsetWidth || 360;
        const H = canvas.offsetHeight || 70;
        canvas.width = W; canvas.height = H;
        ctx.clearRect(0, 0, W, H);
        const barCount = 48;
        const barW = W / barCount - 2;
        const audioEl = document.getElementById('audio-player');
        const playing = audioEl && !audioEl.paused;
        if (playing) phase += 0.08;
        for (let i = 0; i < barCount; i++) {
            const barH = playing
                ? (Math.sin(i * 0.4 + phase) * 0.5 + 0.5) * H * 0.7 + H * 0.05
                : H * 0.05;
            const hue = 200 + (barH / H) * 40;
            const gradient = ctx.createLinearGradient(0, H, 0, H - barH);
            gradient.addColorStop(0, `hsla(${hue}, 80%, 45%, 0.8)`);
            gradient.addColorStop(1, `hsla(${hue + 20}, 90%, 70%, 0.5)`);
            ctx.fillStyle = gradient;
            const x = i * (barW + 2);
            ctx.beginPath();
            ctx.roundRect(x, H - barH, barW, barH, [3, 3, 0, 0]);
            ctx.fill();
        }
    }
    draw();
}

// ================================================================
// === NUOVE FEATURE: TESTI NEL MODAL NP â€” SYNC AVANZATO ===
// ================================================================
let npHighlightedLine = -1;
let npLyricsLinesArr = [];
let npTimePL = 0;
let npSyncOffsetManual = 0;   // offset manuale in secondi (Â±)
let npIntroFraction = 0.06;   // stima frazione intro (6% della durata)

async function loadNpLyrics() {
    const npLyricsContent = document.getElementById('np-lyrics-content');
    const npLyricsLoading  = document.getElementById('np-lyrics-loading');
    const npLyricsNotFound = document.getElementById('np-lyrics-notfound');
    if (!npLyricsContent) return;

    // Reset UI
    if (npLyricsLoading)  npLyricsLoading.style.display  = 'flex';
    npLyricsContent.style.display  = 'none';
    npLyricsContent.innerHTML = '';
    if (npLyricsNotFound) npLyricsNotFound.style.display = 'none';
    npHighlightedLine  = -1;
    npLyricsLinesArr   = [];
    npTimePL           = 0;
    npSyncOffsetManual = 0;
    updateNpSyncLabel();

    if (!currentAlbumNames[currentSongIndex]) { showNpLyricsNotFound(); return; }
    const songName = currentAlbumNames[currentSongIndex];
    const parts    = songName.split(' - ');
    let artist = '', title = '';
    if (parts.length >= 2) {
        title  = parts[0].trim();
        artist = parts[1].replace(/\s*\(.*?\).*$/, '').trim();
    } else {
        artist = currentArtist;
        title  = songName.trim();
    }
    if (!artist || !title) { showNpLyricsNotFound(); return; }

    try {
        const lyrics = await getLyrics(artist, title);
        if (lyrics === 'not_found') { showNpLyricsNotFound(); return; }

        // Filtra righe vuote ma conserva le pause (riga vuota = strofa)
        const rawLines = lyrics.split('<br>');
        const lines = rawLines.filter(l => l.trim() !== '');
        npLyricsLinesArr = lines;

        npLyricsContent.innerHTML = lines.map((line, i) =>
            `<span class="np-lyric-line" data-line="${i}">${line.trim()}</span>`
        ).join('');

        if (npLyricsLoading)  npLyricsLoading.style.display  = 'none';
        if (npLyricsNotFound) npLyricsNotFound.style.display = 'none';
        npLyricsContent.style.display = 'flex';

        setupNpLyricsSync();
    } catch(e) {
        showNpLyricsNotFound();
    }
}

function showNpLyricsNotFound() {
    const npLyricsLoading  = document.getElementById('np-lyrics-loading');
    const npLyricsContent  = document.getElementById('np-lyrics-content');
    const npLyricsNotFound = document.getElementById('np-lyrics-notfound');
    if (npLyricsLoading)  npLyricsLoading.style.display  = 'none';
    if (npLyricsContent)  npLyricsContent.style.display   = 'none';
    if (npLyricsNotFound) npLyricsNotFound.style.display  = 'flex';
}

// --- Algoritmo di sync avanzato (riusa calculateAdaptiveSync esistente) ---
function setupNpLyricsSync() {
    const audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer || npLyricsLinesArr.length === 0) return;

    function calcSync() {
        if (audioPlayer.duration <= 0) return;
        // Analisi struttura (riusa funzioni giÃ  presenti)
        const analysis = analyzeLyricsStructure(npLyricsLinesArr);
        // Calcola tempo medio per riga con correzione adattiva
        const contentLines = Math.max(npLyricsLinesArr.length - analysis.emptyLines, 1);
        let base = audioPlayer.duration / contentLines;
        if (analysis.shortLines   > npLyricsLinesArr.length * 0.3)  base *= 0.9;
        if (analysis.repetitions  > npLyricsLinesArr.length * 0.2)  base *= 0.95;
        if (analysis.longLines    > npLyricsLinesArr.length * 0.2)  base *= 1.1;
        npTimePL = base;
        // Stima intro: tipicamente 5â€“8% della durata
        npIntroFraction = analysis.shortLines > npLyricsLinesArr.length * 0.4 ? 0.04 : 0.06;
    }

    if (audioPlayer.readyState >= 1) calcSync();
    else audioPlayer.addEventListener('loadedmetadata', calcSync);

    audioPlayer.removeEventListener('timeupdate', updateNpLyricsHighlight);
    audioPlayer.addEventListener('timeupdate', updateNpLyricsHighlight);
}

function updateNpSyncLabel() {
    const lbl = document.getElementById('np-sync-offset-label');
    if (lbl) lbl.textContent = (npSyncOffsetManual >= 0 ? '+' : '') + npSyncOffsetManual.toFixed(1) + 's';
}

function updateNpLyricsHighlight() {
    const modal = document.getElementById('nowplaying-modal');
    if (!modal || !modal.classList.contains('open')) return;
    const audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer || !npTimePL || npLyricsLinesArr.length === 0) return;

    const dur = audioPlayer.duration;
    if (!dur || isNaN(dur)) return;

    // Scarta l'intro stimata + applica offset manuale
    const introSeconds = dur * npIntroFraction;
    const ct = Math.max(0, audioPlayer.currentTime - introSeconds + npSyncOffsetManual);
    const progress = audioPlayer.currentTime / dur;

    // Indice base
    let lineIndex = Math.floor(ct / npTimePL);

    // Correzione progressiva: inizio lento, metÃ  veloce, fine lento
    if (progress < 0.15)      lineIndex = Math.floor(lineIndex * 0.88);
    else if (progress < 0.85) lineIndex = Math.floor(lineIndex * 1.04);
    else                       lineIndex = Math.floor(lineIndex * 0.96);

    // Limita salti bruschi (max 2 righe alla volta)
    if (npHighlightedLine >= 0 && Math.abs(lineIndex - npHighlightedLine) > 2) {
        lineIndex = npHighlightedLine + (lineIndex > npHighlightedLine ? 1 : -1);
    }

    lineIndex = Math.max(0, Math.min(lineIndex, npLyricsLinesArr.length - 1));
    if (lineIndex === npHighlightedLine) return;

    const npLyricsContent = document.getElementById('np-lyrics-content');
    if (!npLyricsContent) return;

    // Rimuovi vecchio highlight
    const prev = npLyricsContent.querySelector('.np-highlight');
    if (prev) prev.classList.remove('np-highlight');

    // Aggiungi nuovo highlight
    const curr = npLyricsContent.querySelector(`[data-line="${lineIndex}"]`);
    if (curr) {
        curr.classList.add('np-highlight');
        curr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    npHighlightedLine = lineIndex;
}

// Controlli sync manuali
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('np-sync-plus')?.addEventListener('click', () => {
        npSyncOffsetManual = parseFloat((npSyncOffsetManual + 0.5).toFixed(1));
        updateNpSyncLabel();
    });
    document.getElementById('np-sync-minus')?.addEventListener('click', () => {
        npSyncOffsetManual = parseFloat((npSyncOffsetManual - 0.5).toFixed(1));
        updateNpSyncLabel();
    });
    document.getElementById('np-sync-reset')?.addEventListener('click', () => {
        npSyncOffsetManual = 0;
        updateNpSyncLabel();
    });
});


// ================================================================
// === NUOVE FEATURE: PANNELLO ARTISTA ===
// ================================================================
function openArtistPanel(artistName) {
    if (!artistName) return;
    const panel = document.getElementById('artist-panel');
    const overlay = document.getElementById('artist-panel-overlay');
    if (!panel) return;
    // Header
    document.getElementById('artist-panel-name').textContent = artistName;
    const initial = artistName.charAt(0).toUpperCase();
    document.getElementById('artist-panel-avatar').textContent = initial;
    // Filtra album di questo artista
    const albumCards = document.querySelectorAll('.album-card');
    const artistAlbums = [];
    albumCards.forEach(card => {
        if (card.dataset.artist?.toLowerCase() === artistName.toLowerCase()) {
            const btn = card.querySelector('.listen-now');
            artistAlbums.push({
                title: card.querySelector('h3')?.textContent.trim() || '',
                cover: card.querySelector('img')?.src || '',
                year: card.dataset.year || '',
                element: card
            });
        }
    });
    document.getElementById('artist-panel-albums-count').textContent =
        `${artistAlbums.length} album su Minerify`;
    // Render albums
    const albumsList = document.getElementById('artist-panel-albums');
    albumsList.innerHTML = '';
    if (artistAlbums.length === 0) {
        albumsList.innerHTML = '<p style="text-align:center;color:#444;padding:40px 20px;">Nessun album trovato</p>';
    } else {
        artistAlbums.forEach(album => {
            const card = document.createElement('div');
            card.className = 'artist-album-card';
            card.innerHTML = `
                <img src="${album.cover}" alt="${album.title}" class="artist-album-cover">
                <div class="artist-album-info">
                    <p class="artist-album-title">${album.title}</p>
                    <p class="artist-album-year">${album.year}</p>
                </div>
                <button class="artist-album-play"><i class="bi bi-play-fill"></i></button>
            `;
            card.querySelector('.artist-album-play').addEventListener('click', (e) => {
                e.stopPropagation();
                album.element.querySelector('.listen-now')?.click();
                closeArtistPanel();
            });
            card.addEventListener('click', () => {
                album.element.querySelector('.listen-now')?.click();
                closeArtistPanel();
            });
            albumsList.appendChild(card);
        });
    }
    panel.classList.add('open');
    if (overlay) { overlay.classList.add('active'); }
}

function closeArtistPanel() {
    document.getElementById('artist-panel')?.classList.remove('open');
    document.getElementById('artist-panel-overlay')?.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('artist-panel-close')?.addEventListener('click', closeArtistPanel);
    document.getElementById('artist-panel-overlay')?.addEventListener('click', closeArtistPanel);
    // Rendi current-artist cliccabile
    const artistEl = document.getElementById('current-artist');
    if (artistEl) {
        artistEl.style.cursor = 'pointer';
        artistEl.title = 'Vedi artista';
        artistEl.addEventListener('click', () => {
            if (currentArtist) openArtistPanel(currentArtist);
        });
    }
});

// ================================================================
// === NUOVE FEATURE: PLAYLIST PICKER (sostituisce alert) ===
// ================================================================
function getPlaylists() {
    return JSON.parse(localStorage.getItem('minerifyPlaylists')) || {};
}
function savePlaylists(playlists) {
    localStorage.setItem('minerifyPlaylists', JSON.stringify(playlists));
}

function openPlaylistPicker() {
    const audioPlayer = document.getElementById('audio-player');
    const currentSongEl = document.getElementById('current-song');
    if (!audioPlayer?.src || currentSongEl?.textContent === 'Nessuna canzone in riproduzione') return;

    const normalizedSrc = normalizeAudioSrc(audioPlayer.src);
    const songData = allSongsData.find(s => normalizeAudioSrc(s.src) === normalizedSrc);
    if (!songData) return;

    // Song info preview
    const rawName = songData.name || '';
    const songTitle = rawName.includes(' - ') ? rawName.split(' - ')[0].trim() : rawName;
    const songInfoEl = document.getElementById('playlist-picker-song-info');
    if (songInfoEl) {
        songInfoEl.innerHTML = `
            <img src="${songData.cover || ''}" alt="cover">
            <div>
                <p class="pps-title">${songTitle}</p>
                <p class="pps-artist">${songData.artist || 'â€”'}</p>
            </div>
        `;
    }
    // Render playlist list
    renderPlaylistList(songData, normalizedSrc);
    // Apri modal
    document.getElementById('playlist-picker-modal')?.classList.add('open');
    document.getElementById('playlist-picker-backdrop')?.classList.add('active');
    document.getElementById('new-playlist-name').value = '';
}

function renderPlaylistList(songData, normalizedSrc) {
    const playlists = getPlaylists();
    const list = document.getElementById('playlist-picker-list');
    if (!list) return;
    const keys = Object.keys(playlists);
    if (keys.length === 0) {
        list.innerHTML = '<p class="playlist-picker-empty">Nessuna playlist â€” creane una qui sotto!</p>';
        return;
    }
    list.innerHTML = '';
    keys.forEach(name => {
        const songs = playlists[name] || [];
        const alreadyIn = songs.some(s => normalizeAudioSrc(s.src) === normalizedSrc);
        const row = document.createElement('div');
        row.className = `playlist-item-row${alreadyIn ? ' already-in' : ''}`;
        row.innerHTML = `
            <div class="playlist-item-info">
                <p class="playlist-item-name">${name}</p>
                <p class="playlist-item-count">${songs.length} brani</p>
            </div>
            <button class="playlist-item-add-btn">${alreadyIn ? 'âœ“ Aggiunta' : '+ Aggiungi'}</button>
        `;
        if (!alreadyIn) {
            row.querySelector('.playlist-item-add-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                addSongToNamedPlaylist(name, songData);
                closePlaylistPicker();
                flashAddToPlaylistBtn();
            });
            row.addEventListener('click', () => {
                addSongToNamedPlaylist(name, songData);
                closePlaylistPicker();
                flashAddToPlaylistBtn();
            });
        }
        list.appendChild(row);
    });
}

function addSongToNamedPlaylist(playlistName, songData) {
    const playlists = getPlaylists();
    if (!playlists[playlistName]) playlists[playlistName] = [];
    const normalizedSrc = normalizeAudioSrc(songData.src);
    if (!playlists[playlistName].some(s => normalizeAudioSrc(s.src) === normalizedSrc)) {
        playlists[playlistName].push({
            src: songData.src,
            name: songData.name,
            artist: songData.artist,
            albumName: songData.albumName,
            cover: songData.cover,
            duration: trackDurations[songData.src] || 0
        });
        savePlaylists(playlists);
    }
}

function closePlaylistPicker() {
    document.getElementById('playlist-picker-modal')?.classList.remove('open');
    document.getElementById('playlist-picker-backdrop')?.classList.remove('active');
}

function flashAddToPlaylistBtn() {
    const btn = document.getElementById('add-to-playlist-button');
    if (!btn) return;
    btn.classList.add('added');
    setTimeout(() => btn.classList.remove('added'), 500);
}

document.addEventListener('DOMContentLoaded', () => {
    // Sostituisci il comportamento del bottone + playlist
    const addBtn = document.getElementById('add-to-playlist-button');
    if (addBtn) {
        // Rimuovi vecchio listener clonando il nodo
        const newBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newBtn, addBtn);
        newBtn.addEventListener('click', openPlaylistPicker);
    }
    // Chiudi picker
    document.getElementById('playlist-picker-close')?.addEventListener('click', closePlaylistPicker);
    document.getElementById('playlist-picker-backdrop')?.addEventListener('click', closePlaylistPicker);
    // Crea nuova playlist
    document.getElementById('create-playlist-btn')?.addEventListener('click', () => {
        const input = document.getElementById('new-playlist-name');
        const name = input?.value.trim();
        if (!name) { input?.focus(); return; }
        const playlists = getPlaylists();
        if (!playlists[name]) { playlists[name] = []; savePlaylists(playlists); }
        // Poi aggiungi la canzone corrente se non giÃ  in lista
        const audioPlayer = document.getElementById('audio-player');
        const normalizedSrc = normalizeAudioSrc(audioPlayer?.src || '');
        const songData = allSongsData.find(s => normalizeAudioSrc(s.src) === normalizedSrc);
        if (songData) addSongToNamedPlaylist(name, songData);
        closePlaylistPicker();
        flashAddToPlaylistBtn();
    });
    // Invio con Enter
    document.getElementById('new-playlist-name')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('create-playlist-btn')?.click();
    });
});

// ================================================================
// === NUOVE UI FEATURE: ALBUM CARD IN RIPRODUZIONE ===
// ================================================================
function updateNowPlayingAlbumCard(songData) {
    // Rimuovi classe da tutte le card
    document.querySelectorAll('.album-card.now-playing').forEach(c => {
        c.classList.remove('now-playing');
        c.querySelector('.album-now-playing-badge')?.remove();
        const quickBtn = c.querySelector('.album-quick-btn i');
        if (quickBtn) quickBtn.className = 'bi bi-play-fill';
    });
    if (!songData?.cover) return;
    // Trova la card il cui img.src corrisponde alla copertina corrente
    document.querySelectorAll('.album-card').forEach(card => {
        const img = card.querySelector('img');
        if (!img) return;
        // Confronta la parte finale del src (il filename)
        const cardCover = img.src.split('/').pop();
        const songCover = (songData.cover || '').split('/').pop();
        if (cardCover && songCover && cardCover === songCover) {
            card.classList.add('now-playing');
            // Aggiungi badge mini equalizer se non esiste
            if (!card.querySelector('.album-now-playing-badge')) {
                const badge = document.createElement('div');
                badge.className = 'album-now-playing-badge';
                badge.innerHTML = `<div class="mini-eq"><span></span><span></span><span></span><span></span></div> In riproduzione`;
                card.appendChild(badge);
            }
            // Icona play â†’ pause sulla card
            const quickBtn = card.querySelector('.album-quick-btn i');
            if (quickBtn) quickBtn.className = 'bi bi-pause-fill';
            // Scrolla la card in vista (smooth)
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

// ================================================================
// === NUOVE UI FEATURE: QUICK PLAY OVERLAY INIT ===
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Popola il conteggio tracce e collega il pulsante quick-play
    document.querySelectorAll('.album-card').forEach(card => {
        const listenBtn = card.querySelector('.listen-now');
        const quickBtn  = card.querySelector('.album-quick-btn');
        const tracksBadge = card.querySelector('.album-quick-tracks');
        if (!listenBtn) return;
        // Conta le tracce dal data-src
        const srcs = (listenBtn.dataset.src || '').split(',').filter(Boolean);
        if (tracksBadge) tracksBadge.textContent = `${srcs.length} brani`;
        // Click sul quick-play btn â†’ triggera listen-now
        if (quickBtn) {
            quickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Se questa card Ã¨ giÃ  in riproduzione â†’ toggle play/pause
                if (card.classList.contains('now-playing')) {
                    document.getElementById('play-pause')?.click();
                } else {
                    listenBtn.click();
                }
            });
        }
    });
});

// ================================================================
// === NUOVE UI FEATURE: FILTRO ARTISTI ===
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    const filterBar = document.getElementById('artist-filter-bar');
    if (!filterBar) return;

    // Raccogli artisti unici dalle card
    const artists = new Set();
    document.querySelectorAll('.album-card[data-artist]').forEach(c => {
        artists.add(c.dataset.artist.trim());
    });

    // Funzione helper per ottenere l'iniziale
    const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';

    // Crea la pillola "Tutti"
    const allPill = document.createElement('button');
    allPill.className = 'artist-pill active';
    allPill.dataset.artist = 'all';
    allPill.innerHTML = `
        <div class="artist-pill-avatar" style="background: linear-gradient(135deg, #333, #555);">
            <i class="bi bi-grid-fill" style="font-size: 0.8em;"></i>
        </div>
        <span>Tutti</span>
    `;
    filterBar.innerHTML = ''; // Resetta il default
    filterBar.appendChild(allPill);

    // Colori casuali per i gradienti degli avatar
    const gradients = [
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)',
        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
        'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
        'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    ];

    // Crea una pill per ogni artista
    [...artists].sort().forEach((artist, index) => {
        const pill = document.createElement('button');
        pill.className = 'artist-pill';
        pill.dataset.artist = artist;
        const grad = gradients[index % gradients.length];
        const safeName = artist.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const imgSrc = `../images/artists/${safeName}.jpg`;
        
        pill.innerHTML = `
            <div class="artist-pill-avatar" style="background: transparent;">
                <img src="${imgSrc}" alt="${artist}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" 
                     onerror="this.onerror=null; this.parentNode.style.background='${grad}'; this.parentNode.innerHTML='<span class=\\'initial\\'>${getInitial(artist)}</span>';">
            </div>
            <span>${artist}</span>
        `;
        filterBar.appendChild(pill);
    });


    // Click handler
    filterBar.addEventListener('click', (e) => {
        const pill = e.target.closest('.artist-pill');
        if (!pill) return;
        const selected = pill.dataset.artist;

        // Aggiorna active
        filterBar.querySelectorAll('.artist-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        // Filtra le card
        document.querySelectorAll('.album-card').forEach(card => {
            if (selected === 'all' || card.dataset.artist?.trim() === selected) {
                card.classList.remove('filtered-out');
                card.style.animation = 'fadeInCard 0.3s ease';
            } else {
                card.classList.add('filtered-out');
            }
        });
    });
});

// ================================================================
// === NUOVE UI FEATURE: ASCOLTATI DI RECENTE ===
// ================================================================
const MAX_RECENT = 12;

function getRecentlyPlayed() {
    return JSON.parse(localStorage.getItem('minerifyRecent')) || [];
}
function saveRecentlyPlayed(arr) {
    localStorage.setItem('minerifyRecent', JSON.stringify(arr));
}

function addToRecentlyPlayed(songData) {
    if (!songData?.src) return;
    let recent = getRecentlyPlayed();
    // Rimuovi duplicati
    recent = recent.filter(r => normalizeAudioSrc(r.src) !== normalizeAudioSrc(songData.src));
    // Aggiungi in testa
    recent.unshift({
        src:    songData.src,
        name:   songData.name || '',
        artist: songData.artist || '',
        cover:  songData.cover || '',
        albumName: songData.albumName || ''
    });
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    saveRecentlyPlayed(recent);
    renderRecentlyPlayed();
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
        el.className = `user-menu-recent-item`;
        el.innerHTML = `
            <img src="${item.cover}" alt="${title}" loading="lazy">
            <div class="user-menu-recent-info">
                <span class="user-menu-recent-title">${title}</span>
                <span class="user-menu-recent-artist">${item.artist || ''}</span>
            </div>
        `;
        el.addEventListener('click', () => {
            const songData = allSongsData.find(s => normalizeAudioSrc(s.src) === normalizeAudioSrc(item.src));
            if (songData) playSong(songData);
        });
        strip.appendChild(el);
    });
}



// ================================================================
// === NUOVE UI FEATURE: PULSANTE MUTE ===
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    const muteBtn     = document.getElementById('mute-btn');
    const volumeCtrl  = document.getElementById('volume-control');
    const audioPlayer = document.getElementById('audio-player');
    if (!muteBtn || !volumeCtrl || !audioPlayer) return;

    let lastVolume = volumeCtrl.value || 50;
    let isMuted    = false;

    muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        if (isMuted) {
            lastVolume = audioPlayer.volume * 100;
            audioPlayer.volume = 0;
            volumeCtrl.value   = 0;
            muteBtn.classList.add('muted');
            muteBtn.innerHTML  = '<i class="bi bi-volume-mute-fill"></i>';
        } else {
            audioPlayer.volume = lastVolume / 100;
            volumeCtrl.value   = lastVolume;
            muteBtn.classList.remove('muted');
            updateMuteIcon(lastVolume);
        }
    });

    // Aggiorna icona al cambio volume
    volumeCtrl.addEventListener('input', () => {
        const vol = parseInt(volumeCtrl.value);
        if (isMuted && vol > 0) {
            isMuted = false;
            muteBtn.classList.remove('muted');
        }
        updateMuteIcon(vol);
        lastVolume = vol;
    });

    function updateMuteIcon(vol) {
        if (vol == 0) {
            muteBtn.innerHTML = '<i class="bi bi-volume-mute-fill"></i>';
        } else if (vol < 40) {
            muteBtn.innerHTML = '<i class="bi bi-volume-down-fill"></i>';
        } else {
            muteBtn.innerHTML = '<i class="bi bi-volume-up-fill"></i>';
        }
    }
});
