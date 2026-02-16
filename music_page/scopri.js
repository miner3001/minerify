// === SISTEMA DI LOGGING AVANZATO ===

const LOG_CONFIG = {
    enabled: true,
    showTimestamp: true,
    showEventType: true,
    logToConsole: true,
    logToScreen: false
};

const EVENT_TYPES = {
    AUDIO: '🎵',
    UI: '🖱️',
    API: '🌐',
    LYRICS: '📝',
    PLAYER: '⏯️',
    SEARCH: '🔍',
    ERROR: '❌',
    SUCCESS: '✅',
    INFO: 'ℹ️'
};

function logEvent(eventType, message, data = null) {
    if (!LOG_CONFIG.enabled) return;
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const icon = EVENT_TYPES[eventType] || 'ℹ️';
    const logMessage = `${icon} [${timestamp}] ${message}`;
    if (LOG_CONFIG.logToConsole) {
        data ? console.log(logMessage, data) : console.log(logMessage);
    }
    if (LOG_CONFIG.logToScreen) {
        displayLogOnScreen(logMessage, eventType);
    }
}

function displayLogOnScreen(message, eventType) {
    let logContainer = document.getElementById('debug-log');
    if (!logContainer) {
        logContainer = document.createElement('div');
        logContainer.id = 'debug-log';
        logContainer.style.cssText = `
            position: fixed; top: 10px; right: 10px; width: 300px;
            max-height: 400px; background: rgba(0,0,0,0.8); color: white;
            font-family: monospace; font-size: 10px; padding: 10px;
            border-radius: 5px; overflow-y: auto; z-index: 20000; border: 1px solid #333;
        `;
        document.body.appendChild(logContainer);
    }
    const logEntry = document.createElement('div');
    logEntry.textContent = message;
    logEntry.style.marginBottom = '2px';
    logEntry.style.color = eventType === 'ERROR' ? '#ff6b6b' :
                           eventType === 'SUCCESS' ? '#51cf66' :
                           eventType === 'API' ? '#74c0fc' : '#fff';
    logContainer.appendChild(logEntry);
    while (logContainer.children.length > 20) logContainer.removeChild(logContainer.firstChild);
    logContainer.scrollTop = logContainer.scrollHeight;
}

"use strict";

// === STATO GLOBALE ===
let isPlaying = false;
let isShuffle = false;
let isLoop = false;
let currentSongIndex = 0;
let currentAlbumSongs = [];
let currentAlbumNames = [];
let currentAlbumCoverSrc = '';
let currentArtist = '';
let likedSongs = JSON.parse(localStorage.getItem('likedSongs')) || [];
let allSongsData = [];             // Unica fonte di verità per tutte le canzoni
let shuffleHistory = [];
let isNavigatingBack = false;      // FIX #5: flag per evitare push doppio nello shuffle history
const MAX_SHUFFLE_HISTORY = 20;

// FIX #2: trackDurations dichiarato prima di qualsiasi uso
let trackDurations = {};

// === CARICAMENTO DURATE ===
async function loadTrackDurations() {
    try {
        const resp = await fetch('durations.json');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        trackDurations = await resp.json();
        logEvent('SUCCESS', 'Mappa durate caricata da JSON', { entries: Object.keys(trackDurations).length });
    } catch (err) {
        logEvent('ERROR', 'Impossibile caricare durations.json, fallback a mappa vuota', { error: err.message });
        trackDurations = {};
    }
}

// === INIZIALIZZAZIONE CANZONI ===
// FIX #4: unica funzione che popola allSongsData — il blocco globale duplicato è stato rimosso
function initializeAllSongsData() {
    logEvent('INFO', 'Inizializzazione dati canzoni...');
    allSongsData = [];
    const albumCards = document.querySelectorAll('.album-card');
    albumCards.forEach((album, albumIdx) => {
        const listenNowButton = album.querySelector('.listen-now');
        if (!listenNowButton) return;
        const songSources = listenNowButton.getAttribute('data-src')?.split(',') || [];
        const songNames   = listenNowButton.getAttribute('data-names')?.split(',') || [];
        const albumTitle  = album.querySelector('h3')?.textContent || '';
        const artist      = album.dataset.artist || '';
        const cover       = album.querySelector('img')?.src || '';

        songSources.forEach((src, songIdx) => {
            allSongsData.push({
                src: src.trim(),
                name: songNames[songIdx] ? songNames[songIdx].trim() : '',
                albumName: albumTitle,
                artist,
                cover,
                originalAlbumIndex: albumIdx,          // necessario per setCurrentAlbumContextFromSong
                originalSongIndexInAlbum: songIdx,     // necessario per setCurrentAlbumContextFromSong
                duration: trackDurations[src.trim()] || 0
            });
        });
    });
    localStorage.setItem('allSongsDataStore', JSON.stringify(allSongsData));
    logEvent('SUCCESS', `Caricate ${allSongsData.length} canzoni da ${albumCards.length} album`);
}

