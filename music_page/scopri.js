// === SISTEMA DI LOGGING AVANZATO ===

// Configurazione del logger
const LOG_CONFIG = {
    enabled: true,
    showTimestamp: true,
    showEventType: true,
    logToConsole: true,
    logToScreen: false // Cambia a true se vuoi vedere i log anche sullo schermo
};

// Tipi di eventi
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

/**
 * Funzione di logging universale
 * @param {string} eventType - Tipo di evento (usa EVENT_TYPES)
 * @param {string} message - Messaggio principale
 * @param {any} data - Dati aggiuntivi (opzionale)
 */
function logEvent(eventType, message, data = null) {
    if (!LOG_CONFIG.enabled) return;
    
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const icon = EVENT_TYPES[eventType] || 'ℹ️';
    
    let logMessage = `${icon} [${timestamp}] ${message}`;
    
    if (LOG_CONFIG.logToConsole) {
        if (data) {
            console.log(logMessage, data);
        } else {
            console.log(logMessage);
        }
    }
    
    if (LOG_CONFIG.logToScreen) {
        displayLogOnScreen(logMessage, eventType);
    }
}

/**
 * Mostra i log sullo schermo (opzionale)
 */
function displayLogOnScreen(message, eventType) {
    // Crea o trova il container dei log
    let logContainer = document.getElementById('debug-log');
    if (!logContainer) {
        logContainer = document.createElement('div');
        logContainer.id = 'debug-log';
        logContainer.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 300px;
            max-height: 400px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            font-family: monospace;
            font-size: 10px;
            padding: 10px;
            border-radius: 5px;
            overflow-y: auto;
            z-index: 20000;
            border: 1px solid #333;
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
    
    // Mantieni solo gli ultimi 20 log
    while (logContainer.children.length > 20) {
        logContainer.removeChild(logContainer.firstChild);
    }
    
    // Scroll automatico
    logContainer.scrollTop = logContainer.scrollHeight;
}

"use strict";

// Variabili di stato globali
let isPlaying = false;
let isShuffle = false;
let isLoop = false;
let currentSongIndex = 0;
let currentAlbumSongs = [];
let currentAlbumNames = [];
let currentAlbumCoverSrc = '';
let likedSongs = JSON.parse(localStorage.getItem('likedSongs')) || [];
let allSongsData = [];
let shuffleHistory = [];
const MAX_SHUFFLE_HISTORY = 20;

// Inizializza allSongsData con tutte le canzoni di tutti gli album
function initializeAllSongsData() {
    logEvent('INFO', 'Inizializzazione dati canzoni...');
    allSongsData = [];
    const albumCards = document.querySelectorAll('.album-card');
    albumCards.forEach((album, albumIdx) => {
        const listenNowButton = album.querySelector('.listen-now');
        if (!listenNowButton) return;
        const songSources = listenNowButton.getAttribute('data-src')?.split(',') || [];
        const songNames = listenNowButton.getAttribute('data-names')?.split(',') || [];
        const albumTitle = album.querySelector('h3')?.textContent || '';
        const artist = album.dataset.artist || '';
        const cover = album.querySelector('img')?.src || '';        songSources.forEach((src, songIdx) => {
            const songData = {
                src: src.trim(),
                name: songNames[songIdx] ? songNames[songIdx].trim() : '',
                albumName: albumTitle,
                artist: artist,
                cover: cover,
                originalAlbumIndex: albumIdx,
                originalSongIndexInAlbum: songIdx,
                duration: trackDurations[src.trim()] || 0
            };
            allSongsData.push(songData);
        });
    });
    
    // Salva i dati delle canzoni nel localStorage per la pagina playlist
    localStorage.setItem('allSongsDataStore', JSON.stringify(allSongsData));
    
    logEvent('SUCCESS', `Caricate ${allSongsData.length} canzoni da ${albumCards.length} album`);
}

document.addEventListener('DOMContentLoaded', function () {
    logEvent('INFO', '=== MINERIFY MUSIC PLAYER AVVIATO ===');
    logEvent('INFO', 'DOM caricato completamente, inizializzazione in corso...');
    
    // Elementi del DOM
    const playPauseButton = document.getElementById('play-pause');
    const prevSongButton = document.getElementById('prev-song');
    const nextSongButton = document.getElementById('next-song');
    const shuffleButton = document.getElementById('shuffle');
    const loopButton = document.getElementById('loop');
    const progressBar = document.getElementById('progress-bar');
    const volumeControl = document.getElementById('volume-control');
    const currentSong = document.getElementById('current-song');
    const currentAlbumCover = document.getElementById('current-album-cover');
    const currentTime = document.getElementById('current-time');
    const totalDuration = document.getElementById('total-duration');
    const likeButton = document.getElementById('like-button');
    const audioPlayer = document.getElementById('audio-player');
    const listenNowButtons = document.querySelectorAll('.listen-now');

    logEvent('SUCCESS', 'Elementi DOM trovati e caricati', {
        playPauseButton: !!playPauseButton,
        audioPlayer: !!audioPlayer,
        listenNowButtons: listenNowButtons.length
    });

    // Inizializza allSongsData
    initializeAllSongsData();

    // Inizializza la Media Session API
    initializeMediaSession();

    // Funzione per salvare i preferiti nel localStorage
    function saveFavorites() {
        localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
    }    // Funzione per aggiornare il cuoricino
    function updateLikeButton() {
        const currentSongSrc = audioPlayer.src;
        const isLiked = likedSongs.some(song => song.src === currentSongSrc);
        likeButton.textContent = isLiked ? "❤️" : "🤍"; // Rosso se nei preferiti, bianco altrimenti
    }

    // Salva lo stato del player nel localStorage
    function savePlayerState() {
        const playerState = {
            src: audioPlayer.src,
            currentTime: audioPlayer.currentTime,
            isPlaying: isPlaying,
            songName: currentSong.textContent,
            albumCover: currentAlbumCover.src,
            currentAlbumSongs: currentAlbumSongs,
            currentAlbumNames: currentAlbumNames,
            currentAlbumCoverSrc: currentAlbumCoverSrc,
            currentSongIndex: currentSongIndex,
            volume: audioPlayer.volume,
            isShuffle: isShuffle,
            isLoop: isLoop
        };
        localStorage.setItem('playerState', JSON.stringify(playerState));
    }

    // Ripristina lo stato del player dal localStorage
    function restorePlayerState() {
        try {
            const savedState = JSON.parse(localStorage.getItem('playerState'));
            if (savedState) {
                audioPlayer.src = savedState.src || '';
                audioPlayer.currentTime = savedState.currentTime || 0;
                audioPlayer.volume = savedState.volume || 1;
                currentSong.textContent = savedState.songName || 'Nessuna canzone in riproduzione';
                currentAlbumCover.src = savedState.albumCover || '';
                currentAlbumSongs = savedState.currentAlbumSongs || [];
                currentAlbumNames = savedState.currentAlbumNames || [];
                currentAlbumCoverSrc = savedState.currentAlbumCoverSrc || '';
                currentSongIndex = savedState.currentSongIndex || 0;
                isShuffle = savedState.isShuffle || false;
                isLoop = savedState.isLoop || false;

                if (savedState.isPlaying) {
                    audioPlayer.play()
                        .then(() => {
                            isPlaying = true;
                            playPauseButton.innerHTML = '<i class="bi bi-pause-fill"></i>';
                            
                            // Aggiorna Media Session se abbiamo i dati della canzone
                            if (savedState.src && savedState.songName) {
                                const songData = {
                                    name: savedState.songName,
                                    artist: 'Artista', // Potresti salvare questo nel localStorage
                                    albumName: 'Album', // Potresti salvare questo nel localStorage
                                    cover: savedState.albumCover,
                                    src: savedState.src
                                };
                                updateMediaSessionMetadata(songData);
                                updateMediaSessionPlaybackState('playing');
                            }
                        })
                        .catch(() => {
                            isPlaying = false;
                            playPauseButton.innerHTML = '<i class="bi bi-play-fill"></i>';
                            updateMediaSessionPlaybackState('paused');
                        });
                } else if (savedState.src && savedState.songName) {
                    // Anche se non è in riproduzione, aggiorna i metadata se abbiamo i dati
                    const songData = {
                        name: savedState.songName,
                        artist: 'Artista',
                        albumName: 'Album', 
                        cover: savedState.albumCover,
                        src: savedState.src
                    };
                    updateMediaSessionMetadata(songData);
                    updateMediaSessionPlaybackState('paused');
                }                updateLikeButton();
                updatePlaylistButton();
                updateShuffleLoopButtons();
            }
        } catch (error) {
            console.error('Errore nel ripristino dello stato:', error);
        }
    }

    // Funzione per aggiornare la barra di progresso e il tempo
    function updateProgressBar() {
        if (audioPlayer.duration && !isNaN(audioPlayer.duration)) {
            const currentMinutes = Math.floor(audioPlayer.currentTime / 60);
            const currentSeconds = Math.floor(audioPlayer.currentTime % 60);
            const durationMinutes = Math.floor(audioPlayer.duration / 60);
            const durationSeconds = Math.floor(audioPlayer.duration % 60);

            if (currentTime) {
                currentTime.textContent = `${currentMinutes}:${currentSeconds < 10 ? '0' : ''}${currentSeconds}`;
            }
            if (totalDuration) {
                totalDuration.textContent = `${durationMinutes}:${durationSeconds < 10 ? '0' : ''}${durationSeconds}`;
            }
            if (progressBar) {
                progressBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            }
        }
    }

    // Funzione per riprodurre una canzone
    function playSong(songData) {
        if (!songData) {
            logEvent('ERROR', 'Tentativo di riprodurre canzone senza dati');
            return;
        }
        
        logEvent('PLAYER', `Iniziando riproduzione: ${songData.name}`, {
            artist: songData.artist,
            album: songData.albumName,
            src: songData.src
        });
        
        setCurrentAlbumContextFromSong(songData);
        audioPlayer.src = songData.src;
        currentSong.textContent = songData.name;
        if (typeof currentArtist !== 'undefined' && currentArtist) currentArtist.textContent = songData.artist;
        currentAlbumCover.src = songData.cover;
        document.getElementById('audio-loading').style.display = 'block';
        
        logEvent('AUDIO', 'Caricamento audio iniziato...');
        
        audioPlayer.play().then(() => {
            isPlaying = true;
            playPauseButton.innerHTML = '<i class="bi bi-pause-fill"></i>';
            if (isShuffle) {
                shuffleHistory.push(songData.src);
                if (shuffleHistory.length > MAX_SHUFFLE_HISTORY) shuffleHistory.shift();
                logEvent('PLAYER', 'Canzone aggiunta alla cronologia shuffle');            }
            updateLikeButton();
            updatePlaylistButton();
            savePlayerState();
            
            // Aggiorna Media Session API con i nuovi metadata
            updateMediaSessionMetadata(songData);
            updateMediaSessionPlaybackState('playing');
            
            logEvent('SUCCESS', 'Riproduzione audio avviata con successo');
            
            // Aggiorna i testi se l'overlay è aperto
            if (lyricsOverlay && lyricsOverlay.classList.contains('active')) {
                logEvent('LYRICS', 'Aggiornamento testi per nuova canzone');
                showCurrentLyrics();
            }
        }).catch((error) => {
            isPlaying = false;
            playPauseButton.innerHTML = '<i class="bi bi-play-fill"></i>';
            updateMediaSessionPlaybackState('paused');
            logEvent('ERROR', 'Errore durante la riproduzione audio', error);
        });
        
        audioPlayer.oncanplay = function() {
            document.getElementById('audio-loading').style.display = 'none';
            logEvent('AUDIO', 'Audio pronto per la riproduzione');
        };
        
        audioPlayer.onerror = function() {
            document.getElementById('audio-loading').style.display = 'none';
            logEvent('ERROR', 'Errore di caricamento audio');
        };
    }

    // Funzione per passare all'album successivo
    function playNextAlbum() {
        const albumCards = document.querySelectorAll('.album-card');
        let currentAlbumCard = null;

        // Trova l'album corrente
        for (let i = 0; i < albumCards.length; i++) {
            if (albumCards[i].querySelector('img')?.src === currentAlbumCoverSrc) {
                currentAlbumCard = albumCards[i];
                break;
            }
        }

        if (currentAlbumCard) {
            const currentIndex = Array.from(albumCards).indexOf(currentAlbumCard);
            const nextIndex = (currentIndex + 1) % albumCards.length;
            const nextAlbum = albumCards[nextIndex];

            if (nextAlbum) {
                const listenNowButton = nextAlbum.querySelector('.listen-now');
                if (listenNowButton) {
                    // Aggiorna tutti i dati dell'album corrente
                    currentAlbumSongs = listenNowButton.getAttribute('data-src').split(',');
                    currentAlbumNames = listenNowButton.getAttribute('data-names').split(',');
                    currentAlbumCoverSrc = nextAlbum.querySelector('img').src;
                    currentSongIndex = 0;

                    // Riproduci la prima canzone del nuovo album
                    const songSrc = currentAlbumSongs[0];
                    const songObjectToPlay = allSongsData.find(songObj => songObj.src === songSrc);
                    if (songObjectToPlay) {
                        currentSongIndex = allSongsData.indexOf(songObjectToPlay);
                        playSong(songObjectToPlay);
                    }

                    // Salva lo stato per mantenere la coerenza
                    savePlayerState();
                }
            }
        }
    }

    // Funzione per mostrare i dettagli dell'album
    function showAlbumDetails(albumCard) {
        const albumCover = albumCard.querySelector('img').src;
        const albumName = albumCard.querySelector('h3').textContent;
        const listenNowButton = albumCard.querySelector('.listen-now');
        const albumSongs = listenNowButton.getAttribute('data-names').split(',');
        const albumSrcs = listenNowButton.getAttribute('data-src').split(',');
        const albumYear = albumCard.getAttribute('data-year') || 'Anno sconosciuto';
        const albumArtist = albumCard.getAttribute('data-artist') || 'Artista sconosciuto';

        // Mostra l'overlay con i dettagli dell'album
        const overlay = document.getElementById('overlay');
        const songList = document.getElementById('song-list');
        overlay.querySelector('img').src = albumCover;
        overlay.querySelector('h2').textContent = albumName;
        overlay.querySelector('.album-year').textContent = `Anno: ${albumYear}`;
        overlay.querySelector('.album-artist').textContent = `Artista: ${albumArtist}`;
        songList.innerHTML = '';

        // Aggiungi le canzoni alla lista con la durata dalla mappa
        albumSongs.forEach((song, index) => {
            const li = document.createElement('li');
            li.classList.add('song-item');
            const src = albumSrcs[index];
            let durationText = 'N/D';
            if (trackDurations[src]) {
                const min = Math.floor(trackDurations[src] / 60);
                const sec = trackDurations[src] % 60;
                durationText = `${min}:${sec < 10 ? '0' : ''}${sec}`;
            }
            li.innerHTML = `
                <span class="song-name">${index + 1}. ${song}</span>
                <span class="song-duration" id="duration-${index}">${durationText}</span>
            `;
            songList.appendChild(li);

            // Listener per riprodurre la canzone cliccata
            li.addEventListener('click', function () {
                currentAlbumSongs = albumSrcs;
                currentAlbumNames = albumSongs;
                currentAlbumCoverSrc = albumCover;
                // Trova l'oggetto canzone completo da allSongsData usando src
                const songObjectToPlay = allSongsData.find(songObj => songObj.src === albumSrcs[index]);
                if (songObjectToPlay) {
                    currentSongIndex = allSongsData.indexOf(songObjectToPlay);
                    playSong(songObjectToPlay);
                }
            });
        });

        overlay.classList.add('visible');
    }

    // Listener per i pulsanti "Ascolta ora"
    listenNowButtons.forEach(button => {
        button.addEventListener('click', function () {
            // Se il pulsante NON ha attributi data-src/data-names (quello in alto)
            if (!button.hasAttribute('data-src') && !button.hasAttribute('data-names')) {
                // Scegli una canzone casuale da allSongsData
                if (allSongsData.length > 0) {
                    const randomIndex = Math.floor(Math.random() * allSongsData.length);
                    const songObjectToPlay = allSongsData[randomIndex];
                    currentSongIndex = allSongsData.indexOf(songObjectToPlay);
                    playSong(songObjectToPlay);
                }
                return;
            }
            currentAlbumSongs = button.getAttribute('data-src').split(',');
            currentAlbumNames = button.getAttribute('data-names').split(',');
            const albumCard = button.closest('.album-card');
            currentAlbumCoverSrc = albumCard.querySelector('img').src;
            // Trova la prima canzone dell'album come oggetto
            const firstSongSrc = currentAlbumSongs[0];
            const songObjectToPlay = allSongsData.find(songObj => songObj.src === firstSongSrc);
            if (songObjectToPlay) {
                currentSongIndex = allSongsData.indexOf(songObjectToPlay);
                playSong(songObjectToPlay);
            }
        });
    });

    // Listener per il pulsante Play/Pause
    playPauseButton.addEventListener('click', function () {
        if (isPlaying) {
            audioPlayer.pause();
            playPauseButton.innerHTML = '<i class="bi bi-play-fill"></i>';
            isPlaying = false;
            updateMediaSessionPlaybackState('paused');
            logEvent('PLAYER', 'Riproduzione messa in pausa');
        } else {
            audioPlayer.play();
            playPauseButton.innerHTML = '<i class="bi bi-pause-fill"></i>';
            isPlaying = true;
            updateMediaSessionPlaybackState('playing');
            logEvent('PLAYER', 'Riproduzione ripresa');
        }
    });

    // Listener per il pulsante "Precedente"
    prevSongButton.addEventListener('click', function () {
        logEvent('PLAYER', 'Pulsante canzone precedente premuto');
        if (isShuffle) {
            if (shuffleHistory.length > 1) {
                shuffleHistory.pop(); // Rimuovi la canzone attuale
                const prevSrc = shuffleHistory.pop();
                const songObj = allSongsData.find(song => song.src === prevSrc);
                if (songObj) {
                    logEvent('PLAYER', 'Riproduzione canzone precedente (shuffle)', { song: songObj.name });
                    playSong(songObj);
                }
            }
            return;
        }
        if (currentSongIndex > 0) {
            const songObj = allSongsData.find(song => song.src === currentAlbumSongs[currentSongIndex - 1]);
            logEvent('PLAYER', 'Riproduzione canzone precedente', { song: songObj?.name });
            playSong(songObj);
        } else {
            logEvent('INFO', 'Già alla prima canzone, impossibile andare indietro');
        }
    });

    // Listener per il pulsante "Successivo"
    nextSongButton.addEventListener('click', function () {
        logEvent('PLAYER', 'Pulsante canzone successiva premuto');
        if (isShuffle) {
            let nextIdx;
            do {
                nextIdx = Math.floor(Math.random() * allSongsData.length);
            } while (allSongsData.length > 1 && allSongsData[nextIdx].src === audioPlayer.src);
            const songObj = allSongsData[nextIdx];
            logEvent('PLAYER', 'Riproduzione canzone casuale (shuffle)', { song: songObj.name });
            playSong(songObj);
        } else if (currentSongIndex < currentAlbumSongs.length - 1) {
            const songObj = allSongsData.find(song => song.src === currentAlbumSongs[currentSongIndex + 1]);
            logEvent('PLAYER', 'Riproduzione canzone successiva', { song: songObj?.name });
            playSong(songObj);
        } else if (isLoop) {
            const songObj = allSongsData.find(song => song.src === currentAlbumSongs[0]);
            logEvent('PLAYER', 'Riproduzione prima canzone (loop attivo)', { song: songObj?.name });
            playSong(songObj);
        } else {
            logEvent('INFO', 'Fine album raggiunta, nessuna canzone successiva');
        }
    });

    // Listener per il controllo del volume
    volumeControl.addEventListener('input', function () {
        audioPlayer.volume = volumeControl.value / 100;
    });

    // Listener per il cuoricino (like button)
    likeButton.addEventListener('click', function () {
        const currentSongSrc = audioPlayer.src;
        const currentSongName = currentSong.textContent;
        const currentSongCover = currentAlbumCover.src;

        const isLiked = likedSongs.some(song => song.src === currentSongSrc);

        if (isLiked) {
            likedSongs = likedSongs.filter(song => song.src !== currentSongSrc);
        } else {
            likedSongs.push({ src: currentSongSrc, name: currentSongName, cover: currentSongCover });
        }

        saveFavorites();        updateLikeButton();
        updatePlaylistButton();
    });

    // Listener per aggiornare la barra di progresso e il tempo
    audioPlayer.addEventListener('timeupdate', function() {
        updateProgressBar();
        savePlayerState();
    });

    progressBar.addEventListener('input', function () {
        if (!isNaN(audioPlayer.duration)) {
            audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration;
        }
    });

    // Aggiorna lo stato visivo dei pulsanti loop/shuffle
    function updateShuffleLoopButtons() {
        loopButton.classList.toggle('active', isLoop);
        shuffleButton.classList.toggle('active', isShuffle);
    }

    // Listener per il pulsante loop
    loopButton.addEventListener('click', function () {
        isLoop = !isLoop;
        if (isLoop) {
            isShuffle = false;
            shuffleButton.classList.remove('active');
        }
        loopButton.classList.toggle('active', isLoop);
        updateShuffleLoopButtons();
        savePlayerState();
    });

    // Listener per il pulsante shuffle
    shuffleButton.addEventListener('click', function () {
        isShuffle = !isShuffle;
        if (isShuffle) {
            isLoop = false;
            loopButton.classList.remove('active');
        }
        shuffleButton.classList.toggle('active', isShuffle);
        updateShuffleLoopButtons();
        savePlayerState();
    });

    // Modifica il listener per la fine della canzone
    audioPlayer.addEventListener('ended', function () {
        updateMediaSessionPlaybackState('none');
        if (isLoop) {
            const songObj = allSongsData.find(song => song.src === currentAlbumSongs[currentSongIndex]);
            playSong(songObj);
        } else if (isShuffle) {
            let nextIdx;
            do {
                nextIdx = Math.floor(Math.random() * allSongsData.length);
            } while (allSongsData.length > 1 && allSongsData[nextIdx].src === audioPlayer.src);
            const songObj = allSongsData[nextIdx];
            playSong(songObj);
        } else if (currentSongIndex < currentAlbumSongs.length - 1) {
            const songObj = allSongsData.find(song => song.src === currentAlbumSongs[currentSongIndex + 1]);
            playSong(songObj);
        } else {
            playNextAlbum();
        }
    });

    // Listener per le card degli album
    document.querySelectorAll('.album-card').forEach(albumCard => {
        albumCard.addEventListener('click', function (event) {
            // Evita di attivare il listener se si clicca sul pulsante "Ascolta ora"
            if (!event.target.classList.contains('listen-now')) {
                showAlbumDetails(albumCard);
            }
        });
    });

    // Listener per chiudere l'overlay
    document.getElementById('close-overlay').addEventListener('click', function () {
        const overlay = document.getElementById('overlay');
        overlay.classList.remove('visible');
    });

    // Listener per chiudere l'overlay cliccando sulla "X"
    document.getElementById('close-overlay').addEventListener('click', function () {
        const overlay = document.getElementById('overlay');
        overlay.classList.remove('visible');
    });

    // Listener per chiudere l'overlay cliccando fuori dal contenuto
    document.getElementById('overlay').addEventListener('click', function (event) {
        if (event.target === this) { // Controlla che il click sia sull'overlay e non sul contenuto
            this.classList.remove('visible');
        }
    });

    audioPlayer.addEventListener('error', (e) => {
        console.error('Errore audio:', e);
        currentSong.textContent = 'Errore di riproduzione';
        playPauseButton.textContent = '▶️';
        isPlaying = false;
        updateMediaSessionPlaybackState('none');
    });

    window.addEventListener('beforeunload', () => {
        savePlayerState();
    });

    // Ripristina lo stato all'avvio
    restorePlayerState();

    // Salva lo stato ogni volta che cambia
    audioPlayer.addEventListener('play', () => {
        savePlayerState();
        updateMediaSessionPlaybackState('playing');
    });
    audioPlayer.addEventListener('pause', () => {
        savePlayerState();
        updateMediaSessionPlaybackState('paused');
    });
    audioPlayer.addEventListener('loadedmetadata', function() {
        updateProgressBar();
    });    // Aggiorna il cuoricino all'avvio
    updateLikeButton();
    updatePlaylistButton();

    // Inizializza la barra di ricerca
    initializeSearch();

    // Inizializza le stelle
    initializeStars();

    // Nasconde loader quando l'audio è pronto
    audioPlayer.addEventListener('canplaythrough', function () {
        document.getElementById('audio-loading').style.display = 'none';
    });    // Nasconde loader anche in caso di errore
    audioPlayer.addEventListener('error', function () {
        document.getElementById('audio-loading').style.display = 'none';
    });

    // Gestione del pulsante "Aggiungi alla playlist"
    const addToPlaylistButton = document.getElementById('add-to-playlist-button');
    if (addToPlaylistButton) {
        addToPlaylistButton.addEventListener('click', function() {
            addCurrentSongToPlaylist();
        });
        logEvent('SUCCESS', 'Event listener add-to-playlist configurato');
    } else {
        logEvent('ERROR', 'Pulsante add-to-playlist non trovato nel DOM');
    }

    // === Equalizzatore: apertura/chiusura pannello ===
    const eqButton = document.getElementById('equalizer-button');
    const eqPanel = document.getElementById('equalizer-panel');
    const eqCloseBtn = document.getElementById('eq-close-btn');

    if (eqButton && eqPanel) {
        // Apri/chiudi al click sul pulsante
        eqButton.addEventListener('click', (e) => {
            e.stopPropagation(); // evita che il click si propagh i al documento
            const isShown = eqPanel.classList.toggle('show');
            eqButton.classList.toggle('active', isShown);
            logEvent('UI', `Equalizzatore ${isShown ? 'aperto' : 'chiuso'}`);
        });

        // Chiudi con il bottone X se presente
        if (eqCloseBtn) {
            eqCloseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                eqPanel.classList.remove('show');
                eqButton.classList.remove('active');
                logEvent('UI', 'Equalizzatore chiuso (X)');
            });
        }

        // Click fuori dal pannello lo chiude
        document.addEventListener('click', (event) => {
            if (!eqPanel.classList.contains('show')) return;
            const target = event.target;
            if (target === eqButton || eqButton.contains(target)) return;
            if (eqPanel.contains(target)) return;

            eqPanel.classList.remove('show');
            eqButton.classList.remove('active');
            logEvent('UI', 'Equalizzatore chiuso (click fuori)');
        });

        // Chiudi con Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && eqPanel.classList.contains('show')) {
                eqPanel.classList.remove('show');
                eqButton.classList.remove('active');
                logEvent('UI', 'Equalizzatore chiuso (Escape)');
            }
        });

        logEvent('SUCCESS', 'Event listener equalizzatore configurati');
    } else {
        logEvent('INFO', 'Equalizzatore non presente nel DOM (button/panel mancanti)');
    }
});

