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

document.addEventListener('DOMContentLoaded', async function () {
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

    // === Lyrics: apertura/chiusura modale ===
    if (lyricsButton && lyricsOverlay) {
        lyricsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            openLyricsOverlay();
            logEvent('UI', 'Modale testi aperta');
        });

        // Chiudi con il bottone X
        if (closeLyricsButton) {
            closeLyricsButton.addEventListener('click', (e) => {
                e.stopPropagation();
                closeLyricsOverlay();
                logEvent('UI', 'Modale testi chiusa (X)');
            });
        }

        // Chiudi cliccando fuori dalla modale
        lyricsOverlay.addEventListener('click', (event) => {
            if (event.target === lyricsOverlay) {
                closeLyricsOverlay();
                logEvent('UI', 'Modale testi chiusa (click fuori)');
            }
        });

        // Chiudi con ESC
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lyricsOverlay.classList.contains('active')) {
                closeLyricsOverlay();
                logEvent('UI', 'Modale testi chiusa (ESC)');
            }
        });

        logEvent('SUCCESS', 'Event listener lyrics configurati');
    } else {
        logEvent('INFO', 'Lyrics non presente nel DOM (button/overlay mancanti)');
    }
});

// Durate delle tracce: caricate da JSON esterno per facilità di manutenzione
let trackDurations = {};

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

        // Aggiorna anche il playback state (recupera l'elemento audio in modo sicuro)
        const _audioEl = document.getElementById('audio-player');
        try {
            navigator.mediaSession.playbackState = _audioEl ? (_audioEl.paused ? 'paused' : 'playing') : 'none';
        } catch (e) {
            logEvent('ERROR', 'Errore nel settare playbackState Media Session', e);
        }

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