// === DOM READY ===
document.addEventListener('DOMContentLoaded', async function () {
    logEvent('INFO', '=== MINERIFY MUSIC PLAYER AVVIATO ===');

    // FIX #2: carica le durate PRIMA di inizializzare allSongsData
    await loadTrackDurations();

    // Elementi DOM
    const playPauseButton    = document.getElementById('play-pause');
    const prevSongButton     = document.getElementById('prev-song');
    const nextSongButton     = document.getElementById('next-song');
    const shuffleButton      = document.getElementById('shuffle');
    const loopButton         = document.getElementById('loop');
    const progressBar        = document.getElementById('progress-bar');
    const volumeControl      = document.getElementById('volume-control');
    const currentSongEl      = document.getElementById('current-song');
    const currentAlbumCover  = document.getElementById('current-album-cover');
    const currentTime        = document.getElementById('current-time');
    const totalDuration      = document.getElementById('total-duration');
    const likeButton         = document.getElementById('like-button');
    const audioPlayer        = document.getElementById('audio-player');
    const listenNowButtons   = document.querySelectorAll('.listen-now');

    logEvent('SUCCESS', 'Elementi DOM trovati', {
        playPauseButton: !!playPauseButton,
        audioPlayer: !!audioPlayer,
        listenNowButtons: listenNowButtons.length
    });

    initializeAllSongsData();
    initializeMediaSession();

    // --- Preferiti ---
    function saveFavorites() {
        localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
    }

    function updateLikeButton() {
        const isLiked = likedSongs.some(s => s.src === audioPlayer.src);
        likeButton.textContent = isLiked ? '❤️' : '🤍';
    }

    function savePlayerState() {
        const playerState = {
            src: audioPlayer.src,
            currentTime: audioPlayer.currentTime,
            isPlaying: isPlaying,
            songName: currentSongEl.textContent,
            albumCover: currentAlbumCover.src,
            currentArtist: currentArtist,
            currentAlbumSongs: currentAlbumSongs,
            currentAlbumNames: currentAlbumNames,
            currentAlbumCoverSrc: currentAlbumCoverSrc,
            currentSongIndex: currentSongIndex,
            volume: audioPlayer.volume,
            isShuffle: isShuffle,
            isLoop: isLoop
        };
        localStorage.setItem('playerState', JSON.stringify(playerState));
        logEvent('INFO', 'Stato salvato', { song: currentSongEl.textContent });
    }

    function restorePlayerState() {
        try {
            const savedState = JSON.parse(localStorage.getItem('playerState'));
            if (!savedState) return;
            
            audioPlayer.src = savedState.src || '';
            audioPlayer.currentTime = savedState.currentTime || 0;
            audioPlayer.volume = savedState.volume || 1;
            currentSongEl.textContent = savedState.songName || 'Nessuna canzone in riproduzione';
            currentAlbumCover.src = savedState.albumCover || '';
            currentArtist = savedState.currentArtist || '';
            currentAlbumSongs = savedState.currentAlbumSongs || [];
            currentAlbumNames = savedState.currentAlbumNames || [];
            currentAlbumCoverSrc = savedState.currentAlbumCoverSrc || '';
            currentSongIndex = savedState.currentSongIndex || 0;
            isShuffle = savedState.isShuffle || false;
            isLoop = savedState.isLoop || false;

            logEvent('INFO', 'Stato ripristinato', { song: savedState.songName });

            if (savedState.isPlaying && audioPlayer.src) {
                audioPlayer.play()
                    .then(() => {
                        isPlaying = true;
                        playPauseButton.innerHTML = '<i class="bi bi-pause-fill"></i>';
                        logEvent('SUCCESS', 'Riproduzione ripristinata');
                    })
                    .catch(() => {
                        isPlaying = false;
                        playPauseButton.innerHTML = '<i class="bi bi-play-fill"></i>';
                        logEvent('INFO', 'Autoplay bloccato dal browser');
                    });
            }
            
            updateLikeButton();
            updatePlaylistButton();
            updateShuffleLoopButtons();
        } catch (error) {
            logEvent('ERROR', 'Errore ripristino stato', error);
        }
    }

    // --- Barra progresso ---
    function updateProgressBar() {
        if (!audioPlayer.duration || isNaN(audioPlayer.duration)) return;
        const cm = Math.floor(audioPlayer.currentTime / 60);
        const cs = Math.floor(audioPlayer.currentTime % 60);
        const dm = Math.floor(audioPlayer.duration / 60);
        const ds = Math.floor(audioPlayer.duration % 60);
        if (currentTime)    currentTime.textContent    = `${cm}:${cs < 10 ? '0' : ''}${cs}`;
        if (totalDuration)  totalDuration.textContent  = `${dm}:${ds < 10 ? '0' : ''}${ds}`;
        if (progressBar)    progressBar.value          = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    }

    // --- Riproduzione ---
    function playSong(songData) {
        if (!songData) { logEvent('ERROR', 'playSong: nessun dato canzone'); return; }
        logEvent('PLAYER', `Riproduzione: ${songData.name}`, { artist: songData.artist, album: songData.albumName });

        setCurrentAlbumContextFromSong(songData);
        audioPlayer.src = songData.src;
        currentSongEl.textContent = songData.name;
        currentArtist = songData.artist || '';
        const artistEl = document.getElementById('current-artist');
        if (artistEl) artistEl.textContent = songData.artist;
        currentAlbumCover.src = songData.cover;
        document.getElementById('audio-loading').style.display = 'block';

        audioPlayer.play().then(() => {
            isPlaying = true;
            playPauseButton.innerHTML = '<i class="bi bi-pause-fill"></i>';

            // FIX #5: aggiungi allo shuffle history solo se non stiamo navigando indietro
            if (isShuffle && !isNavigatingBack) {
                shuffleHistory.push(songData.src);
                if (shuffleHistory.length > MAX_SHUFFLE_HISTORY) shuffleHistory.shift();
            }
            isNavigatingBack = false;

            updateLikeButton();
            updatePlaylistButton();
            savePlayerState();
            updateMediaSessionMetadata(songData);
            updateMediaSessionPlaybackState('playing');

            if (lyricsOverlay && lyricsOverlay.classList.contains('active')) showCurrentLyrics();
        }).catch(error => {
            isPlaying = false;
            playPauseButton.innerHTML = '<i class="bi bi-play-fill"></i>';
            updateMediaSessionPlaybackState('paused');
            logEvent('ERROR', 'Errore riproduzione', error);
        });

        audioPlayer.oncanplay = () => { document.getElementById('audio-loading').style.display = 'none'; };
        audioPlayer.onerror   = () => { document.getElementById('audio-loading').style.display = 'none'; };
    }

    // --- Album successivo ---
    function playNextAlbum() {
        const albumCards = document.querySelectorAll('.album-card');
        let currentAlbumCard = null;
        for (const card of albumCards) {
            if (card.querySelector('img')?.src === currentAlbumCoverSrc) { currentAlbumCard = card; break; }
        }
        if (!currentAlbumCard) return;
        const currentIndex = Array.from(albumCards).indexOf(currentAlbumCard);
        const nextAlbum = albumCards[(currentIndex + 1) % albumCards.length];
        if (!nextAlbum) return;
        const btn = nextAlbum.querySelector('.listen-now');
        if (!btn) return;
        currentAlbumSongs    = btn.getAttribute('data-src').split(',');
        currentAlbumNames    = btn.getAttribute('data-names').split(',');
        currentAlbumCoverSrc = nextAlbum.querySelector('img').src;
        currentSongIndex     = 0;
        const songObj = allSongsData.find(s => s.src === currentAlbumSongs[0].trim());
        if (songObj) playSong(songObj);
        savePlayerState();
    }

    // --- Dettagli album ---
    function showAlbumDetails(albumCard) {
        const albumCover  = albumCard.querySelector('img').src;
        const albumName   = albumCard.querySelector('h3').textContent;
        const btn         = albumCard.querySelector('.listen-now');
        const albumSongs  = btn.getAttribute('data-names').split(',');
        const albumSrcs   = btn.getAttribute('data-src').split(',');
        const albumYear   = albumCard.getAttribute('data-year') || 'Anno sconosciuto';
        const albumArtist = albumCard.getAttribute('data-artist') || 'Artista sconosciuto';

        const overlay  = document.getElementById('overlay');
        const songList = document.getElementById('song-list');
        overlay.querySelector('img').src         = albumCover;
        overlay.querySelector('h2').textContent   = albumName;
        overlay.querySelector('.album-year').textContent   = `Anno: ${albumYear}`;
        overlay.querySelector('.album-artist').textContent = `Artista: ${albumArtist}`;
        songList.innerHTML = '';

        albumSongs.forEach((song, index) => {
            const li  = document.createElement('li');
            li.classList.add('song-item');
            const src = albumSrcs[index]?.trim();
            let durationText = 'N/D';
            if (trackDurations[src]) {
                const min = Math.floor(trackDurations[src] / 60);
                const sec = trackDurations[src] % 60;
                durationText = `${min}:${sec < 10 ? '0' : ''}${sec}`;
            }
            li.innerHTML = `
                <span class="song-name">${index + 1}. ${song}</span>
                <span class="song-duration">${durationText}</span>
            `;
            li.addEventListener('click', () => {
                const songObj = allSongsData.find(s => s.src === src);
                if (songObj) { currentSongIndex = songObj.originalSongIndexInAlbum; playSong(songObj); }
            });
            songList.appendChild(li);
        });
        overlay.classList.add('visible');
    }

    // --- Listen now buttons ---
    listenNowButtons.forEach(button => {
        button.addEventListener('click', function () {
            if (!button.hasAttribute('data-src') && !button.hasAttribute('data-names')) {
                if (allSongsData.length > 0) {
                    const songObj = allSongsData[Math.floor(Math.random() * allSongsData.length)];
                    playSong(songObj);
                }
                return;
            }
            currentAlbumSongs    = button.getAttribute('data-src').split(',');
            currentAlbumNames    = button.getAttribute('data-names').split(',');
            const albumCard      = button.closest('.album-card');
            currentAlbumCoverSrc = albumCard.querySelector('img').src;
            const songObj = allSongsData.find(s => s.src === currentAlbumSongs[0].trim());
            if (songObj) playSong(songObj);
        });
    });

    // --- Play/Pause ---
    playPauseButton.addEventListener('click', function () {
        if (isPlaying) {
            audioPlayer.pause();
            playPauseButton.innerHTML = '<i class="bi bi-play-fill"></i>';
            isPlaying = false;
            updateMediaSessionPlaybackState('paused');
        } else {
            audioPlayer.play();
            playPauseButton.innerHTML = '<i class="bi bi-pause-fill"></i>';
            isPlaying = true;
            updateMediaSessionPlaybackState('playing');
        }
    });

    // FIX #5: Precedente — shuffle history corretta
    prevSongButton.addEventListener('click', function () {
        if (isShuffle) {
            if (shuffleHistory.length > 1) {
                shuffleHistory.pop(); // rimuove la corrente
                const prevSrc = shuffleHistory[shuffleHistory.length - 1]; // legge senza pop
                const songObj = allSongsData.find(s => s.src === prevSrc);
                if (songObj) {
                    isNavigatingBack = true; // evita il push doppio in playSong
                    playSong(songObj);
                }
            }
            return;
        }
        if (currentSongIndex > 0) {
            // FIX #1: usa currentSongIndex come indice nell'album, cerca per src
            const songObj = allSongsData.find(s => s.src === currentAlbumSongs[currentSongIndex - 1]?.trim());
            if (songObj) playSong(songObj);
        }
    });

    // --- Successivo ---
    nextSongButton.addEventListener('click', function () {
        if (isShuffle) {
            let nextIdx;
            do { nextIdx = Math.floor(Math.random() * allSongsData.length); }
            while (allSongsData.length > 1 && allSongsData[nextIdx].src === audioPlayer.src);
            playSong(allSongsData[nextIdx]);
        } else if (currentSongIndex < currentAlbumSongs.length - 1) {
            const songObj = allSongsData.find(s => s.src === currentAlbumSongs[currentSongIndex + 1]?.trim());
            if (songObj) playSong(songObj);
        } else if (isLoop) {
            const songObj = allSongsData.find(s => s.src === currentAlbumSongs[0]?.trim());
            if (songObj) playSong(songObj);
        }
    });

    // --- Volume ---
    volumeControl.addEventListener('input', function () {
        audioPlayer.volume = volumeControl.value / 100;
    });

    // --- Like ---
    likeButton.addEventListener('click', function () {
        const src    = audioPlayer.src;
        const name   = currentSongEl.textContent;
        const cover  = currentAlbumCover.src;
        const isLiked = likedSongs.some(s => s.src === src);
        if (isLiked) {
            likedSongs = likedSongs.filter(s => s.src !== src);
        } else {
            likedSongs.push({ src, name, cover });
        }
        saveFavorites();
        updateLikeButton();
        updatePlaylistButton();
    });

    // FIX #8: throttle su timeupdate — salva stato max 1 volta/sec
    audioPlayer.addEventListener('timeupdate', function () {
        updateProgressBar();
        savePlayerState();
    });

    progressBar.addEventListener('input', function () {
        if (!isNaN(audioPlayer.duration)) {
            audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration;
        }
    });

    function updateShuffleLoopButtons() {
        loopButton.classList.toggle('active', isLoop);
        shuffleButton.classList.toggle('active', isShuffle);
    }

    loopButton.addEventListener('click', function () {
        isLoop = !isLoop;
        if (isLoop) { isShuffle = false; shuffleButton.classList.remove('active'); }
        updateShuffleLoopButtons();
        savePlayerState();
    });

    shuffleButton.addEventListener('click', function () {
        isShuffle = !isShuffle;
        if (isShuffle) { isLoop = false; loopButton.classList.remove('active'); }
        updateShuffleLoopButtons();
        savePlayerState();
    });

    // --- Fine canzone ---
    audioPlayer.addEventListener('ended', function () {
        updateMediaSessionPlaybackState('none');
        if (isLoop) {
            // FIX #1: cerca la canzone nell'album per indice corretto
            const songObj = allSongsData.find(s => s.src === currentAlbumSongs[currentSongIndex]?.trim());
            if (songObj) playSong(songObj);
        } else if (isShuffle) {
            let nextIdx;
            do { nextIdx = Math.floor(Math.random() * allSongsData.length); }
            while (allSongsData.length > 1 && allSongsData[nextIdx].src === audioPlayer.src);
            playSong(allSongsData[nextIdx]);
        } else if (currentSongIndex < currentAlbumSongs.length - 1) {
            const songObj = allSongsData.find(s => s.src === currentAlbumSongs[currentSongIndex + 1]?.trim());
            if (songObj) playSong(songObj);
        } else {
            playNextAlbum();
        }
    });

    // --- Album cards ---
    document.querySelectorAll('.album-card').forEach(albumCard => {
        albumCard.addEventListener('click', function (event) {
            if (!event.target.classList.contains('listen-now')) showAlbumDetails(albumCard);
        });
    });

    // FIX #3: UNICO listener per close-overlay (erano duplicati)
    document.getElementById('close-overlay').addEventListener('click', function () {
        document.getElementById('overlay').classList.remove('visible');
    });

    document.getElementById('overlay').addEventListener('click', function (event) {
        if (event.target === this) this.classList.remove('visible');
    });

    audioPlayer.addEventListener('error', (e) => {
        console.error('Errore audio:', e);
        currentSongEl.textContent = 'Errore di riproduzione';
        playPauseButton.innerHTML = '<i class="bi bi-play-fill"></i>';
        isPlaying = false;
        updateMediaSessionPlaybackState('none');
    });

    window.addEventListener('beforeunload', () => { savePlayerState(); });
    audioPlayer.addEventListener('play',           () => { savePlayerState(); updateMediaSessionPlaybackState('playing'); });
    audioPlayer.addEventListener('pause',          () => { savePlayerState(); updateMediaSessionPlaybackState('paused'); });
    audioPlayer.addEventListener('loadedmetadata', () => { updateProgressBar(); });
    audioPlayer.addEventListener('canplaythrough', () => { document.getElementById('audio-loading').style.display = 'none'; });

    updateLikeButton();
    updatePlaylistButton();
    restorePlayerState();

    initializeSearch();
    initializeStars();

    // --- Playlist button ---
    const addToPlaylistButton = document.getElementById('add-to-playlist-button');
    if (addToPlaylistButton) {
        addToPlaylistButton.addEventListener('click', addCurrentSongToPlaylist);
    }

    // --- Equalizzatore ---
    const eqButton  = document.getElementById('equalizer-button');
    const eqPanel   = document.getElementById('equalizer-panel');
    const eqCloseBtn = document.getElementById('eq-close-btn');

    if (eqButton && eqPanel) {
        eqButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShown = eqPanel.classList.toggle('show');
            eqButton.classList.toggle('active', isShown);
        });
        if (eqCloseBtn) {
            eqCloseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                eqPanel.classList.remove('show');
                eqButton.classList.remove('active');
            });
        }
        document.addEventListener('click', (event) => {
            if (!eqPanel.classList.contains('show')) return;
            if (event.target === eqButton || eqButton.contains(event.target)) return;
            if (eqPanel.contains(event.target)) return;
            eqPanel.classList.remove('show');
            eqButton.classList.remove('active');
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && eqPanel.classList.contains('show')) {
                eqPanel.classList.remove('show');
                eqButton.classList.remove('active');
            }
        });
    }

    // --- Lyrics ---
    if (lyricsButton && lyricsOverlay) {
        lyricsButton.addEventListener('click', (e) => { e.stopPropagation(); openLyricsOverlay(); });
        if (closeLyricsButton) {
            closeLyricsButton.addEventListener('click', (e) => { e.stopPropagation(); closeLyricsOverlay(); });
        }
        lyricsOverlay.addEventListener('click', (event) => {
            if (event.target === lyricsOverlay) closeLyricsOverlay();
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lyricsOverlay.classList.contains('active')) closeLyricsOverlay();
        });
    }
});