// Mappa delle durate delle tracce (secondi) per ogni file audio
const trackDurations = {
    // Esempio: 'music/1.mp3': 180, // 3:00

    // innocente 
    'music/1.mp3': 119,   // 1 min e 59 secondi
    'music/2.mp3': 232,   // 3 min e 52 secondi
    'music/3.mp3': 194,   // 3 min e 14 secondi
    'music/4.mp3': 144,   // 2 min e 24 secondi
    'music/5.mp3': 186,   // 3 min e 06 secondi
    'music/61.mp3': 176,  // 2 min e 56 secondi
    'music/62.mp3': 183,  // 3 min e 03 secondi
    'music/63.mp3': 147,  // 2 min e 27 secondi
    'music/64.mp3': 130,  // 2 min e 10 secondi
    'music/65.mp3': 186,  // 3 min e 06 secondi
    'music/66.mp3': 203,  // 3 min e 23 secondi
    'music/67.mp3': 203,  // 3 min e 23 secondi
    'music/68.mp3': 168,  // 2 min e 48 secondi
    'music/69.mp3': 147,  // 2 min e 27 secondi
    'music/70.mp3': 167,  // 2 min e 47 secondi
    'music/71.mp3': 177,  // 2 min e 57 secondi
    'music/72.mp3': 217,  // 3 min e 37 secondi
    'music/73.mp3': 226,  // 3 min e 46 secondi

    // astroworld
    'music/6.mp3': 191,   // BUTTERFLY EFFECT - Travis Scott (3:11)
    'music/7.mp3': 313,   // Sicko Mode - Travis Scott (5:13)
    'music/8.mp3': 146,   // Skeletons - Travis Scott (2:26)
    'music/9.mp3': 196,   // 5% TINT - Travis Scott (3:16)
    'music/10.mp3': 191,  // ZEZE - Travis Scott (3:11)
    'music/74.mp3': 271,  // STARGAZING - Travis Scott (4:31)
    'music/75.mp3': 180,  // CAROUSEL (Ft. Frank Ocean) - Travis Scott (3:00)
    'music/76.mp3': 186,  // R.I.P. SCREW (Ft. Swae Lee) - Travis Scott (3:06)
    'music/77.mp3': 338,  // STOP TRYING TO BE GOD (Ft. James Blake, Kid Cudi & Philip Bailey) - Travis Scott (5:38)
    'music/78.mp3': 218,  // NO BYSTANDERS (Ft. Juice WRLD & Sheck Wes) - Travis Scott (3:38)
    'music/79.mp3': 232,  // WAKE UP (Ft. The Weeknd) - Travis Scott (3:52)
    'music/80.mp3': 157,  // NC-17 (Ft. 21 Savage) - Travis Scott (2:37)
    'music/81.mp3': 143,  // ASTROTHUNDER - Travis Scott (2:23)
    'music/82.mp3': 150,  // YOSEMITE (Ft. Gunna & NAV) - Travis Scott (2:30)
    'music/83.mp3': 198,  // CAN'T SAY (Ft. Don Toliver) - Travis Scott (3:18)
    'music/84.mp3': 177,  // WHO? WHAT! (Ft. Quavo & Takeoff) - Travis Scott (2:57)
    'music/85.mp3': 218,  // HOUSTONFORNICATION - Travis Scott (3:38)
    'music/86.mp3': 209,  // COFFEE BEAN - Travis Scott (3:29)

    // The Globe - Kid Yugi
    'music/11.mp3': 212,  // DEM - Kid Yugi (ft. Artie 5ive & Tony Boy) 3:32
    'music/12.mp3': 185,  // GRAMMELOT - Kid Yugi 3:05
    'music/13.mp3': 191,  // Il Ferro di Čechov - Kid Yugi 3:11
    'music/14.mp3': 146,  // Il Filmografo - Kid Yugi 2:26
    'music/15.mp3': 117,  // Yung 3P 3 - Kid Yugi 1:57
    'music/93.mp3': 116,  // Hybris - Kid Yugi 1:56
    'music/94.mp3': 180,  // Kabuki - Kid Yugi 3:00
    'music/95.mp3': 175,  // No Gimmick - Kid Yugi 2:55
    'music/96.mp3': 207,  // Sturm und drang - Kid Yugi 3:27
    'music/97.mp3': 145,  // Back n' Forth (ft. Kira) - Kid Yugi 2:25
    'music/98.mp3': 151,  // King Lear (ft. Sosa Priority) - Kid Yugi 2:31
    'music/99.mp3': 182,  // Paradise Now - Kid Yugi 3:02

    // Sfera Ebbasta
    'music/16.mp3': 185,  // Ricchi x Sempre - Sfera Ebbasta (3:05)
    'music/17.mp3': 205,  // Sciroppo (ft. DrefGold) - Sfera Ebbasta (3:25)
    'music/18.mp3': 185,  // Tran Tran - Sfera Ebbasta (3:05)
    'music/19.mp3': 189,  // Bancomat - Sfera Ebbasta (3:09)
    'music/20.mp3': 200,  // Serpenti a Sonagli - Sfera Ebbasta (3:20)
    'music/87.mp3': 183,  // Uber - Sfera Ebbasta (3:03)
    'music/88.mp3': 184,  // Leggenda - Sfera Ebbasta (3:04)
    'music/89.mp3': 210,  // Rockstar - Sfera Ebbasta (3:30)
    'music/90.mp3': 160,  // 20 Collane (ft. Rich The Kid) - Sfera Ebbasta (2:40)
    'music/91.mp3': 210,  // Cupido (ft. Quavo) - Sfera Ebbasta (3:30)
    'music/92.mp3': 143,  // XNX - Sfera Ebbasta (2:23)

    // Baby Gang (Ep2)
    'music/21.mp3': 182,  // Paranoia - Baby Gang (3:02)
    'music/22.mp3': 166,  // Combattere - Baby Gang (2:46)
    'music/23.mp3': 160,  // Carico - Baby Gang (2:40)
    'music/24.mp3': 143,  // 2000 - Baby Gang (2:23)
    'music/25.mp3': 144,  // Cella 3 - Baby Gang (2:24)
    'music/26.mp3': 217,  // Mentalité - Baby Gang (3:37)
    'music/27.mp3': 212,  // Lei - Baby Gang (3:32)
    'music/28.mp3': 169,  // Mamacita - Baby Gang (2:49)

    // UTOPIA - Travis Scott
    'music/29.mp3': 222,  // HYAENA - Travis Scott (3:42)
    'music/30.mp3': 184,  // THANK GOD - Travis Scott (3:04)
    'music/31.mp3': 255,  // MODERN JAM (Ft. Teezo Touchdown) - Travis Scott (4:15)
    'music/32.mp3': 251,  // MY EYES - Travis Scott (4:11)
    'music/33.mp3': 127,  // GOD’S COUNTRY - Travis Scott (2:07)
    'music/34.mp3': 204,  // SIRENS - Travis Scott (3:24)
    'music/35.mp3': 246,  // MELTDOWN (Ft. Drake) - Travis Scott (4:06)
    'music/36.mp3': 191,  // FE!N (Ft. Playboi Carti) - Travis Scott (3:11)
    'music/37.mp3': 274,  // DELRESTO (ECHOES) - Beyoncé & Travis Scott (4:34)
    'music/38.mp3': 211,  // I KNOW ? - Travis Scott (3:31)
    'music/39.mp3': 223,  // TOPIA TWINS (Ft. 21 Savage & Rob49) - Travis Scott (3:43)
    'music/40.mp3': 258,  // CIRCUS MAXIMUS (Ft. Swae Lee & The Weeknd) - Travis Scott (4:18)
    'music/41.mp3': 154,  // PARASAIL (Ft. Dave Chappelle & Yung Lean) - Travis Scott (2:34)
    'music/42.mp3': 366,  // SKITZO (Ft. Young Thug) - Travis Scott (6:06)
    'music/43.mp3': 163,  // LOST FOREVER (Ft. Westside Gunn) - Travis Scott (2:43)
    'music/44.mp3': 226,  // LOOOVE (Ft. Kid Cudi) - Travis Scott (3:46)
    'music/45.mp3': 185,  // K-POP (Ft. Bad Bunny & The Weeknd) - Travis Scott (3:05)
    'music/46.mp3': 353,  // TELEKINESIS (Ft. Future & SZA) - Travis Scott (5:53)

    // 20 capo plaza 
    'music/47.mp3': 241,  // 20 - Capo Plaza (4:01)
    'music/48.mp3': 180,  // Giù da me - Capo Plaza (3:00)
    'music/49.mp3': 185,  // Tesla (Ft. DrefGold & Sfera Ebbasta) - Capo Plaza (3:05)
    'music/50.mp3': 146,  // Nike Boy - Capo Plaza (2:26)
    'music/51.mp3': 197,  // Come me - Capo Plaza (3:17)
    'music/52.mp3': 208,  // J$ JP - Capo Plaza (3:28)
    'music/53.mp3': 135,  // Interlude (Ora è la mia ora) - Capo Plaza (2:15)
    'music/54.mp3': 234,  // Ne è valsa la pena (Ft. Ghali) - Capo Plaza (3:54)
    'music/55.mp3': 208,  // Non cambierò mai - Capo Plaza (3:28)
    'music/56.mp3': 194,  // Taxi - Capo Plaza (3:14)
    'music/57.mp3': 208,  // Uno squillo - Capo Plaza (3:28)
    'music/58.mp3': 195,  // Vabbene - Capo Plaza (3:15)
    'music/59.mp3': 219,  // Forte e chiaro - Capo Plaza (3:39)
    'music/60.mp3': 221,  // Giovane fuoriclasse - Capo Plaza (3:41)

    // I Nomi del Diavolo - Kid Yugi
    'music/100.mp3': 135,  // L’Anticristo (2:15)
    'music/101.mp3': 195,  // Capra a tre Teste (Ft. Artie 5ive & Tony Boy) (3:15)
    'music/102.mp3': 160,  // Eva (Ft. Tedua) (2:40)
    'music/103.mp3': 206,  // Servizio (Ft. Noyz Narcos & Papa V) (3:26)
    'music/104.mp3': 193,  // Il Signore delle Mosche (3:13)
    'music/105.mp3': 164,  // Lilith (2:44)
    'music/106.mp3': 185,  // Nemico (Ft. Ernia) (3:05)
    'music/107.mp3': 144,  // Denaro (Ft. Simba La Rue) (2:24)
    'music/108.mp3': 185,  // Yung 3p 4 (3:05)
    'music/109.mp3': 186,  // Terr1 (Ft. Geolier) (3:06)
    'music/110.mp3': 188,  // Ilva (Fume scure rmx) (Ft. Fido Guido) (3:08)
    'music/111.mp3': 174,  // Paganini (2:54)
    'music/112.mp3': 178,  // Ex Angelo (Ft. Sfera Ebbasta) (2:58)
    'music/113.mp3': 180,  // Lucifero (3:00)

    // Morad
    'music/114.mp3': 160,  // Cristales (2:40)
    'music/115.mp3': 185,  // Paz (by Morad & NICKI NICOLE) (3:05)
    'music/116.mp3': 174,  // Mi Barrio (2:54)
    'music/117.mp3': 203,  // No Estuviste En Lo Malo (3:23)
    'music/118.mp3': 202,  // Andando (by Morad, Eladio Carrión & Beny Jr) (3:22)
    'music/119.mp3': 178,  // Soledad (2:58)
    'music/120.mp3': 185,  // Estopa (3:05)
    'music/121.mp3': 183,  // Niños Pequeños (3:03)
    'music/122.mp3': 207,  // María (Ft. Ninho) (3:27)
    'music/123.mp3': 174,  // Poporopa (2:54)
    'music/124.mp3': 173,  // Se Grita (Ft. JuL) (2:53)
    'music/125.mp3': 177,  // Por Los Míos (2:57)
    'music/126.mp3': 190,  // Ojos Sin Ver (by Morad & ElGrandeToto) (3:10)
    'music/127.mp3': 175,  // Desespero (by Morad & Rvfv) (2:55)
    'music/128.mp3': 195,  // Problemas (3:15)
    'music/129.mp3': 174,  // Walou Bla Bla (2:54)
    'music/130.mp3': 180,  // Un Amigo Me Falló (3:00)
    'music/131.mp3': 185,  // Tiempo de Nada (3:05)
    'music/132.mp3': 180,  // Caballero (3:00)

    // in piazza ci muori 
    'music/133.mp3': 207, // Napoletano - 3:27
    'music/134.mp3': 185, // Piazza di spaccio 2 (Ft. Simba La Rue) - 3:05
    'music/135.mp3': 174, // Fuori Milano - 2:54
    'music/136.mp3': 190, // Regole del blocco (Ft. Sacky) - 3:10
    'music/137.mp3': 202, // Gomorra (Ft. Artie 5ive) - 3:22
    'music/138.mp3': 169, // Gucci bag - 2:49
    'music/139.mp3': 213, // Gangsta life (Ft. Fre_nky & MadPrince (ITA)) - 3:33
    'music/140.mp3': 201, // Piove (Ft. Neima Ezza) - 3:21
    'music/141.mp3': 196, // Sotto indagine (Ft. Savage 167) - 3:16
    'music/142.mp3': 225, // L’ultima notte - 3:45

    //fsk trapshit revenge 
   'music/143.mp3': 225,  // BLA BLA - 3:45
  'music/144.mp3': 192,  // ANSIA NO - 3:12
  'music/145.mp3': 198,  // CAMOSCIO - 3:18
  'music/146.mp3': 209,  // CAPI DELLA TRAP (Ft. Guè) - 3:29
  'music/147.mp3': 185,  // NON FARCELO FARE - 3:05
  'music/148.mp3': 176,  // FRAGOLA EROINA - 2:56
  'music/149.mp3': 215,  // PIÙ DI UN KILO - 3:35
  'music/150.mp3': 172,  // UP - 2:52
  'music/151.mp3': 202,  // NO SPIE - 3:22
  'music/152.mp3': 189,  // CATENE JESUS - 3:09
  'music/153.mp3': 207,  // 4L (Ft. Rosa Chemical) - 3:27
  'music/154.mp3': 191,  // OK NO PLAY - 3:11
  'music/155.mp3': 223,  // LA PROVA DEL CUOCO - 3:43
  'music/156.mp3': 195,  // MELISSA P - 3:15
  'music/157.mp3': 169,  // NON E' MIA - 2:49
  'music/158.mp3': 200,  // CANOTTIERA WHITE - 3:20
  'music/159.mp3': 190,  // ABBIAMO - 3:10
  'music/160.mp3': 213,  // PICKUP (Ft. DAYTONA KK) - 3:33

  //milano demons
   'music/161.mp3': 199,  // Milano Demons - 3:19
  'music/162.mp3': 171,  // Cup - 2:51
  'music/163.mp3': 188,  // Vorrei (Ft. Lazza) - 3:08
  'music/164.mp3': 158,  // Take 4 - 2:38
  'music/165.mp3': 209,  // Rollie AP (Ft. Pyrex & Slings) - 3:29
  'music/166.mp3': 185,  // Cellphone (Ft. Bianca Costa & Rhove) - 3:05
  'music/167.mp3': 187,  // Diamante - 3:07
  'music/168.mp3': 195,  // Non è Easy - 3:15
  'music/169.mp3': 75,   // Messaggio in Segreteria (interlude) - 1:15
  'music/170.mp3': 211,  // Cicatrici (Ft. Tedua) - 3:31
  'music/171.mp3': 185,  // Non lo Sai - 3:05
  'music/172.mp3': 182,  // Naturale - 3:02
  'music/173.mp3': 192,  // Alleluia (Ft. Sfera Ebbasta) - 3:12
  'music/174.mp3': 206,  // Soldi Puliti - 3:26
  'music/175.mp3': 187,  // Dimenticare (Ft. Federica Abbate) - 3:07
  'music/176.mp3': 189,  // Un Altro Show (Ft. Geolier) - 3:09
  'music/177.mp3': 194,  // Se Fosse Per Me - 3:14
  'music/178.mp3': 116,  // 3 Stick Freestyle - 1:56

  //sfera ebbasta 
    'music/179.mp3': 199, // Equilibrio - 3:19
  'music/180.mp3': 187, // Figli Di Papà - 3:07
  'music/181.mp3': 205, // Balenciaga (Ft. SCH) - 3:25
  'music/182.mp3': 216, // Notti - 3:36
  'music/183.mp3': 198, // Visiera A Becco - 3:18
  'music/184.mp3': 196, // No No - 3:16
  'music/185.mp3': 196, // BRNBQ - 3:16
  'music/186.mp3': 191, // Bang Bang - 3:11
  'music/187.mp3': 202, // Quello Che Non Va - 3:22
  'music/188.mp3': 220, // Cartine Cartier by SCH (Ft. Sfera Ebbasta) - 3:40
  'music/189.mp3': 190, // BHMG - 3:10

  //salvatore vive
  'music/190.mp3': 177, // Salvatore vive - Paky - 2:57
  'music/191.mp3': 135, // Belen - Paky - 2:15
  'music/192.mp3': 125, // Sharm El Sheikh - Paky - 2:05
  'music/193.mp3': 194, // La Bellavita (Ft. JuL) - Paky - 3:14
  'music/194.mp3': 192, // Onore e rispetto - Paky - 3:12
  'music/195.mp3': 170, // Intro - Paky - 2:50
  'music/196.mp3': 124, // 100 Uomini - Paky - 2:04
  'music/197.mp3': 175, // Blauer - Paky - 2:55
  'music/198.mp3': 122, // No wallet (Ft. Marracash) - Paky - 2:02
  'music/199.mp3': 122, // Pascià - Paky - 2:02
  'music/200.mp3': 159, // Auto tedesca - Paky - 2:39
  'music/201.mp3': 181, // Star (Ft. Shiva) - Paky - 3:01
  'music/202.mp3': 213, // Salvatore - Paky - 3:33
  'music/203.mp3': 164, // Quando piove - Paky - 2:44
  'music/204.mp3': 184, // Vivi o muori (Ft. Guè) - Paky - 3:04
  'music/205.mp3': 193, // Vita sbagliata - Paky - 3:13
  'music/206.mp3': 189, // Comandamento (Ft. Geolier) - Paky - 3:09
  'music/207.mp3': 170, // Giorno del giudizio (Ft. Luchè & Mahmood) - Paky - 2:50
  'music/208.mp3': 186, // Mi manchi - Paky - 3:06
  'music/209.mp3': 167, // Storie tristi - Paky - 2:47
  'music/210.mp3': 170, // Mama I’m a Criminal - Paky - 2:50
  'music/211.mp3': 104  // Bronx - Paky - 1:44
};

