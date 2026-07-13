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
    window.ALL_AVAILABLE_SONGS = allSongsData;
}

// === DOM READY ===
document.addEventListener('DOMContentLoaded', async function () {
    logEvent('INFO', '=== MINERIFY MUSIC PLAYER AVVIATO ===');

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
    }

    // Renderizza ascoltati di recente nel menu
    renderRecentlyPlayed();

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('currentUser');
            window.location.href = "../accesso_pagina/accedi/accedi.html";
        });
    }

    // Modale di benvenuto solo al primo caricamento dopo il login
    const firstLoginFlag = sessionStorage.getItem('firstLoginAfterAccess');
    if (firstLoginFlag) {
        const welcomeModal = document.getElementById('welcome-modal');
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        const welcomeUserName = document.getElementById('welcome-user-name');
        
        if (currentUser && currentUser.nome) {
            welcomeUserName.textContent = `Bentornato, ${currentUser.nome}!`;
        }
        
        welcomeModal.style.display = 'flex';
        sessionStorage.removeItem('firstLoginAfterAccess'); // Rimuove il flag dopo aver mostrato la modale
    }

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

    // Imposta immagine di default quando nessuna canzone è in riproduzione
    const DEFAULT_COVER = '../img/spotifyLogo.jpg'; // Cambia questo URL con la tua immagine
    if (currentAlbumCover) {
        currentAlbumCover.src = DEFAULT_COVER;
    }

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
        // Controllo se l'utente è loggato
        const userJSON = localStorage.getItem('currentUser');
        if (!userJSON) {
            alert("Devi accedere per ascoltare la musica.");
            window.location.href = "../accesso_pagina/accedi/accedi.html";
            return;
        }

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
            initAudioContext();
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

            // === NUOVE FEATURE ===
            showSongToast(songData);
            // Nuove UI feature
            updateNowPlayingAlbumCard(songData);
            addToRecentlyPlayed(songData);
        }).catch(error => {
            isPlaying = false;
            playPauseButton.innerHTML = '<i class="bi bi-play-fill"></i>';
            updateMediaSessionPlaybackState('paused');
            logEvent('ERROR', 'Errore riproduzione', error);
        });

        audioPlayer.oncanplay = () => { document.getElementById('audio-loading').style.display = 'none'; };
        audioPlayer.onerror   = () => { document.getElementById('audio-loading').style.display = 'none'; };
    }
    window.playSong = playSong;

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
    const currentSongName = document.getElementById('current-song')?.textContent || '';
    if (!currentSongName || currentSongName === 'Nessuna canzone in riproduzione') {
        showLyricsNotFound(); 
        return; 
    }

    const parts = currentSongName.split(' - ');
    let artist = '', title = '';
    if (parts.length >= 2) {
        title  = parts[0].trim();
        artist = parts[1].replace(/\s*\(.*?\).*$/, '').trim();
    } else {
        artist = currentArtist || '';
        title  = currentSongName.trim();
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

// ================================================================
// === NUOVE FEATURE: SFONDO DINAMICO ===
// ================================================================
function extractAndApplyDynamicBg(imgSrc) {
    if (!imgSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1; canvas.height = 1;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            document.body.style.setProperty('--dynamic-r', r);
            document.body.style.setProperty('--dynamic-g', g);
            document.body.style.setProperty('--dynamic-b', b);
            document.body.classList.add('dynamic-bg-active');
            // Aggiorna glow copertina nel modal
            const glow = document.getElementById('nowplaying-cover-glow');
            if (glow) glow.style.background = `rgba(${r},${g},${b},0.6)`;
            // Aggiorna bg del modal
            const bg = document.getElementById('nowplaying-bg');
            if (bg) bg.style.background = `radial-gradient(ellipse at 30% 40%, rgba(${r},${g},${b},0.4) 0%, rgba(0,0,0,0.97) 70%)`;
        } catch(e) {}
    };
    img.src = imgSrc;
}