// === RICERCA ===
function initializeSearch() {
    const searchBar     = document.getElementById('search-bar');
    const searchResults = document.getElementById('search-results');
    let searchTimeout;

    searchBar.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const searchTerm = e.target.value.toLowerCase().trim();
            if (searchTerm.length < 2) { searchResults.style.display = 'none'; return; }

            const results = [];
            document.querySelectorAll('.album-card').forEach(album => {
                const title  = album.querySelector('h3').textContent.toLowerCase();
                const artist = album.dataset.artist.toLowerCase();

                if (title.includes(searchTerm) || artist.includes(searchTerm)) {
                    results.push({ type: 'album', element: album, title, artist, cover: album.querySelector('img').src, year: album.dataset.year });
                }

                const btn = album.querySelector('.listen-now');
                if (btn) {
                    const songs = btn.getAttribute('data-names')?.split(',') || [];
                    const srcs  = btn.getAttribute('data-src')?.split(',') || [];
                    songs.forEach((song, index) => {
                        if (song.toLowerCase().includes(searchTerm)) {
                            results.push({ type: 'song', element: album, title: song, artist, cover: album.querySelector('img').src, albumTitle: title, src: srcs[index]?.trim() });
                        }
                    });
                }
            });
            displaySearchResults(results, searchResults);
        }, 300);
    });
}