function initializeSearch() {
    logEvent('INFO', 'Inizializzazione sistema di ricerca...');
    const searchBar = document.getElementById('search-bar');
    const searchResults = document.getElementById('search-results');
    let searchTimeout;

    searchBar.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const searchTerm = e.target.value.toLowerCase().trim();
            logEvent('SEARCH', `Ricerca avviata: "${searchTerm}"`);
            
            if (searchTerm.length < 2) {
                searchResults.style.display = 'none';
                logEvent('SEARCH', 'Ricerca troppo breve, nascondo risultati');
                return;
            }

            const albums = document.querySelectorAll('.album-card');
            const results = [];

            // Cerca negli album
            albums.forEach(album => {
                const title = album.querySelector('h3').textContent.toLowerCase();
                const artist = album.dataset.artist.toLowerCase();

                if (title.includes(searchTerm) || artist.includes(searchTerm)) {
                    results.push({
                        type: 'album',
                        element: album,
                        title: title,
                        artist: artist,
                        cover: album.querySelector('img').src,
                        year: album.dataset.year
                    });
                }

                // Cerca nelle canzoni dell'album
                const listenNowButton = album.querySelector('.listen-now');
                if (listenNowButton) {
                    const songs = listenNowButton.getAttribute('data-names')?.split(',') || [];
                    const srcs = listenNowButton.getAttribute('data-src')?.split(',') || [];
                    songs.forEach((song, index) => {
                        if (song.toLowerCase().includes(searchTerm)) {
                            results.push({
                                type: 'song',
                                element: album,
                                title: song,
                                artist: artist,
                                cover: album.querySelector('img').src,
                                albumTitle: title,
                                songIndex: index,
                                src: srcs[index] ? srcs[index].trim() : undefined
                            });
                        }
                    });
                }
            });

            logEvent('SEARCH', `Trovati ${results.length} risultati per "${searchTerm}"`);
            displaySearchResults(results, searchResults);
        }, 300);
    });
    
    logEvent('SUCCESS', 'Sistema di ricerca inizializzato');
}