// ================================================================
// === NUOVE FEATURE: TOAST NOTIFICA ===
// ================================================================
let toastTimeout = null;
function showSongToast(songData) {
    const toast = document.getElementById('song-toast');
    if (!toast || !songData) return;
    // Estrai nome canzone (prima del ' - Artista')
    const rawName = songData.name || 'Canzone';
    const songTitle = rawName.includes(' - ') ? rawName.split(' - ')[0].trim() : rawName;
    document.getElementById('toast-cover').src = songData.cover || '';
    document.getElementById('toast-title').textContent = songTitle;
    document.getElementById('toast-artist').textContent = songData.artist || '—';
    // Reset e mostra
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.classList.remove('visible');
    void toast.offsetWidth; // force reflow
    toast.classList.add('visible');
    toastTimeout = setTimeout(() => toast.classList.remove('visible'), 3500);
}

// ================================================================
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
    if (el('nowplaying-artist-name')) el('nowplaying-artist-name').textContent = songData.artist || '—';
    if (el('nowplaying-album-name')) el('nowplaying-album-name').textContent = songData.albumName || '—';
    if (el('np-lyrics-title')) el('np-lyrics-title').textContent = `Testi – ${songTitle}`;
    // Like
    const npLike = el('np-like');
    if (npLike) {
        const audioPlayer = document.getElementById('audio-player');
        const isLiked = likedSongs.some(s => s.src === audioPlayer?.src);
        npLike.textContent = isLiked ? '❤️' : '🤍';
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
        
        window.audioCtx = audioCtx;
        window.analyser = analyser;
        window.dataArray = new Uint8Array(analyser.frequencyBinCount);
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
        // Fallback: barre animate finte se AudioContext non è disponibile
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
// === NUOVE FEATURE: TESTI NEL MODAL NP — SYNC AVANZATO ===
// ================================================================
let npHighlightedLine = -1;
let npLyricsLinesArr = [];
let npTimePL = 0;
let npSyncOffsetManual = 0;   // offset manuale in secondi (±)
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

    const currentSongName = document.getElementById('current-song')?.textContent || '';
    if (!currentSongName || currentSongName === 'Nessuna canzone in riproduzione') {
        showNpLyricsNotFound(); 
        return; 
    }
    
    const parts = currentSongName.split(' - ');
    let artist = '', title = '';
    if (parts.length >= 2) {
        title  = parts[0].trim();
        artist = parts[1].replace(/\s*\(.*?\).*$/, '').trim();
    } else {
        artist = currentArtist || '';
        title  = currentSongName.trim();
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
        // Analisi struttura (riusa funzioni già presenti)
        const analysis = analyzeLyricsStructure(npLyricsLinesArr);
        // Calcola tempo medio per riga con correzione adattiva
        const contentLines = Math.max(npLyricsLinesArr.length - analysis.emptyLines, 1);
        let base = audioPlayer.duration / contentLines;
        if (analysis.shortLines   > npLyricsLinesArr.length * 0.3)  base *= 0.9;
        if (analysis.repetitions  > npLyricsLinesArr.length * 0.2)  base *= 0.95;
        if (analysis.longLines    > npLyricsLinesArr.length * 0.2)  base *= 1.1;
        npTimePL = base;
        // Stima intro: tipicamente 5–8% della durata
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

    // Correzione progressiva: inizio lento, metà veloce, fine lento
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
                <p class="pps-artist">${songData.artist || '—'}</p>
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
        list.innerHTML = '<p class="playlist-picker-empty">Nessuna playlist — creane una qui sotto!</p>';
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
            <button class="playlist-item-add-btn">${alreadyIn ? '✓ Aggiunta' : '+ Aggiungi'}</button>
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
        // Poi aggiungi la canzone corrente se non già in lista
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
            // Icona play → pause sulla card
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
        // Click sul quick-play btn → triggera listen-now
        if (quickBtn) {
            quickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Se questa card è già in riproduzione → toggle play/pause
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