function displaySearchResults(results, container) {
    container.innerHTML = '';
    if (results.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';

    results.forEach(result => {
        const el = document.createElement('div');
        el.className = 'search-result';
        el.innerHTML = `
            <img src="${result.cover}" alt="cover" style="width:50px;height:50px;object-fit:cover;">
            <div class="result-info">
                <h4>${result.title}</h4>
                <p>${result.artist}${result.type === 'album' ? ' - ' + result.year : ' - ' + result.albumTitle}</p>
                <span class="result-type">${result.type === 'album' ? 'Album' : 'Canzone'}</span>
            </div>
        `;
        el.addEventListener('click', () => {
            const searchBar = document.getElementById('search-bar');
            if (result.type === 'album') {
                result.element.querySelector('.listen-now').click();
            } else {
                const songObj = allSongsData.find(s => s.src === result.src);
                if (songObj) { setCurrentAlbumContextFromSong(songObj); playSong(songObj); }
            }
            searchBar.value = '';
            container.style.display = 'none';
        });
        container.appendChild(el);
    });
}

// === STELLE ===
function initializeStars() {
    const starsContainer = document.querySelector('.stars');
    if (!starsContainer) return;
    const numberOfStars = 1000;
    starsContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < numberOfStars; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = 0.3 + Math.random() * 2;
        const twinkleDuration = 8 + Math.random() * 12;
        star.style.cssText = `
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 300}%;
            width: ${size}px; height: ${size}px;
            --twinkle-duration: ${twinkleDuration}s;
            animation-delay: ${Math.random() * twinkleDuration}s;
            background: rgba(255,255,255,${0.3 + Math.random() * 0.4});
            box-shadow: 0 0 ${size * 1.5}px rgba(255,255,255,0.6);
            position: absolute; border-radius: 50%;
        `;
        fragment.appendChild(star);
    }
    starsContainer.appendChild(fragment);

    // FIX #9: cache della NodeList fuori dal loop RAF
    const stars = starsContainer.querySelectorAll('.star');
    const speeds = Array.from(stars).map((_, i) => 0.02 + (i % 5) * 0.005);

    function moveStars() {
        stars.forEach((star, i) => {
            const y = parseFloat(star.style.top) + speeds[i];
            star.style.top = (y > 300 ? -5 : y) + '%';
        });
        requestAnimationFrame(moveStars);
    }
    moveStars();
}