function displaySearchResults(results, container) {
    container.innerHTML = '';
    if (results.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    results.forEach(result => {
        const resultElement = document.createElement('div');
        resultElement.className = 'search-result';

        if (result.type === 'album') {
            resultElement.innerHTML = `
                <img src="${result.cover}" alt="Album cover" style="width: 50px; height: 50px; object-fit: cover;">
                <div class="result-info">
                    <h4>${result.title}</h4>
                    <p>${result.artist} - ${result.year}</p>
                    <span class="result-type">Album</span>
                </div>
            `;
        } else {
            resultElement.innerHTML = `
                <img src="${result.cover}" alt="Album cover" style="width: 50px; height: 50px; object-fit: cover;">
                <div class="result-info">
                    <h4>${result.title}</h4>
                    <p>${result.artist} - ${result.albumTitle}</p>
                    <span class="result-type">Canzone</span>
                </div>
            `;
        }

        resultElement.addEventListener('click', () => {
            const listenNowButton = result.element.querySelector('.listen-now');
            const searchBar = document.getElementById('search-bar');

            if (result.type === 'album') {
                listenNowButton.click();
            } else {
                // Trova l'oggetto canzone completo da allSongsData usando result.src
                const songObjectToPlay = allSongsData.find(songObj => songObj.src === result.src);
                if (songObjectToPlay) {
                    setCurrentAlbumContextFromSong(songObjectToPlay);
                    currentSongIndex = allSongsData.indexOf(songObjectToPlay);
                    playSong(songObjectToPlay);
                }
            }

            // Resetta il campo di ricerca e nascondi i risultati
            searchBar.value = '';
            container.style.display = 'none';
        });

        container.appendChild(resultElement);
    });
}

function initializeStars() {
    const starsContainer = document.querySelector('.stars');
    const numberOfStars = 1000;
    const maxSize = 2;

    starsContainer.innerHTML = '';

    for (let i = 0; i < numberOfStars; i++) {
        const star = document.createElement('div');
        star.className = 'star';

        // Posizione casuale
        const x = Math.random() * 100;
        const y = Math.random() * 300;

        // Dimensione più piccola per stelle più realistiche
        const size = 0.3 + Math.random() * maxSize;

        // Brillio più lento
        const twinkleDuration = 8 + Math.random() * 12; // 8-20 secondi per brillio

        star.style.cssText = `
            left: ${x}%;
            top: ${y}%;
            width: ${size}px;
            height: ${size}px;
            --twinkle-duration: ${twinkleDuration}s;
            animation-delay: ${Math.random() * twinkleDuration}s;
            background: rgba(255, 255, 255, ${0.3 + Math.random() * 0.4}); // Luminosità ridotta
            box-shadow: 0 0 ${size * 1.5}px rgba(255, 255, 255, 0.6);
            position: absolute;
            border-radius: 50%;
        `;

        starsContainer.appendChild(star);
    }

    // Movimento molto più lento
    let scrollPosition = 0;
    function moveStars() {
        scrollPosition += 0.01; // Drasticamente ridotta la velocità base
        const stars = document.querySelectorAll('.star');

        stars.forEach((star, index) => {
            const speed = 0.02 + (index % 5) * 0.005; // Velocità molto ridotta con più variazione
            const y = parseFloat(star.style.top) + speed;

            if (y > 300) {
                star.style.top = '-5%';
            } else {
                star.style.top = y + '%';
            }
        });

        requestAnimationFrame(moveStars);
    }

    moveStars();
}

function findNextAlbumCard() {
    const albumCards = document.querySelectorAll('.album-card');
    let currentAlbumCard = null;

    // Find current album card
    for (let i = 0; i < albumCards.length; i++) {
        if (albumCards[i].querySelector('img')?.src === currentAlbumCoverSrc) {
            currentAlbumCard = albumCards[i];
            break;
        }
    }

    if (currentAlbumCard) {
        const currentIndex = Array.from(albumCards).indexOf(currentAlbumCard);
        const nextIndex = (currentIndex + 1) % albumCards.length;
        return albumCards[nextIndex];
    }

    return null;
}

// Costruzione di allSongsData all'avvio
allSongsData = [];
document.querySelectorAll('.album-card').forEach(albumCard => {
    const listenNowButton = albumCard.querySelector('.listen-now');
    if (!listenNowButton) return;
    const srcs = listenNowButton.getAttribute('data-src').split(',');
    const names = listenNowButton.getAttribute('data-names').split(',');
    const albumName = albumCard.querySelector('h3').textContent;
    const artist = albumCard.getAttribute('data-artist');
    const cover = albumCard.querySelector('img').src;
    srcs.forEach((src, idx) => {
        allSongsData.push({
            src: src.trim(),
            name: names[idx] ? names[idx].trim() : '',
            albumName,
            artist,
            cover
        });
    });
});

// Funzione per trovare l'indice di una canzone in un album
function getSongIndexInAlbum(songSrc, albumSongs) {
    return albumSongs.findIndex(src => src === songSrc);
}

// Funzione per aggiornare il contesto album corrente in base a una canzone globale
function setCurrentAlbumContextFromSong(songData) {
    if (!songData) return;
    const albumCards = document.querySelectorAll('.album-card');
    const albumCard = albumCards[songData.originalAlbumIndex];
    if (!albumCard) return;
    const listenNowButton = albumCard.querySelector('.listen-now');
    if (!listenNowButton) return;
    currentAlbumSongs = listenNowButton.getAttribute('data-src').split(',');
    currentAlbumNames = listenNowButton.getAttribute('data-names').split(',');
    currentAlbumCoverSrc = albumCard.querySelector('img').src;
    currentSongIndex = songData.originalSongIndexInAlbum;
    
}

// Funzione helper per normalizzare i percorsi audio
function normalizeAudioSrc(src) {
    if (src.includes('/music/')) {
        return src.substring(src.lastIndexOf('/music/') + 1); // Estrae "music/11.mp3"
    }
    return src;
}

// Funzione per aggiornare il pulsante playlist
function updatePlaylistButton() {
    const addToPlaylistButton = document.getElementById('add-to-playlist-button');
    const audioPlayer = document.getElementById('audio-player');
    
    if (!addToPlaylistButton || !audioPlayer || !audioPlayer.src) return;
    
    const myPlaylist = JSON.parse(localStorage.getItem('myPlaylist')) || [];
    const normalizedCurrentSrc = normalizeAudioSrc(audioPlayer.src);
    
    const isInPlaylist = myPlaylist.some(song => {
        const normalizedPlaylistSrc = normalizeAudioSrc(song.src);
        return normalizedPlaylistSrc === normalizedCurrentSrc;
    });
    
    if (isInPlaylist) {
        addToPlaylistButton.style.color = '#1ed760'; // Verde se in playlist
        addToPlaylistButton.title = 'Canzone già in playlist';
    } else {
        addToPlaylistButton.style.color = ''; // Colore normale
        addToPlaylistButton.title = 'Aggiungi alla mia playlist';
    }
}

// Funzione per aggiungere la canzone corrente alla playlist
function addCurrentSongToPlaylist() {
    const audioPlayer = document.getElementById('audio-player');
    const currentSong = document.getElementById('current-song');
    const currentAlbumCover = document.getElementById('current-album-cover');
    const addToPlaylistButton = document.getElementById('add-to-playlist-button');

    if (!audioPlayer || !audioPlayer.src || currentSong.textContent === 'Nessuna canzone in riproduzione') {
        alert('Nessuna canzone in riproduzione');
        return;
    }

    // Recupera la playlist dal localStorage
    let myPlaylist = JSON.parse(localStorage.getItem('myPlaylist')) || [];
    
    const normalizedCurrentSrc = normalizeAudioSrc(audioPlayer.src);
    
    // Controlla se la canzone è già nella playlist usando il percorso normalizzato
    const songAlreadyExists = myPlaylist.some(song => {
        const normalizedPlaylistSrc = normalizeAudioSrc(song.src);
        return normalizedPlaylistSrc === normalizedCurrentSrc;
    });
    
    if (songAlreadyExists) {
        alert('Questa canzone è già nella tua playlist!');
        return;
    }

    // Trova i dati della canzone corrente da allSongsData usando percorsi normalizzati
    const currentSongData = allSongsData.find(song => {
        const normalizedSongSrc = normalizeAudioSrc(song.src);
        return normalizedSongSrc === normalizedCurrentSrc;
    });
    
    logEvent('INFO', 'Ricerca canzone in allSongsData', {
        originalSrc: audioPlayer.src,
        normalizedSrc: normalizedCurrentSrc,
        found: !!currentSongData
    });
    
    if (currentSongData) {
        // Crea l'oggetto canzone con tutti i dati necessari per la playlist
        const songToAdd = {
            src: currentSongData.src,
            name: currentSongData.name,
            artist: currentSongData.artist || 'Artista Sconosciuto',
            albumName: currentSongData.albumName || '',
            cover: currentSongData.cover || currentAlbumCover.src,
            duration: audioPlayer.duration || trackDurations[currentSongData.src] || 0
        };
        
        myPlaylist.push(songToAdd);
          // Salva la playlist aggiornata nel localStorage
        localStorage.setItem('myPlaylist', JSON.stringify(myPlaylist));
        
        // Aggiorna anche i dati per la pagina playlist
        localStorage.setItem('allSongsDataStore', JSON.stringify(allSongsData));
        
        // Log per debug
        logEvent('SUCCESS', 'Canzone aggiunta alla playlist', {
            song: songToAdd.name,
            artist: songToAdd.artist,
            playlistLength: myPlaylist.length
        });
          // Mostra un feedback visivo
        alert(`"${songToAdd.name}" è stata aggiunta alla tua playlist!`);
        
        // Aggiorna il pulsante per mostrare che la canzone è ora in playlist
        updatePlaylistButton();
        
        // Effetto visivo temporaneo sul pulsante
        if (addToPlaylistButton) {
            addToPlaylistButton.style.transform = 'scale(1.2)';
            setTimeout(() => {
                addToPlaylistButton.style.transform = 'scale(1)';
            }, 300);
        }
    } else {
        logEvent('ERROR', 'Dati canzone non trovati in allSongsData', { src: audioPlayer.src });
        alert('Errore nell\'aggiungere la canzone alla playlist');
    }
}

// === FUNZIONALITÀ TESTI DELLE CANZONI - VERSIONE SUPER OTTIMIZZATA ===

// Variabili globali per i testi
let currentLyrics = '';
let lyricsLines = [];
let currentHighlightedLine = -1;
let timePerLine = 0;
let lyricsUpdateInterval = null;
let syncOffset = 0; // Offset per regolare la sincronizzazione manualmente
let autoCalibrationData = JSON.parse(localStorage.getItem('lyricsCalibration')) || {}; // Dati di calibrazione automatica
let userFeedbackCount = 0; // Contatore feedback utente
let lastSyncAccuracy = 100; // Ultima precisione rilevata

// Elementi DOM per i testi
const lyricsButton = document.getElementById('lyrics-button');
const lyricsOverlay = document.getElementById('lyrics-overlay');
const closeLyricsButton = document.getElementById('close-lyrics');
const lyricsSongTitle = document.getElementById('lyrics-song-title');
const lyricsContainer = document.getElementById('lyrics-container');
const lyricsContent = document.getElementById('lyrics-content');
const lyricsLoading = document.getElementById('lyrics-loading');
const lyricsNotFound = document.getElementById('lyrics-not-found');

/**
 * Sistema di auto-calibrazione della sincronizzazione
 */
function saveCalibrationData(artist, title, offset, accuracy) {
    const key = `${artist}_${title}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
    autoCalibrationData[key] = {
        offset: offset,
        accuracy: accuracy,
        uses: (autoCalibrationData[key]?.uses || 0) + 1,
        lastUsed: Date.now()
    };
    localStorage.setItem('lyricsCalibration', JSON.stringify(autoCalibrationData));
    logEvent('LYRICS', '💾 Dati calibrazione salvati', { key, offset, accuracy });
}

/**
 * Recupera la calibrazione salvata per una canzone
 */
function getCalibrationData(artist, title) {
    const key = `${artist}_${title}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const data = autoCalibrationData[key];
    if (data && data.accuracy > 75) { // Usa solo calibrazioni con buona accuratezza
        logEvent('LYRICS', '🎯 Calibrazione recuperata dal cache', data);
        return data.offset;
    }
    return 0;
}

/**
 * Funzione per ottenere i testi di una canzone dall'API lyrics.ovh
 * @param {string} artist - Nome dell'artista
 * @param {string} title - Titolo della canzone
 * @returns {Promise<string>} - I testi della canzone o un messaggio di errore
 */
async function getLyrics(artist, title) {
    try {
        // Pulisci e prepara i parametri per l'API
        const cleanArtist = artist.replace(/\s*\(.*?\)\s*/g, '').trim();
        const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*-.*$/, '').trim();
        
        logEvent('API', `Richiesta testi per: ${cleanArtist} - ${cleanTitle}`);
        
        const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.lyrics) {
                logEvent('SUCCESS', 'Testi ricevuti dall\'API', { 
                    artist: cleanArtist, 
                    title: cleanTitle,
                    lyricsLength: data.lyrics.length 
                });
                // Sostituisce i caratteri di nuova riga con <br> per la visualizzazione HTML
                return data.lyrics.replace(/\n/g, '<br>');
            }
        }
        
        if (response.status === 404) {
            logEvent('INFO', 'Testi non trovati (404)', { artist: cleanArtist, title: cleanTitle });
            return 'not_found';
        }
        
        throw new Error(`Errore HTTP: ${response.status}`);
    } catch (error) {
        logEvent('ERROR', 'Errore nel recupero dei testi', { 
            artist, 
            title, 
            error: error.message 
        });
        return 'not_found';
    }
}

