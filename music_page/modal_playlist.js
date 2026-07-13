// ================================================================
// === MODALE FULLSCREEN NOW PLAYING (adattato per playlist.js) ===
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('nowplaying-modal');
    if (!modal) return;

    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    const fsBtn = document.getElementById('fullscreen-btn');
    const closeBtn = document.getElementById('nowplaying-close');
    const ap = document.getElementById('audio-player');

    // Elementi UI Modal
    const npCover = document.getElementById('nowplaying-cover');
    const npCoverGlow = document.getElementById('nowplaying-cover-glow');
    const npTitle = document.getElementById('nowplaying-title');
    const npArtist = document.getElementById('nowplaying-artist-name');
    const npAlbum = document.getElementById('nowplaying-album-name');
    const npCurrentTime = document.getElementById('np-current-time');
    const npTotalTime = document.getElementById('np-total-duration');
    const npProgressBar = document.getElementById('np-progress-bar');
    const npPlayPauseBtn = document.getElementById('np-play-pause');
    const npPrevBtn = document.getElementById('np-prev');
    const npNextBtn = document.getElementById('np-next');
    const npLikeBtn = document.getElementById('np-like');
    
    // Testi
    const lyricsBody = document.getElementById('np-lyrics-body');
    const lyricsContent = document.getElementById('np-lyrics-content');
    const lyricsLoading = document.getElementById('np-lyrics-loading');
    const lyricsNotFound = document.getElementById('np-lyrics-notfound');
    let lyricsCache = {};
    let lyricsOffset = 0;
    
    // Visualizer
    const canvas = document.getElementById('nowplaying-visualizer');
    const ctx = canvas.getContext('2d');
    let visualizerAnimationFrame;

    function openNowPlayingModal() {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        updateNowPlayingUI();
        startVisualizer();
        loadNpLyrics();
    }

    function closeNowPlayingModal() {
        modal.classList.remove('open');
        document.body.style.overflow = '';
        if (visualizerAnimationFrame) cancelAnimationFrame(visualizerAnimationFrame);
    }

    fsBtn?.addEventListener('click', openNowPlayingModal);
    closeBtn?.addEventListener('click', closeNowPlayingModal);

    function getCurrentSongData() {
        if (!ap || !ap.src) return null;
        const norm = normalizeAudioSrc(ap.src);
        return ALL_AVAILABLE_SONGS.find(s => normalizeAudioSrc(s.src) === norm) || null;
    }

    function updateNowPlayingUI() {
        if (!modal.classList.contains('open')) return;
        const songData = getCurrentSongData();
        if (!songData) {
            npTitle.textContent = "Nessuna canzone";
            npArtist.textContent = "-";
            npAlbum.textContent = "-";
            npCover.src = "../images/placeholder-album.png";
            npCoverGlow.style.backgroundImage = "none";
            return;
        }

        npTitle.textContent = songData.name;
        npArtist.textContent = songData.artist || 'Sconosciuto';
        npAlbum.textContent = songData.albumName || '-';
        npCover.src = songData.cover || '../images/placeholder-album.png';
        npCoverGlow.style.backgroundImage = `url(${npCover.src})`;
        
        updateNpPlayPauseBtn();
        updateNpLikeBtn();
    }

    function updateNpPlayPauseBtn() {
        if (!ap) return;
        npPlayPauseBtn.innerHTML = ap.paused ? '<i class="bi bi-play-fill"></i>' : '<i class="bi bi-pause-fill"></i>';
    }

    function updateNpLikeBtn() {
        const songData = getCurrentSongData();
        if (!songData) return;
        const norm = normalizeAudioSrc(songData.src);
        const isLiked = likedSongs.some(s => normalizeAudioSrc(s.src) === norm);
        npLikeBtn.style.color = isLiked ? '#1ed760' : 'rgba(255,255,255,0.7)';
        npLikeBtn.innerHTML = isLiked ? '<i class="bi bi-heart-fill"></i>' : '<i class="bi bi-heart"></i>';
    }

    // Controlli Audio nel Modal
    npPlayPauseBtn?.addEventListener('click', () => {
        document.getElementById('play-pause')?.click();
        updateNpPlayPauseBtn();
    });
    npPrevBtn?.addEventListener('click', () => { document.getElementById('prev-song')?.click(); });
    npNextBtn?.addEventListener('click', () => { document.getElementById('next-song')?.click(); });
    npLikeBtn?.addEventListener('click', () => { 
        document.getElementById('like-button')?.click(); 
        updateNpLikeBtn();
    });

    // Sincronizza stato all'update di ap
    ap?.addEventListener('play', () => { updateNpPlayPauseBtn(); if(modal.classList.contains('open')) startVisualizer(); });
    ap?.addEventListener('pause', updateNpPlayPauseBtn);
    ap?.addEventListener('timeupdate', () => {
        if (!modal.classList.contains('open')) return;
        const ct = ap.currentTime;
        const dur = ap.duration || 0;
        npCurrentTime.textContent = formatTime(ct);
        npTotalTime.textContent = formatTime(dur);
        if (dur > 0) {
            npProgressBar.value = (ct / dur) * 100;
        }
        syncLyrics();
    });

    npProgressBar?.addEventListener('input', (e) => {
        if (!ap || !ap.duration) return;
        ap.currentTime = (e.target.value / 100) * ap.duration;
    });

    // Cambia canzone => aggiorna UI
    const originalPlaySong = window.playSong;
    if (originalPlaySong) {
        window.playSong = function(songData, playlist) {
            originalPlaySong(songData, playlist);
            if (modal.classList.contains('open')) {
                updateNowPlayingUI();
                loadNpLyrics();
            }
        };
    }

    // --- TESTI ---
    async function loadNpLyrics() {
        lyricsContent.innerHTML = '';
        lyricsNotFound.style.display = 'none';
        lyricsLoading.style.display = 'flex';
        lyricsOffset = 0;
        updateSyncLabel();

        const songData = getCurrentSongData();
        if (!songData) { showLyricsNotFound(); return; }

        const artist = songData.artist || '';
        const title = songData.name || '';
        const cacheKey = artist + '-' + title;

        if (lyricsCache[cacheKey]) {
            renderLyrics(lyricsCache[cacheKey]);
            return;
        }

        try {
            const cleanArtist = artist.replace(/[^a-zA-Z0-9 ]/g, "").trim() || artist;
            const cleanTitle = title.split('-')[0].replace(/[^a-zA-Z0-9 ]/g, "").trim() || title;
            const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.lyrics) {
                    const txt = data.lyrics.replace(/\n/g, '<br>');
                    lyricsCache[cacheKey] = txt;
                    renderLyrics(txt);
                    return;
                }
            }
            showLyricsNotFound();
        } catch (e) {
            showLyricsNotFound();
        }
    }

    function renderLyrics(text) {
        lyricsLoading.style.display = 'none';
        lyricsNotFound.style.display = 'none';
        const lines = text.split('<br>').filter(l => l.trim() !== '');
        lyricsContent.innerHTML = lines.map(line => `<p class="lyric-line">${line}</p>`).join('');
    }

    function showLyricsNotFound() {
        lyricsLoading.style.display = 'none';
        lyricsNotFound.style.display = 'flex';
    }

    function syncLyrics() {
        if (!ap || !lyricsContent.children.length || ap.duration === 0) return;
        const lines = lyricsContent.querySelectorAll('.lyric-line');
        const progress = Math.max(0, Math.min(1, (ap.currentTime + lyricsOffset) / ap.duration));
        const activeIndex = Math.floor(progress * lines.length);

        lines.forEach((line, i) => {
            if (i === activeIndex) {
                line.classList.add('active');
                if (line.offsetTop > lyricsBody.scrollTop + lyricsBody.clientHeight * 0.6 || 
                    line.offsetTop < lyricsBody.scrollTop) {
                    lyricsBody.scrollTo({
                        top: line.offsetTop - lyricsBody.clientHeight / 3,
                        behavior: 'smooth'
                    });
                }
            } else {
                line.classList.remove('active');
            }
        });
    }

    function updateSyncLabel() {
        const lbl = document.getElementById('np-sync-offset-label');
        if(lbl) lbl.textContent = (lyricsOffset >= 0 ? '+' : '') + lyricsOffset.toFixed(1) + 's';
    }

    document.getElementById('np-sync-minus')?.addEventListener('click', () => { lyricsOffset -= 0.5; updateSyncLabel(); });
    document.getElementById('np-sync-plus')?.addEventListener('click', () => { lyricsOffset += 0.5; updateSyncLabel(); });
    document.getElementById('np-sync-reset')?.addEventListener('click', () => { lyricsOffset = 0; updateSyncLabel(); });

    // --- VISUALIZER ---
    function startVisualizer() {
        if (!modal.classList.contains('open')) return;
        if (!window.analyser || !window.dataArray) return;
        if (visualizerAnimationFrame) cancelAnimationFrame(visualizerAnimationFrame);

        function draw() {
            if (!modal.classList.contains('open')) return;
            window.analyser.getByteFrequencyData(window.dataArray);
            
            const W = canvas.offsetWidth;
            const H = canvas.offsetHeight;
            canvas.width = W;
            canvas.height = H;

            ctx.clearRect(0, 0, W, H);
            
            const barCount = 60;
            const step = Math.floor(window.dataArray.length / barCount);
            const barWidth = (W / barCount) - 2;

            for (let i = 0; i < barCount; i++) {
                const val = window.dataArray[i * step];
                const percent = val / 255;
                const barHeight = percent * H;

                const hue = (i / barCount) * 360;
                ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.8)`;
                ctx.fillRect(i * (barWidth + 2), H - barHeight, barWidth, barHeight);
            }
            visualizerAnimationFrame = requestAnimationFrame(draw);
        }
        draw();
    }
});