// === HELPER ALBUM CONTEXT ===
function setCurrentAlbumContextFromSong(songData) {
    if (!songData) return;
    const albumCard = document.querySelectorAll('.album-card')[songData.originalAlbumIndex];
    if (!albumCard) return;
    const btn = albumCard.querySelector('.listen-now');
    if (!btn) return;
    currentAlbumSongs    = btn.getAttribute('data-src').split(',').map(s => s.trim());
    currentAlbumNames    = btn.getAttribute('data-names').split(',').map(s => s.trim());
    currentAlbumCoverSrc = albumCard.querySelector('img').src;
    // FIX #1: currentSongIndex è sempre l'indice nell'album, non globale
    currentSongIndex     = songData.originalSongIndexInAlbum;
}

function normalizeAudioSrc(src) {
    if (src.includes('/music/')) return src.substring(src.lastIndexOf('/music/') + 1);
    return src;
}

function updatePlaylistButton() {
    const btn         = document.getElementById('add-to-playlist-button');
    const audioPlayer = document.getElementById('audio-player');
    if (!btn || !audioPlayer?.src) return;
    const myPlaylist = JSON.parse(localStorage.getItem('myPlaylist')) || [];
    const normalizedSrc = normalizeAudioSrc(audioPlayer.src);
    const isInPlaylist  = myPlaylist.some(s => normalizeAudioSrc(s.src) === normalizedSrc);
    btn.style.color = isInPlaylist ? '#1ed760' : '';
    btn.title       = isInPlaylist ? 'Canzone già in playlist' : 'Aggiungi alla mia playlist';
}