/**
 * Mostra i testi per la canzone correntemente in riproduzione - VERSIONE OTTIMIZZATA
 */
async function showCurrentLyrics() {
    if (!currentAlbumNames[currentSongIndex]) {
        logEvent('LYRICS', 'Nessuna canzone corrente per mostrare i testi');
        showLyricsNotFound();
        return;
    }
    
    // Estrae artista e titolo dal nome della canzone
    const songName = currentAlbumNames[currentSongIndex];
    const parts = songName.split(' - ');
    let artist = '';
    let title = '';
    
    if (parts.length >= 2) {
        title = parts[0].trim();
        artist = parts[1].replace(/\s*\(.*?\).*$/, '').trim();
    } else {
        // Fallback: usa l'artista dell'album
        const albumCard = document.querySelector('.album-card');
        if (albumCard) {
            artist = albumCard.dataset.artist || '';
            title = songName.trim();
        }
    }
    
    if (!artist || !title) {
        logEvent('LYRICS', 'Impossibile estrarre artista/titolo', { songName, artist, title });
        showLyricsNotFound();
        return;
    }
    
    logEvent('LYRICS', '🎵 OTTIMIZZATO: Inizio caricamento testi', { artist, title, songName });
    
    // AUTO-CALIBRAZIONE: Recupera offset salvato per questa canzone
    const savedOffset = getCalibrationData(artist, title);
    if (savedOffset !== 0) {
        syncOffset = savedOffset;
        logEvent('SUCCESS', '🎯 Auto-calibrazione applicata!', { offset: savedOffset });
        showSyncFeedback('auto-calibrated');
    } else {
        syncOffset = 0; // Reset per nuove canzoni
    }
    
    // Aggiorna il titolo nell'overlay
    lyricsSongTitle.textContent = `${title} - ${artist}`;
    
    // Mostra lo stato di caricamento
    showLyricsLoading();
    
    try {
        const lyrics = await getLyrics(artist, title);
        
        if (lyrics === 'not_found') {
            logEvent('LYRICS', 'Testi non disponibili per questa canzone');
            showLyricsNotFound();
        } else {
            logEvent('SUCCESS', '✅ Testi caricati e visualizzati con sistema OTTIMIZZATO', { 
                linesCount: lyrics.split('<br>').length,
                autoCalibrated: savedOffset !== 0,
                offset: syncOffset
            });
            displayLyrics(lyrics);
            setupLyricsSync();
        }
    } catch (error) {
        logEvent('ERROR', 'Errore nel caricamento dei testi', error);
        showLyricsNotFound();
    }
}