function addCurrentSongToPlaylist() {
    const audioPlayer = document.getElementById('audio-player');
    const currentSongEl = document.getElementById('current-song');
    const currentAlbumCoverEl = document.getElementById('current-album-cover');
    const btn = document.getElementById('add-to-playlist-button');

    if (!audioPlayer?.src || currentSongEl.textContent === 'Nessuna canzone in riproduzione') {
        alert('Nessuna canzone in riproduzione'); return;
    }

    let myPlaylist = JSON.parse(localStorage.getItem('myPlaylist')) || [];
    const normalizedSrc = normalizeAudioSrc(audioPlayer.src);

    if (myPlaylist.some(s => normalizeAudioSrc(s.src) === normalizedSrc)) {
        alert('Questa canzone è già nella tua playlist!'); return;
    }

    const songData = allSongsData.find(s => normalizeAudioSrc(s.src) === normalizedSrc);
    if (!songData) { alert('Errore nell\'aggiungere la canzone alla playlist'); return; }

    myPlaylist.push({
        src: songData.src,
        name: songData.name,
        artist: songData.artist || 'Artista Sconosciuto',
        albumName: songData.albumName || '',
        cover: songData.cover || currentAlbumCoverEl.src,
        duration: audioPlayer.duration || trackDurations[songData.src] || 0
    });

    localStorage.setItem('myPlaylist', JSON.stringify(myPlaylist));
    localStorage.setItem('allSongsDataStore', JSON.stringify(allSongsData));

    alert(`"${songData.name}" è stata aggiunta alla tua playlist!`);
    updatePlaylistButton();

    if (btn) {
        btn.style.transform = 'scale(1.2)';
        setTimeout(() => { btn.style.transform = 'scale(1)'; }, 300);
    }
}

// === TESTI ===
let currentLyrics         = '';
let lyricsLines           = [];
let currentHighlightedLine = -1;
let timePerLine           = 0;
let syncOffset            = 0;
let autoCalibrationData   = JSON.parse(localStorage.getItem('lyricsCalibration')) || {};

const lyricsButton      = document.getElementById('lyrics-button');
const lyricsOverlay     = document.getElementById('lyrics-overlay');
const closeLyricsButton = document.getElementById('close-lyrics');
const lyricsSongTitle   = document.getElementById('lyrics-song-title');
const lyricsContainer   = document.getElementById('lyrics-container');
const lyricsContent     = document.getElementById('lyrics-content');
const lyricsLoading     = document.getElementById('lyrics-loading');
const lyricsNotFound    = document.getElementById('lyrics-not-found');