/**
 * Visualizza i testi nell'overlay
 * @param {string} lyrics - I testi da visualizzare
 */
function displayLyrics(lyrics) {
    currentLyrics = lyrics;
    
    // Divide i testi in righe e crea elementi span per ogni riga
    const lines = lyrics.split('<br>').filter(line => line.trim() !== '');
    lyricsLines = lines;
    
    let lyricsHTML = '';
    lines.forEach((line, index) => {
        lyricsHTML += `<span class="lyric-line" data-line="${index}">${line.trim()}</span>`;
    });
    
    lyricsContent.innerHTML = lyricsHTML;
    
    // Nascondi loading e mostra contenuto
    lyricsLoading.style.display = 'none';
    lyricsNotFound.style.display = 'none';
    lyricsContent.style.display = 'block';
}

/**
 * Mostra lo stato di caricamento dei testi
 */
function showLyricsLoading() {
    lyricsLoading.style.display = 'flex';
    lyricsContent.style.display = 'none';
    lyricsNotFound.style.display = 'none';
}

/**

 * Mostra il messaggio quando i testi non sono trovati
 */
function showLyricsNotFound() {
    lyricsLoading.style.display = 'none';
    lyricsContent.style.display = 'none';
    lyricsNotFound.style.display = 'block';
}

/**
 * Configura la sincronizzazione dei testi con l'audio - VERSIONE OTTIMIZZATA
 */
function setupLyricsSync() {
    const audioPlayer = document.getElementById('audio-player');
    
    if (!audioPlayer || lyricsLines.length === 0) return;
    
    // Calcola la sincronizzazione ottimizzata
    const updateOptimizedSync = () => {
        if (audioPlayer.duration && audioPlayer.duration > 0) {
            // Analizza la struttura dei testi per sincronizzazione adattiva
            const lyricsAnalysis = analyzeLyricsStructure(lyricsLines);
            timePerLine = calculateAdaptiveSync(audioPlayer.duration, lyricsAnalysis);
            
            logEvent('LYRICS', `Sincronizzazione OTTIMIZZATA configurata:`, {
                duration: audioPlayer.duration,
                lines: lyricsLines.length,
                avgTimePerLine: timePerLine.toFixed(2),
                analysis: lyricsAnalysis
            });
        }
    };
    
    // Controlla se i metadati sono già caricati
    if (audioPlayer.readyState >= 1) {
        updateOptimizedSync();
    } else {
        audioPlayer.addEventListener('loadedmetadata', updateOptimizedSync);
    }
    
    // Rimuovi il listener precedente se esiste
    audioPlayer.removeEventListener('timeupdate', updateLyricsHighlightOptimized);
    
    // Aggiungi il nuovo listener ottimizzato
    audioPlayer.addEventListener('timeupdate', updateLyricsHighlightOptimized);
}

/**
 * Analizza la struttura dei testi per ottimizzare la sincronizzazione
 */
function analyzeLyricsStructure(lines) {
    let analysis = {
        verses: 0,
        choruses: 0,
        bridges: 0,
        emptyLines: 0,
        shortLines: 0,
        longLines: 0,
        repetitions: 0
    };
    
    const seenLines = new Map();
    
    lines.forEach(line => {
        const cleanLine = line.trim().toLowerCase();
        
        if (cleanLine === '') {
            analysis.emptyLines++;
        } else if (cleanLine.length < 20) {
            analysis.shortLines++;
        } else if (cleanLine.length > 80) {
            analysis.longLines++;
        }
        
        // Rileva ripetizioni (possibili ritornelli)
        if (seenLines.has(cleanLine)) {
            analysis.repetitions++;
            if (cleanLine.includes('chorus') || cleanLine.includes('ritornello')) {
                analysis.choruses++;
            }
        } else {
            seenLines.set(cleanLine, 1);
        }
        
        // Rileva versi e bridge
        if (cleanLine.includes('verse') || cleanLine.includes('strofa')) {
            analysis.verses++;
        } else if (cleanLine.includes('bridge') || cleanLine.includes('ponte')) {
            analysis.bridges++;
        }
    });
    
    return analysis;
}

/**
 * Calcola sincronizzazione adattiva basata sull'analisi dei testi
 */
function calculateAdaptiveSync(duration, analysis) {
    const totalLines = lyricsLines.length;
    const contentLines = totalLines - analysis.emptyLines;
    
    // Base: divisione uniforme
    let baseTime = duration / contentLines;
    
    // Fattori di correzione basati sulla struttura
    let adjustmentFactor = 1.0;
    
    // Righe corte (hook, ritornelli) → tempo più breve
    if (analysis.shortLines > totalLines * 0.3) {
        adjustmentFactor *= 0.9;
    }
    
    // Molte ripetizioni (canzone pop) → ritmo più veloce
    if (analysis.repetitions > totalLines * 0.2) {
        adjustmentFactor *= 0.95;
    }
    
    // Righe lunghe (rap, versi complessi) → più tempo
    if (analysis.longLines > totalLines * 0.2) {
        adjustmentFactor *= 1.1;
    }
    
    return baseTime * adjustmentFactor;
}

/**
 * Aggiorna l'evidenziazione dei testi - VERSIONE SUPER OTTIMIZZATA
 */