function saveCalibrationData(artist, title, offset, accuracy) {
    const key = `${artist}_${title}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
    autoCalibrationData[key] = { offset, accuracy, uses: (autoCalibrationData[key]?.uses || 0) + 1, lastUsed: Date.now() };
    localStorage.setItem('lyricsCalibration', JSON.stringify(autoCalibrationData));
}

function getCalibrationData(artist, title) {
    const key = `${artist}_${title}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const data = autoCalibrationData[key];
    return (data && data.accuracy > 75) ? data.offset : 0;
}

async function getLyrics(artist, title) {
    try {
        const cleanArtist = artist.replace(/\s*\(.*?\)\s*/g, '').trim();
        const cleanTitle  = title.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*-.*$/, '').trim();
        logEvent('API', `Richiesta testi: ${cleanArtist} - ${cleanTitle}`);
        const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`);
        if (response.ok) {
            const data = await response.json();
            if (data.lyrics) return data.lyrics.replace(/\n/g, '<br>');
        }
        if (response.status === 404) return 'not_found';
        throw new Error(`HTTP ${response.status}`);
    } catch (error) {
        logEvent('ERROR', 'Errore testi', { artist, title, error: error.message });
        return 'not_found';
    }
}

async function showCurrentLyrics() {
    const audioPlayer = document.getElementById('audio-player');
    // FIX #7: usa currentSongIndex (indice album) su currentAlbumNames
    if (!currentAlbumNames[currentSongIndex]) { showLyricsNotFound(); return; }

    const songName = currentAlbumNames[currentSongIndex];
    const parts    = songName.split(' - ');
    let artist = '', title = '';
    if (parts.length >= 2) {
        title  = parts[0].trim();
        artist = parts[1].replace(/\s*\(.*?\).*$/, '').trim();
    } else {
        const albumCard = document.querySelector('.album-card');
        artist = albumCard?.dataset.artist || '';
        title  = songName.trim();
    }

    if (!artist || !title) { showLyricsNotFound(); return; }

    const savedOffset = getCalibrationData(artist, title);
    syncOffset = savedOffset !== 0 ? savedOffset : 0;
    lyricsSongTitle.textContent = `${title} - ${artist}`;
    showLyricsLoading();

    try {
        const lyrics = await getLyrics(artist, title);
        if (lyrics === 'not_found') { showLyricsNotFound(); }
        else { displayLyrics(lyrics); setupLyricsSync(); }
    } catch (error) {
        logEvent('ERROR', 'Errore caricamento testi', error);
        showLyricsNotFound();
    }
}

function displayLyrics(lyrics) {
    currentLyrics = lyrics;
    lyricsLines   = lyrics.split('<br>').filter(line => line.trim() !== '');
    lyricsContent.innerHTML = lyricsLines.map((line, i) =>
        `<span class="lyric-line" data-line="${i}">${line.trim()}</span>`
    ).join('');
    lyricsLoading.style.display  = 'none';
    lyricsNotFound.style.display = 'none';
    lyricsContent.style.display  = 'block';
}

function showLyricsLoading() {
    lyricsLoading.style.display  = 'flex';
    lyricsContent.style.display  = 'none';
    lyricsNotFound.style.display = 'none';
}

function showLyricsNotFound() {
    lyricsLoading.style.display  = 'none';
    lyricsContent.style.display  = 'none';
    lyricsNotFound.style.display = 'block';
}

function analyzeLyricsStructure(lines) {
    const seen = new Map();
    const analysis = { emptyLines: 0, shortLines: 0, longLines: 0, repetitions: 0 };
    lines.forEach(line => {
        const clean = line.trim().toLowerCase();
        if (!clean)           analysis.emptyLines++;
        else if (clean.length < 20) analysis.shortLines++;
        else if (clean.length > 80) analysis.longLines++;
        if (seen.has(clean)) analysis.repetitions++;
        else seen.set(clean, 1);
    });
    return analysis;
}

function calculateAdaptiveSync(duration, analysis) {
    const contentLines = lyricsLines.length - analysis.emptyLines;
    let base = duration / contentLines;
    if (analysis.shortLines > lyricsLines.length * 0.3)   base *= 0.9;
    if (analysis.repetitions > lyricsLines.length * 0.2)  base *= 0.95;
    if (analysis.longLines > lyricsLines.length * 0.2)    base *= 1.1;
    return base;
}

function setupLyricsSync() {
    const audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer || lyricsLines.length === 0) return;

    const updateSync = () => {
        if (audioPlayer.duration > 0) {
            const analysis = analyzeLyricsStructure(lyricsLines);
            timePerLine = calculateAdaptiveSync(audioPlayer.duration, analysis);
        }
    };

    if (audioPlayer.readyState >= 1) updateSync();
    else audioPlayer.addEventListener('loadedmetadata', updateSync);

    audioPlayer.removeEventListener('timeupdate', updateLyricsHighlight);
    audioPlayer.addEventListener('timeupdate', updateLyricsHighlight);
}

function updateLyricsHighlight() {
    const audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer || !timePerLine || lyricsLines.length === 0) return;

    const ct = audioPlayer.currentTime + syncOffset;
    const progress = ct / audioPlayer.duration;
    const base = Math.floor(ct / timePerLine);
    let correctionFactor = progress < 0.2 ? 0.85 : progress <= 0.8 ? 1.05 : 0.9;
    let lineIndex = Math.floor(base * correctionFactor);

    // Transizione graduale: evita salti > 3 righe
    if (Math.abs(lineIndex - currentHighlightedLine) > 3 && currentHighlightedLine >= 0) {
        lineIndex = currentHighlightedLine + (lineIndex > currentHighlightedLine ? 1 : -1);
    }

    const validLine = Math.max(0, Math.min(lineIndex, lyricsLines.length - 1));
    if (validLine === currentHighlightedLine || validLine < 0) return;

    const prevEl = lyricsContent.querySelector(`[data-line="${currentHighlightedLine}"]`);
    if (prevEl) prevEl.classList.remove('highlight');

    const currEl = lyricsContent.querySelector(`[data-line="${validLine}"]`);
    if (currEl) {
        currEl.classList.add('highlight');
        currEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    currentHighlightedLine = validLine;
}

function openLyricsOverlay() {
    lyricsOverlay.classList.add('active');
    lyricsButton.classList.add('active');
    showCurrentLyrics();
}

function closeLyricsOverlay() {
    lyricsOverlay.classList.remove('active');
    lyricsButton.classList.remove('active');
    currentHighlightedLine = -1;
    lyricsContent.querySelectorAll('.lyric-line.highlight').forEach(l => l.classList.remove('highlight'));
}

// --- Touch support testi ---
let touchStartY = 0, touchStartX = 0, lastTouchTime = 0;
if (lyricsOverlay) {
    lyricsOverlay.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        lastTouchTime = Date.now();
    });
    lyricsOverlay.addEventListener('touchend', (e) => {
        const deltaY = touchStartY - e.changedTouches[0].clientY;
        const deltaX = touchStartX - e.changedTouches[0].clientX;
        if (Date.now() - lastTouchTime >= 300) return;
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 50) {
            syncOffset += deltaY > 0 ? 0.5 : -0.5;
            e.preventDefault();
        } else if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            const target = currentHighlightedLine + (deltaX > 0 ? 1 : -1);
            if (target >= 0 && target < lyricsLines.length) currentHighlightedLine = target;
            e.preventDefault();
        }
    });
}

// === MEDIA SESSION API ===
function initializeMediaSession() {
    if (!('mediaSession' in navigator)) { logEvent('INFO', 'Media Session API non supportata'); return; }
    const audioPlayer = document.getElementById('audio-player');

    const handlers = {
        play: () => {
            if (audioPlayer.paused) audioPlayer.play().then(() => {
                isPlaying = true;
                document.getElementById('play-pause').innerHTML = '<i class="bi bi-pause-fill"></i>';
            });
        },
        pause: () => {
            if (!audioPlayer.paused) {
                audioPlayer.pause();
                isPlaying = false;
                document.getElementById('play-pause').innerHTML = '<i class="bi bi-play-fill"></i>';
            }
        },
        previoustrack: () => document.getElementById('prev-song').click(),
        nexttrack:     () => document.getElementById('next-song').click(),
        stop: () => { audioPlayer.pause(); audioPlayer.currentTime = 0; isPlaying = false; document.getElementById('play-pause').innerHTML = '<i class="bi bi-play-fill"></i>'; },
        seekbackward: (d) => { audioPlayer.currentTime = Math.max(audioPlayer.currentTime - (d.seekOffset || 10), 0); },
        seekforward:  (d) => { audioPlayer.currentTime = Math.min(audioPlayer.currentTime + (d.seekOffset || 10), audioPlayer.duration); },
        seekto:       (d) => { if (d.seekTime) audioPlayer.currentTime = d.seekTime; }
    };

    Object.entries(handlers).forEach(([action, handler]) => {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    });

    logEvent('SUCCESS', 'Media Session API configurata');
}

function updateMediaSessionMetadata(songData) {
    if (!('mediaSession' in navigator) || !songData) return;
    try {
        let artworkUrl = songData.cover;
        if (artworkUrl && !artworkUrl.startsWith('http')) artworkUrl = new URL(artworkUrl, window.location.origin).href;
        const sizes = ['96x96','128x128','192x192','256x256','384x384','512x512'];
        navigator.mediaSession.metadata = new MediaMetadata({
            title:   songData.name      || 'Sconosciuto',
            artist:  songData.artist    || 'Artista sconosciuto',
            album:   songData.albumName || 'Album sconosciuto',
            artwork: artworkUrl ? sizes.map(s => ({ src: artworkUrl, sizes: s, type: 'image/jpeg' })) : []
        });
        const audioPlayer = document.getElementById('audio-player');
        navigator.mediaSession.playbackState = audioPlayer ? (audioPlayer.paused ? 'paused' : 'playing') : 'none';
    } catch (error) {
        logEvent('ERROR', 'Errore Media Session metadata', error);
    }
}

function updateMediaSessionPlaybackState(state) {
    if ('mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = state; } catch {}
    }
}