function updateLyricsHighlightOptimized() {
    const audioPlayer = document.getElementById('audio-player');
    
    if (!audioPlayer || !timePerLine || lyricsLines.length === 0) return;
    
    // Applica l'offset di sincronizzazione
    const currentTime = audioPlayer.currentTime + syncOffset;
    
    // Sistema di sincronizzazione AVANZATO con predizione intelligente
    let currentLineIndex;
    
    // Calcolo dinamico basato su pattern dei testi
    if (lyricsLines.length > 0) {
        // Algoritmo predittivo: considera la posizione nella canzone
        const songProgress = currentTime / audioPlayer.duration;
        
        // Base calculation con correzione dinamica
        const baseIndex = Math.floor(currentTime / timePerLine);
        
        // Correzione per parti diverse della canzone
        let correctionFactor = 1.0;
        
        // Inizio canzone (primi 20%) → ritmo più lento
        if (songProgress < 0.2) {
            correctionFactor = 0.85;
        }
        // Metà canzone (20-80%) → ritmo normale/veloce
        else if (songProgress >= 0.2 && songProgress <= 0.8) {
            correctionFactor = 1.05;
        }
        // Fine canzone (ultimi 20%) → ritmo più lento
        else {
            correctionFactor = 0.9;
        }
        
        currentLineIndex = Math.floor(baseIndex * correctionFactor);
    }
    
    // Limita l'indice e applica smooth transition
    const validLineIndex = Math.max(0, Math.min(currentLineIndex, lyricsLines.length - 1));
    
    // Transizione fluida: evita salti troppo bruschi
    if (Math.abs(validLineIndex - currentHighlightedLine) > 3 && currentHighlightedLine >= 0) {
        // Se il salto è troppo grande, fai una transizione graduale
        const step = validLineIndex > currentHighlightedLine ? 1 : -1;
        currentLineIndex = currentHighlightedLine + step;
        
        logEvent('LYRICS', '🔧 Transizione graduale applicata per evitare salti bruschi');
    }
    
    if (validLineIndex !== currentHighlightedLine && validLineIndex >= 0) {
        // Rimuovi l'evidenziazione dalla riga precedente con animazione
        if (currentHighlightedLine >= 0) {
            const prevLine = lyricsContent.querySelector(`[data-line="${currentHighlightedLine}"]`);
            if (prevLine) {
                prevLine.classList.remove('highlight');
                prevLine.style.transition = 'all 0.3s ease';
            }
        }
        
        // Aggiungi l'evidenziazione alla riga corrente con effetto anticipato
        const currentLine = lyricsContent.querySelector(`[data-line="${validLineIndex}"]`);
        if (currentLine) {
            currentLine.classList.add('highlight');
            currentLine.style.transition = 'all 0.5s ease';
            
            // Pre-scroll: evidenzia anche la riga successiva molto leggermente
            const nextLine = lyricsContent.querySelector(`[data-line="${validLineIndex + 1}"]`);
            if (nextLine) {
                nextLine.style.opacity = '0.7';
                nextLine.style.transform = 'scale(1.02)';
                
                setTimeout(() => {
                    nextLine.style.opacity = '1';
                    nextLine.style.transform = 'scale(1)';
                }, 300);
            }
            
            // Scrolling intelligente con previsione
            currentLine.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            
            // Effetto di pulsazione sulla riga attiva
            currentLine.style.animation = 'lyrics-pulse 0.6s ease-out';
            setTimeout(() => {
                currentLine.style.animation = '';
            }, 600);
        }
        
        currentHighlightedLine = validLineIndex;
        
        // Calcola precisione della sincronizzazione
        const expectedTime = validLineIndex * timePerLine;
        const timeDiff = Math.abs(currentTime - expectedTime);
        const accuracy = Math.max(0, 100 - (timeDiff * 20)); // 20 = fattore di penalità
        
        logEvent('LYRICS', `🎯 Sync OTTIMIZZATO: ${currentTime.toFixed(1)}s → Riga ${validLineIndex + 1}/${lyricsLines.length}`, {
            offset: syncOffset.toFixed(1),
            accuracy: accuracy.toFixed(1) + '%',
            timeDiff: timeDiff.toFixed(2) + 's'
        });
    }
}

/**
 * Apre l'overlay dei testi
 */
function openLyricsOverlay() {
    logEvent('LYRICS', 'Apertura overlay testi');
    lyricsOverlay.classList.add('active');
    lyricsButton.classList.add('active');
    
    // Carica i testi per la canzone corrente
    showCurrentLyrics();
}

/**
 * Chiude l'overlay dei testi
 */
function closeLyricsOverlay() {
    logEvent('LYRICS', 'Chiusura overlay testi');
    lyricsOverlay.classList.remove('active');
    lyricsButton.classList.remove('active');
    
    // Reset dell'evidenziazione
    currentHighlightedLine = -1;
    
    // Rimuovi tutti gli highlight
    const highlightedLines = lyricsContent.querySelectorAll('.lyric-line.highlight');
    highlightedLines.forEach(line => line.classList.remove('highlight'));
}

// Gesture touch support per dispositivi mobili
let touchStartY = 0;
let touchStartX = 0;
let lastTouchTime = 0;

if (lyricsOverlay) {
    lyricsOverlay.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        lastTouchTime = Date.now();
    });
    
    lyricsOverlay.addEventListener('touchend', (e) => {
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        const deltaY = touchStartY - touchEndY;
        const deltaX = touchStartX - touchEndX;
        const touchDuration = Date.now() - lastTouchTime;
        
        // Rilevamento gesture
        if (touchDuration < 300) { // Swipe veloce
            if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 50) {
                if (deltaY > 0) {
                    // Swipe up - anticipa la sincronizzazione
                    syncOffset += 0.5;
                    showSyncFeedback('+');
                    logEvent('LYRICS', '📱 Swipe up - sincronizzazione anticipata');
                } else {
                    // Swipe down - ritarda la sincronizzazione
                    syncOffset -= 0.5;
                    showSyncFeedback('-');
                    logEvent('LYRICS', '📱 Swipe down - sincronizzazione ritardata');
                }
                e.preventDefault();
            } else if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                if (deltaX > 0) {
                    // Swipe left - riga successiva
                    if (currentHighlightedLine < lyricsLines.length - 1) {
                        jumpToLyricLine(currentHighlightedLine + 1);
                        logEvent('LYRICS', '📱 Swipe left - riga successiva');
                    }
                } else {
                    // Swipe right - riga precedente
                    if (currentHighlightedLine > 0) {
                        jumpToLyricLine(currentHighlightedLine - 1);
                        logEvent('LYRICS', '📱 Swipe right - riga precedente');
                    }
                }
                e.preventDefault();
            }
        }
    });
}

// === LOGGING SISTEMA COMPLETATO ===
logEvent('SUCCESS', '=== SISTEMA DI LOGGING ATTIVATO ===');
logEvent('INFO', 'Tutti gli eventi verranno tracciati nella console del browser');
logEvent('INFO', 'Per attivare i log su schermo, cambia LOG_CONFIG.logToScreen = true');

// === MEDIA SESSION API INTEGRATION ===

/**
 * Configurazione e gestione della Media Session API per controlli sistema operativo
 * Supporta Windows 10/11 Media Controls e Android/Chrome Browser Media Controls
 */

/**
 * Inizializza la Media Session API con gestori di eventi
 */
function initializeMediaSession() {
    if ('mediaSession' in navigator) {
        logEvent('API', 'Media Session API supportata - Inizializzazione controlli sistema');
        
        // Configura i gestori di azioni per i media controls del sistema
        navigator.mediaSession.setActionHandler('play', () => {
            logEvent('API', 'Media Session: Richiesta PLAY dal sistema');
            if (audioPlayer.paused) {
                audioPlayer.play()
                    .then(() => {
                        isPlaying = true;
                        document.getElementById('play-pause').innerHTML = '<i class="bi bi-pause-fill"></i>';
                        logEvent('SUCCESS', 'Riproduzione avviata tramite controlli sistema');
                    })
                    .catch(error => {
                        logEvent('ERROR', 'Errore riproduzione da controlli sistema', error);
                    });
            }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            logEvent('API', 'Media Session: Richiesta PAUSE dal sistema');
            if (!audioPlayer.paused) {
                audioPlayer.pause();
                isPlaying = false;
                document.getElementById('play-pause').innerHTML = '<i class="bi bi-play-fill"></i>';
                logEvent('SUCCESS', 'Riproduzione messa in pausa tramite controlli sistema');
            }
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
            logEvent('API', 'Media Session: Richiesta PREVIOUS dal sistema');
            document.getElementById('prev-song').click();
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            logEvent('API', 'Media Session: Richiesta NEXT dal sistema');
            document.getElementById('next-song').click();
        });

        // Gestori aggiuntivi per controlli avanzati (se supportati)
        try {
            navigator.mediaSession.setActionHandler('stop', () => {
                logEvent('API', 'Media Session: Richiesta STOP dal sistema');
                audioPlayer.pause();
                audioPlayer.currentTime = 0;
                isPlaying = false;
                document.getElementById('play-pause').innerHTML = '<i class="bi bi-play-fill"></i>';
            });

            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                logEvent('API', 'Media Session: Richiesta SEEK BACKWARD dal sistema');
                const skipTime = details.seekOffset || 10;
                audioPlayer.currentTime = Math.max(audioPlayer.currentTime - skipTime, 0);
            });

            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                logEvent('API', 'Media Session: Richiesta SEEK FORWARD dal sistema');
                const skipTime = details.seekOffset || 10;
                audioPlayer.currentTime = Math.min(audioPlayer.currentTime + skipTime, audioPlayer.duration);
            });

            navigator.mediaSession.setActionHandler('seekto', (details) => {
                logEvent('API', 'Media Session: Richiesta SEEK TO dal sistema');
                if (details.seekTime) {
                    audioPlayer.currentTime = details.seekTime;
                }
            });
        } catch (error) {
            logEvent('INFO', 'Alcuni controlli media avanzati non supportati', error.message);
        }

        logEvent('SUCCESS', 'Media Session API configurata con successo');
    } else {
        logEvent('INFO', 'Media Session API non supportata in questo browser');
    }
}

/**
 * Aggiorna i metadata della Media Session con i dati della canzone corrente
 * @param {Object} songData - Dati della canzone corrente
 */
function updateMediaSessionMetadata(songData) {
    if (!('mediaSession' in navigator) || !songData) {
        return;
    }

    try {
        // Estrai informazioni dalla canzone
        const title = songData.name || 'Sconosciuto';
        const artist = songData.artist || 'Artista sconosciuto';
        const album = songData.albumName || 'Album sconosciuto';
        
        // Converti il path relativo in URL assoluto per la cover
        let artworkUrl = songData.cover;
        if (artworkUrl && !artworkUrl.startsWith('http')) {
            // Se è un path relativo, convertilo in URL assoluto
            artworkUrl = new URL(artworkUrl, window.location.origin).href;
        }

        // Crea i metadata per la Media Session
        const metadata = {
            title: title,
            artist: artist,
            album: album,
            artwork: []
        };

        // Aggiungi l'artwork se disponibile
        if (artworkUrl) {
            // Supporta diverse dimensioni per massima compatibilità
            const artworkSizes = [
                { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '192x192', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '384x384', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }
            ];
            metadata.artwork = artworkSizes;
        }

        // Aggiorna i metadata della Media Session
        navigator.mediaSession.metadata = new MediaMetadata(metadata);

        logEvent('API', 'Media Session metadata aggiornati', {
            title: title,
            artist: artist,
            album: album,
            hasArtwork: !!artworkUrl
        });

        // Aggiorna anche il playback state
        navigator.mediaSession.playbackState = audioPlayer.paused ? 'paused' : 'playing';

    } catch (error) {
        logEvent('ERROR', 'Errore aggiornamento Media Session metadata', error);
    }
}

/**
 * Aggiorna lo stato di riproduzione nella Media Session
 * @param {string} state - 'playing', 'paused', o 'none'
 */
function updateMediaSessionPlaybackState(state) {
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.playbackState = state;
            logEvent('API', `Media Session playback state aggiornato: ${state}`);
        } catch (error) {
            logEvent('ERROR', 'Errore aggiornamento playback state', error);
        }
    }
}

// === FINE MEDIA SESSION API ===
