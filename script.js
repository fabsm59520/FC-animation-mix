let wavesurferA, wavesurferB;
let audioContext, analyserNode;
let gainA, gainB, masterGainNode;
let filterNodeA, filterNodeB;
let eqHighA, eqMidA, eqLowA;
let eqHighB, eqMidB, eqLowB;
let destNode;
let isInitialized = false;

let currentSourceA = 'none'; 
let currentSourceB = 'none';

let ytPlayerA, ytPlayerB;
const intervalA = { id: null };
const intervalB = { id: null };

let cueA = 0, cueB = 0;
let isLoopingA = false, isLoopingB = false;

// Variables Playlist & Automix
let playlist = [];
let isAutomixActive = false;
const automixDone = { a: false, b: false };
let dragIndex = null;
function getTransition() { return parseInt(document.getElementById('transition-time')?.value, 10) || 6; }
function movePlaylist(from, to) {
    if (from === null || to < 0 || to >= playlist.length || from === to) return;
    playlist.splice(to, 0, playlist.splice(from, 1)[0]);
    renderPlaylist();
}
let lastAutomixTriggerTime = 0;

// Clé API intégrée
let dataArray, cfAnim;
function getApiKey() {
    let k = localStorage.getItem('yt_api_key');
    if (!k) { k = (prompt('Clé API YouTube (stockée uniquement dans ce navigateur) :') || '').trim(); if (k) localStorage.setItem('yt_api_key', k); }
    return k;
}
function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
}
function updateProgress(d, cur, dur) {
    document.getElementById(`time-${d}`).innerText = `${formatTime(cur)} / ${formatTime(dur)}`;
    const fill = document.getElementById(`progress-fill-${d}`), box = document.getElementById(`progress-container-${d}`);
    if (fill) fill.style.width = `${dur > 0 ? (cur / dur) * 100 : 0}%`;
    if (box) box.classList.toggle('alert-active', dur > 30 && dur - cur <= 30);
    checkAutomixTrigger(d, cur, dur);
}
function fadeCrossfaderTo(deck, ms) {
    const el = document.getElementById('crossfader');
    const from = parseFloat(el.value), to = deck === 'a' ? 0 : 1, t0 = performance.now();
    cancelAnimationFrame(cfAnim);
    const step = (t) => { const p = Math.min(1, (t - t0) / ms); el.value = from + (to - from) * p; updateMixer(); if (p < 1) cfAnim = requestAnimationFrame(step); };
    cfAnim = requestAnimationFrame(step);
}
function readTags(file, d) {
    if (!window.jsmediatags) return;
    window.jsmediatags.read(file, { onSuccess: ({ tags }) => {
        if (tags.title) document.getElementById(`title-${d}`).innerText = tags.artist ? `${tags.artist} - ${tags.title}` : tags.title;
        if (tags.picture) document.getElementById(`cover-${d}`).src = URL.createObjectURL(new Blob([new Uint8Array(tags.picture.data)], { type: tags.picture.format }));
    }, onError: () => {} });
} 

const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='50' height='50' fill='%231e1e24'/></svg>";

window.addEventListener('DOMContentLoaded', () => {
    const gradient = document.createElement('canvas').getContext('2d').createLinearGradient(0, 0, 0, 100);
    gradient.addColorStop(0, '#ff007f'); gradient.addColorStop(1, '#ff8c00');
    const wsOptions = { waveColor: '#4a148c', progressColor: gradient, barWidth: 2, barGap: 1, barRadius: 2, cursorColor: '#00c6ff', height: 50 };
    
    wavesurferA = WaveSurfer.create({ container: '#waveform-a', ...wsOptions });
    wavesurferB = WaveSurfer.create({ container: '#waveform-b', ...wsOptions });

    wavesurferA.on('timeupdate', (cur) => { if (currentSourceA === 'local') updateProgress('a', cur, wavesurferA.getDuration()); });
    wavesurferB.on('timeupdate', (cur) => { if (currentSourceB === 'local') updateProgress('b', cur, wavesurferB.getDuration()); });

    // Fin de morceau local : arrêt, remise au début, platine prête pour le suivant
    ['a', 'b'].forEach(d => {
        const ws = d === 'a' ? wavesurferA : wavesurferB;
        const btn = document.getElementById(`play-${d}`);
        ws.on('play', () => { btn.innerText = '⏸ Pause'; });
        ws.on('pause', () => { btn.innerText = '▶ Play'; });
        ws.on('finish', () => {
            if (d === 'a' ? isLoopingA : isLoopingB) return;
            const alreadyAdvanced = automixDone[d];
            ws.pause(); ws.seekTo(0);
            btn.innerText = '▶ Play';
            document.getElementById(`progress-fill-${d}`).style.width = '0%';
            document.getElementById(`progress-container-${d}`).classList.remove('alert-active');
            document.getElementById(`time-${d}`).innerText = `00:00 / ${formatTime(ws.getDuration())}`;
            if (isAutomixActive && !alreadyAdvanced && playlist.length > 0) { automixDone[d] = true; playNextInAutomix(d); }
        });
    });

    const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
});

window.onYouTubeIframeAPIReady = function() {
    const ytOptions = { height: '160', width: '100%', playerVars: { 'autoplay': 0, 'controls': 1, 'disablekb': 1, 'origin': window.location.origin } };
    
    ytPlayerA = new YT.Player('yt-player-a', {
        ...ytOptions,
        events: { 'onStateChange': (e) => handleYTStateChange(e, 'a', ytPlayerA, intervalA), 'onError': () => onYTError('a') }
    });
    ytPlayerB = new YT.Player('yt-player-b', {
        ...ytOptions,
        events: { 'onStateChange': (e) => handleYTStateChange(e, 'b', ytPlayerB, intervalB), 'onError': () => onYTError('b') }
    });
}

function handleYTStateChange(event, deckStr, player, intervalRef) {
    if (event.data == YT.PlayerState.PLAYING) {
        document.getElementById(`play-${deckStr}`).innerText = '⏸ Pause';
        const videoData = player.getVideoData();
        if (videoData && videoData.title) document.getElementById(`title-${deckStr}`).innerText = videoData.title;
        
        if (videoData && videoData.video_id) {
            document.getElementById(`cover-${deckStr}`).src = `https://img.youtube.com/vi/${videoData.video_id}/mqdefault.jpg`;
        }
        
        if (deckStr === 'a') currentSourceA = 'youtube';
        if (deckStr === 'b') currentSourceB = 'youtube';
        
        clearInterval(intervalRef.id);
        intervalRef.id = setInterval(() => {
            if(player && player.getCurrentTime) {
                updateProgress(deckStr, player.getCurrentTime(), player.getDuration());
            }
        }, 500);
    } 
    else if (event.data == YT.PlayerState.PAUSED || event.data == YT.PlayerState.ENDED) {
        document.getElementById(`play-${deckStr}`).innerText = '▶ Play';
        clearInterval(intervalRef.id);
        const containerElem = document.getElementById(`progress-container-${deckStr}`);
        if (containerElem) containerElem.classList.remove('alert-active');
        
        if (event.data == YT.PlayerState.ENDED) {
            if (deckStr === 'a' && isLoopingA) player.seekTo(0);
            else if (deckStr === 'b' && isLoopingB) player.seekTo(0);
            else if (isAutomixActive && !automixDone[deckStr]) {
                automixDone[deckStr] = true;
                playNextInAutomix(deckStr);
            }
        }
    }
    else if (event.data == YT.PlayerState.CUED) {
        const videoData = player.getVideoData();
        if (videoData && videoData.title) document.getElementById(`title-${deckStr}`).innerText = videoData.title;
        if (videoData && videoData.video_id) {
            document.getElementById(`cover-${deckStr}`).src = `https://img.youtube.com/vi/${videoData.video_id}/mqdefault.jpg`;
        }
        document.getElementById(`play-${deckStr}`).innerText = '▶ Play';
        document.getElementById(`time-${deckStr}`).innerText = `00:00 / ${formatTime(player.getDuration())}`;
    }
}

function onYTError(deckStr) {
    document.getElementById(`title-${deckStr}`).innerText = "Erreur (Bloqué)";
    document.getElementById(`play-${deckStr}`).innerText = '▶ Play';
}

function extractYTData(url) {
    let videoId = null; let listId = null;
    const vidRegex = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const vidMatch = url.match(vidRegex);
    if (vidMatch) videoId = vidMatch[1];
    const listRegex = /[?&]list=([a-zA-Z0-9_-]+)/;
    const listMatch = url.match(listRegex);
    if (listMatch) listId = listMatch[1];
    return { videoId, listId };
}

function loadYoutubeVideo(deckStr, player, forceId = null, forceTitle = null) {
    initEngine(); automixDone[deckStr] = false;
    let videoId = forceId; let listId = null;
    
    if (!videoId) {
        const url = document.getElementById(`yt-url-${deckStr}`).value.trim();
        const ytData = extractYTData(url);
        videoId = ytData.videoId; listId = ytData.listId;
    }
    
    if (!videoId && !listId) return alert("Lien invalide.");
    if (!player || typeof player.cueVideoById !== 'function') return alert("API YouTube non prête.");
    
    const ws = deckStr === 'a' ? wavesurferA : wavesurferB;
    if (ws.isPlaying()) ws.pause();
    
    if (deckStr === 'a') currentSourceA = 'youtube';
    if (deckStr === 'b') currentSourceB = 'youtube';
    
    document.getElementById(`waveform-${deckStr}`).style.display = 'none';
    document.getElementById(`yt-player-container-${deckStr}`).style.display = 'none';
    document.getElementById(`title-${deckStr}`).innerText = forceTitle ? forceTitle : "Chargement musical...";

    if (videoId) {
        document.getElementById(`cover-${deckStr}`).src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }

    if (listId) player.cuePlaylist({ list: listId, listType: 'playlist' });
    else player.cueVideoById(videoId);
    
    document.getElementById(`play-${deckStr}`).innerText = '▶ Play';
    updateMixer(); 
}

// Gestion de la Playlist & Automix
let sortKey = null, sortDir = 1, bpmQueue = Promise.resolve();
function splitTitle(t, fb) {
    const i = t.indexOf(' - ');
    return i > 0 ? { artist: t.slice(0, i).trim(), name: t.slice(i + 3).trim() } : { artist: fb || null, name: t };
}
function isoToSec(iso) {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}
async function detectBPM(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf);
    const sr = audio.sampleRate, data = audio.getChannelData(0), hop = 512;
    const start = Math.floor(Math.max(0, audio.duration / 2 - 15) * sr);
    const n = Math.floor(Math.min(data.length - start, 30 * sr) / hop);
    if (n < 200) return null;
    const flux = new Float32Array(n); let prev = 0;
    for (let i = 0; i < n; i++) {
        let e = 0; for (let j = 0; j < hop; j += 2) { const v = data[start + i * hop + j]; e += v * v; }
        e = Math.sqrt(e); flux[i] = Math.max(0, e - prev); prev = e;
    }
    const fps = sr / hop; let best = 0, bestLag = 0;
    for (let lag = Math.floor(fps * 60 / 180); lag <= Math.ceil(fps * 60 / 70); lag++) {
        let sum = 0; for (let i = lag; i < n; i++) sum += flux[i] * flux[i - lag];
        if (sum > best) { best = sum; bestLag = lag; }
    }
    return bestLag ? Math.round(fps * 60 / bestLag) : null;
}
function analyzeLocal(item) {
    const { fileObj, url } = item.sourceData;
    const a = new Audio(); a.preload = 'metadata'; a.src = url;
    a.addEventListener('loadedmetadata', () => { item.duration = a.duration; renderPlaylist(); });
    if (window.jsmediatags) window.jsmediatags.read(fileObj, { onSuccess: ({ tags }) => {
        if (tags.artist) item.artist = tags.artist; if (tags.title) item.name = tags.title; renderPlaylist();
    }, onError: () => {} });
    bpmQueue = bpmQueue.then(() => detectBPM(url)).then(b => { item.bpm = b; }, () => { item.bpm = null; }).then(renderPlaylist);
}
function sortPlaylist(key) {
    sortDir = (sortKey === key) ? -sortDir : 1; sortKey = key;
    playlist.sort((a, b) => {
        const x = a[key], y = b[key];
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y, 'fr', { sensitivity: 'base' }) : x - y) * sortDir;
    });
    renderPlaylist();
}
function addToPlaylist(title, type, sourceData, meta = {}) {
    const sp = splitTitle(type === 'local' ? title.replace(/\.[^.]+$/, '') : title, meta.artist);
    const item = { title, type, sourceData, artist: sp.artist, name: sp.name, duration: meta.duration ?? null, bpm: type === 'local' ? undefined : null };
    playlist.push(item);
    if (type === 'local') analyzeLocal(item);
    renderPlaylist();

    if (isAutomixActive && !wavesurferA.isPlaying() && !wavesurferB.isPlaying() && !ytPlayingCheck() && playlist.length === 1) {
        playNextInAutomix();
    }
}

function ytPlayingCheck() {
    try {
        return (ytPlayerA && ytPlayerA.getPlayerState && ytPlayerA.getPlayerState() === YT.PlayerState.PLAYING) ||
               (ytPlayerB && ytPlayerB.getPlayerState && ytPlayerB.getPlayerState() === YT.PlayerState.PLAYING);
    } catch(e) { return false; }
}

function renderPlaylist() {
    const container = document.getElementById('playlist-container');
    if (!container) return;

    if (playlist.length === 0) {
        container.innerHTML = '<div class="playlist-empty">Glisse ou charge des titres ici...</div>';
        return;
    }

    const table = document.createElement('table'); table.className = 'playlist-table';
    const head = table.createTHead().insertRow();
    [['#', null], ['Artiste', 'artist'], ['Titre', 'name'], ['Temps', 'duration'], ['BPM', 'bpm'], ['', null]].forEach(([label, key]) => {
        const th = document.createElement('th'); th.textContent = label + (key && key === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : '');
        if (key) { th.className = 'sortable'; th.addEventListener('click', () => sortPlaylist(key)); }
        head.appendChild(th);
    });
    const body = table.createTBody();
    playlist.forEach((item, index) => {
        const tr = body.insertRow(); tr.className = 'playlist-item'; tr.draggable = true;
        tr.addEventListener('dragstart', (e) => { dragIndex = index; e.dataTransfer.setData('text/plain', String(index)); tr.classList.add('dragging'); });
        tr.addEventListener('dragend', () => { dragIndex = null; tr.classList.remove('dragging'); });
        tr.addEventListener('dragover', (e) => { if (dragIndex !== null) { e.preventDefault(); tr.classList.add('drag-over'); } });
        tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
        tr.addEventListener('drop', (e) => { if (dragIndex === null) return; e.preventDefault(); e.stopPropagation(); movePlaylist(dragIndex, index); });
        const cells = [index + 1, item.artist || '—', item.name, item.duration ? formatTime(item.duration) : '—', item.bpm === undefined ? '…' : (item.bpm || '—')];
        cells.forEach((v, i) => { const td = tr.insertCell(); td.textContent = v; if (i === 2) td.className = 'playlist-item-title'; });
        const td = tr.insertCell(); td.className = 'playlist-item-actions';
        [['▲', () => movePlaylist(index, index - 1)], ['▼', () => movePlaylist(index, index + 1)], ['▶ A', () => loadPlaylistIndex('a', index)], ['▶ B', () => loadPlaylistIndex('b', index)], ['✖', () => removeFromPlaylist(index)]].forEach(([label, fn]) => {
            const b = document.createElement('button'); b.className = 'playlist-action-btn'; b.textContent = label; b.addEventListener('click', fn); td.appendChild(b);
        });
    });
    container.innerHTML = ''; container.appendChild(table);
}

window.removeFromPlaylist = function(index) {
    playlist.splice(index, 1);
    renderPlaylist();
};

window.clearPlaylist = function() {
    playlist = [];
    renderPlaylist();
};

window.loadPlaylistIndex = function(deckStr, index) {
    const item = playlist[index];
    if (!item) return;

    if (item.type === 'youtube') {
        const player = deckStr === 'a' ? ytPlayerA : ytPlayerB;
        loadYoutubeVideo(deckStr, player, item.sourceData, item.title);
    } else if (item.type === 'local') {
        const ws = deckStr === 'a' ? wavesurferA : wavesurferB;
        loadLocalFileFromAutomix(item.sourceData, deckStr, ws);
    }
    playlist.splice(index, 1);
    renderPlaylist();
};

function loadLocalFileFromAutomix(sourceData, deckStr, wavesurferInstance) {
    initEngine(); automixDone[deckStr] = false;
    document.getElementById(`time-${deckStr}`).innerText = "00:00 / 00:00";
    if(deckStr === 'a') currentSourceA = 'local';
    if(deckStr === 'b') currentSourceB = 'local';
    
    const player = deckStr === 'a' ? ytPlayerA : ytPlayerB;
    if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
    
    document.getElementById(`yt-player-container-${deckStr}`).style.display = 'none';
    document.getElementById(`waveform-${deckStr}`).style.display = 'block';

    const fileName = sourceData.fileObj.name || "Fichier local";
    document.getElementById(`title-${deckStr}`).innerText = fileName;
    document.getElementById(`cover-${deckStr}`).src = defaultCover;
    readTags(sourceData.fileObj, deckStr);

    wavesurferInstance.load(sourceData.url);
    document.getElementById(`play-${deckStr}`).innerText = '▶ Play';
}

document.getElementById('automix-btn').addEventListener('click', () => {
    isAutomixActive = !isAutomixActive;
    const btn = document.getElementById('automix-btn');
    if (isAutomixActive) {
        btn.classList.add('active');
        btn.innerText = '⚡ Automix : ON';
        if (!wavesurferA.isPlaying() && !wavesurferB.isPlaying() && !ytPlayingCheck() && playlist.length > 0) {
            playNextInAutomix();
        }
    } else {
        btn.classList.remove('active');
        btn.innerText = '⚡ Automix : OFF';
    }
});

function playNextInAutomix(fromDeck) {
    if (!isAutomixActive || playlist.length === 0) return;

    // Le morceau suivant va toujours sur la platine opposée à celle qui se termine
    const targetDeck = fromDeck ? (fromDeck === 'a' ? 'b' : 'a') : 'a';
    const nextTrack = playlist.shift();
    renderPlaylist();

    if (nextTrack.type === 'youtube') {
        const player = targetDeck === 'a' ? ytPlayerA : ytPlayerB;
        loadYoutubeVideo(targetDeck, player, nextTrack.sourceData, nextTrack.title);
    } else if (nextTrack.type === 'local') {
        const ws = targetDeck === 'a' ? wavesurferA : wavesurferB;
        loadLocalFileFromAutomix(nextTrack.sourceData, targetDeck, ws);
    }

    setTimeout(() => {
        const playBtn = document.getElementById(`play-${targetDeck}`);
        if (playBtn) playBtn.click();
        fadeCrossfaderTo(targetDeck, getTransition() * 1000);
    }, 1000);

}

function checkAutomixTrigger(deckStr, currentTime, duration) {
    if (!isAutomixActive || !(duration > 0)) return;
    const timeLeft = duration - currentTime;
    const T = getTransition();
    if (timeLeft > T + 3) { automixDone[deckStr] = false; return; } // nouveau morceau, boucle ou retour en arrière
    if (timeLeft <= T + 1 && !automixDone[deckStr] && playlist.length > 0) {
        automixDone[deckStr] = true;
        playNextInAutomix(deckStr);
    }
}

window.seekTrack = function(deckStr, event) {
    const container = document.getElementById(`progress-container-${deckStr}`);
    const rect = container.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    const percent = Math.max(0, Math.min(1, clickX / width));

    const currentSrc = deckStr === 'a' ? currentSourceA : currentSourceB;

    if (currentSrc === 'local') {
        const ws = deckStr === 'a' ? wavesurferA : wavesurferB;
        if (ws && ws.getDuration()) {
            ws.seekTo(percent);
        }
    } else if (currentSrc === 'youtube') {
        const player = deckStr === 'a' ? ytPlayerA : ytPlayerB;
        if (player && typeof player.getDuration === 'function' && typeof player.seekTo === 'function') {
            const duration = player.getDuration();
            const targetTime = duration * percent;
            player.seekTo(targetTime, true);
        }
    }
};

document.getElementById('load-yt-btn-a').addEventListener('click', () => loadYoutubeVideo('a', ytPlayerA));
document.getElementById('load-yt-btn-b').addEventListener('click', () => loadYoutubeVideo('b', ytPlayerB));
document.getElementById('yt-url-a').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('load-yt-btn-a').click(); } });
document.getElementById('yt-url-b').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('load-yt-btn-b').click(); } });

document.getElementById('open-search-btn').addEventListener('click', () => { document.getElementById('yt-search-modal').style.display = 'flex'; });
document.getElementById('close-modal').addEventListener('click', () => { document.getElementById('yt-search-modal').style.display = 'none'; });

document.getElementById('yt-search-btn').addEventListener('click', async () => {
    const query = document.getElementById('yt-search-input').value.trim();
    const resultsContainer = document.getElementById('yt-search-results');

    if (!query) return;
    resultsContainer.innerHTML = '<div style="text-align:center; padding: 20px; color:#fff;">Recherche musicale en cours... ⏳</div>';

    const key = getApiKey(); if (!key) { resultsContainer.innerHTML = ''; return; }
    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${encodeURIComponent(key)}`);
        const data = await response.json();
        if (data.error) { if (data.error.code === 400 || data.error.code === 403) localStorage.removeItem('yt_api_key'); resultsContainer.innerHTML = `<div class="api-warning">Erreur API : ${data.error.message}</div>`; return; }

        resultsContainer.innerHTML = '';
        if(data.items.length === 0) { resultsContainer.innerHTML = '<div style="text-align:center; color:#888;">Aucun résultat musical.</div>'; return; }

        const durMap = {};
        try {
            const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${data.items.map(i => i.id.videoId).join(',')}&key=${encodeURIComponent(key)}`);
            ((await r.json()).items || []).forEach(v => { durMap[v.id] = isoToSec(v.contentDetails.duration); });
        } catch (e) {}

        data.items.forEach(item => {
            const videoId = item.id.videoId;
            const title = new DOMParser().parseFromString(item.snippet.title, 'text/html').body.textContent;
            const thumb = item.snippet.thumbnails.default.url;
            const channel = item.snippet.channelTitle;

            const div = document.createElement('div'); div.className = 'result-item';
            const img = document.createElement('img'); img.src = thumb; img.className = 'result-thumb';
            const info = document.createElement('div'); info.className = 'result-info';
            const ttl = document.createElement('div'); ttl.className = 'result-title'; ttl.textContent = title;
            const ch = document.createElement('div'); ch.className = 'result-channel'; ch.textContent = channel;
            const act = document.createElement('div'); act.className = 'result-actions';
            [['load-btn a', '▶ Platine A', () => loadFromSearch('a', videoId, title)], ['load-btn b', '▶ Platine B', () => loadFromSearch('b', videoId, title)], ['load-btn queue', '➕ File', () => { addToPlaylist(title, 'youtube', videoId, { artist: channel.replace(/ - Topic$/, ''), duration: durMap[videoId] }); toast(`➕ Ajouté à la file (${playlist.length})`); }]].forEach(([cls, label, fn]) => {
                const b = document.createElement('button'); b.className = cls; b.textContent = label; b.addEventListener('click', fn); act.appendChild(b);
            });
            info.append(ttl, ch, act); div.append(img, info); resultsContainer.appendChild(div);
        });
    } catch (err) { resultsContainer.innerHTML = `<div class="api-warning">Erreur réseau.</div>`; }
});

document.getElementById('yt-search-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('yt-search-btn').click(); } });
window.loadFromSearch = function(deckStr, videoId, title) {
    document.getElementById('yt-search-modal').style.display = 'none';
    const player = deckStr === 'a' ? ytPlayerA : ytPlayerB;
    loadYoutubeVideo(deckStr, player, videoId, title); 
};

function initEngine() {
    if (isInitialized) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    gainA = audioContext.createGain(); gainB = audioContext.createGain(); 
    masterGainNode = audioContext.createGain();
    destNode = audioContext.createMediaStreamDestination();
    
    eqHighA = audioContext.createBiquadFilter(); eqHighA.type = 'highshelf'; eqHighA.frequency.value = 3200;
    eqMidA = audioContext.createBiquadFilter(); eqMidA.type = 'peaking'; eqMidA.frequency.value = 1000; eqMidA.Q.value = 1;
    eqLowA = audioContext.createBiquadFilter(); eqLowA.type = 'lowshelf'; eqLowA.frequency.value = 320;

    eqHighB = audioContext.createBiquadFilter(); eqHighB.type = 'highshelf'; eqHighB.frequency.value = 3200;
    eqMidB = audioContext.createBiquadFilter(); eqMidB.type = 'peaking'; eqMidB.frequency.value = 1000; eqMidB.Q.value = 1;
    eqLowB = audioContext.createBiquadFilter(); eqLowB.type = 'lowshelf'; eqLowB.frequency.value = 320;

    filterNodeA = audioContext.createBiquadFilter(); filterNodeA.type = 'allpass';
    filterNodeB = audioContext.createBiquadFilter(); filterNodeB.type = 'allpass';

    analyserNode = audioContext.createAnalyser(); analyserNode.fftSize = 512;
    dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    gainA.connect(eqLowA); eqLowA.connect(eqMidA); eqMidA.connect(eqHighA); eqHighA.connect(filterNodeA); filterNodeA.connect(masterGainNode);
    gainB.connect(eqLowB); eqLowB.connect(eqMidB); eqMidB.connect(eqHighB); eqHighB.connect(filterNodeB); filterNodeB.connect(masterGainNode);

    masterGainNode.connect(analyserNode);
    masterGainNode.connect(audioContext.destination);
    masterGainNode.connect(destNode);

    if(wavesurferA.getMediaElement()) audioContext.createMediaElementSource(wavesurferA.getMediaElement()).connect(gainA);
    if(wavesurferB.getMediaElement()) audioContext.createMediaElementSource(wavesurferB.getMediaElement()).connect(gainB);

    isInitialized = true;
    updateMixer(); drawSpectrum();
}

document.getElementById('eq-high-a').addEventListener('input', (e) => { if(eqHighA) eqHighA.gain.value = parseFloat(e.target.value); });
document.getElementById('eq-mid-a').addEventListener('input', (e) => { if(eqMidA) eqMidA.gain.value = parseFloat(e.target.value); });
document.getElementById('eq-low-a').addEventListener('input', (e) => { if(eqLowA) eqLowA.gain.value = parseFloat(e.target.value); });

document.getElementById('eq-high-b').addEventListener('input', (e) => { if(eqHighB) eqHighB.gain.value = parseFloat(e.target.value); });
document.getElementById('eq-mid-b').addEventListener('input', (e) => { if(eqMidB) eqMidB.gain.value = parseFloat(e.target.value); });
document.getElementById('eq-low-b').addEventListener('input', (e) => { if(eqLowB) eqLowB.gain.value = parseFloat(e.target.value); });

function updateMixer() {
    if (!isInitialized) return;
    const cf = parseFloat(document.getElementById('crossfader').value); 
    const masterVol = parseFloat(document.getElementById('master-volume').value);

    const volA = Math.cos(cf * 0.5 * Math.PI);
    const volB = Math.cos((1.0 - cf) * 0.5 * Math.PI);

    if (gainA) gainA.gain.setTargetAtTime(volA, audioContext.currentTime, 0.015);
    if (gainB) gainB.gain.setTargetAtTime(volB, audioContext.currentTime, 0.015);
    if (masterGainNode) masterGainNode.gain.setTargetAtTime(masterVol, audioContext.currentTime, 0.015);

    if (currentSourceA === 'youtube' && ytPlayerA && typeof ytPlayerA.setVolume === 'function') ytPlayerA.setVolume(volA * masterVol * 100);
    if (currentSourceB === 'youtube' && ytPlayerB && typeof ytPlayerB.setVolume === 'function') ytPlayerB.setVolume(volB * masterVol * 100);
}
document.getElementById('crossfader').addEventListener('input', updateMixer);
document.getElementById('master-volume').addEventListener('input', updateMixer);

function applyDJFilter(node, value) {
    if (!node) return;
    if (value == 0) { node.type = 'allpass'; }
    else if (value < 0) {
        node.type = 'lowpass'; node.frequency.value = Math.max(200, 20000 + (value * 198));
    } else {
        node.type = 'highpass'; node.frequency.value = Math.min(10000, value * 100);
    }
}
document.getElementById('filter-a').addEventListener('input', (e) => applyDJFilter(filterNodeA, parseFloat(e.target.value)));
document.getElementById('filter-b').addEventListener('input', (e) => applyDJFilter(filterNodeB, parseFloat(e.target.value)));

document.getElementById('upload-a').addEventListener('change', (e) => { 
    if(e.target.files[0]) {
        const file = e.target.files[0];
        const fileUrl = URL.createObjectURL(file);
        loadLocalFileFromAutomix({ fileObj: file, url: fileUrl }, 'a', wavesurferA);
        addToPlaylist(file.name, 'local', { fileObj: file, url: fileUrl });
    } 
});

document.getElementById('upload-b').addEventListener('change', (e) => { 
    if(e.target.files[0]) {
        const file = e.target.files[0];
        const fileUrl = URL.createObjectURL(file);
        loadLocalFileFromAutomix({ fileObj: file, url: fileUrl }, 'b', wavesurferB);
        addToPlaylist(file.name, 'local', { fileObj: file, url: fileUrl });
    } 
});

function handlePlayBtn(deckStr, wsInstance, ytInstance, currentSrc) {
    initEngine(); if (audioContext.state === 'suspended') audioContext.resume();
    
    if (currentSrc === 'local' || currentSrc === 'none') {
        wsInstance.playPause();
        document.getElementById(`play-${deckStr}`).innerText = wsInstance.isPlaying() ? '⏸ Pause' : '▶ Play';
    } 
    else if (currentSrc === 'youtube' && ytInstance) {
        if (ytInstance.getPlayerState() === YT.PlayerState.PLAYING) ytInstance.pauseVideo();
        else ytInstance.playVideo();
    }
}
document.getElementById('play-a').addEventListener('click', () => handlePlayBtn('a', wavesurferA, ytPlayerA, currentSourceA));
document.getElementById('play-b').addEventListener('click', () => handlePlayBtn('b', wavesurferB, ytPlayerB, currentSourceB));

function handleCueBtn(deckStr, wsInstance, ytInstance, currentSrc) {
    if (currentSrc === 'local') {
        if (wsInstance.isPlaying()) {
            wsInstance.seekTo( (deckStr === 'a' ? cueA : cueB) / wsInstance.getDuration() );
        } else {
            if(deckStr === 'a') { cueA = wsInstance.getCurrentTime(); toast(`📍 Cue A : ${formatTime(cueA)}`); }
            else { cueB = wsInstance.getCurrentTime(); toast(`📍 Cue B : ${formatTime(cueB)}`); }
        }
    } else if (currentSrc === 'youtube' && ytInstance) {
        if (ytInstance.getPlayerState() === YT.PlayerState.PLAYING) {
            ytInstance.seekTo(deckStr === 'a' ? cueA : cueB);
        } else {
            if(deckStr === 'a') { cueA = ytInstance.getCurrentTime(); toast(`📍 Cue A : ${formatTime(cueA)}`); }
            else { cueB = ytInstance.getCurrentTime(); toast(`📍 Cue B : ${formatTime(cueB)}`); }
        }
    }
}
document.getElementById('cue-a').addEventListener('click', () => handleCueBtn('a', wavesurferA, ytPlayerA, currentSourceA));
document.getElementById('cue-b').addEventListener('click', () => handleCueBtn('b', wavesurferB, ytPlayerB, currentSourceB));

document.getElementById('loop-a').addEventListener('click', (e) => {
    if (currentSourceA === 'local' || currentSourceA === 'none') {
        const media = wavesurferA.getMediaElement();
        if(media) { media.loop = !media.loop; isLoopingA = media.loop; e.target.classList.toggle('active', media.loop); }
    } else if (currentSourceA === 'youtube') { isLoopingA = !isLoopingA; e.target.classList.toggle('active', isLoopingA); }
});
document.getElementById('loop-b').addEventListener('click', (e) => {
    if (currentSourceB === 'local' || currentSourceB === 'none') {
        const media = wavesurferB.getMediaElement();
        if(media) { media.loop = !media.loop; isLoopingB = media.loop; e.target.classList.toggle('active', media.loop); }
    } else if (currentSourceB === 'youtube') { isLoopingB = !isLoopingB; e.target.classList.toggle('active', isLoopingB); }
});

let mediaRecorder;
let recordedChunks = [];
document.getElementById('record-btn').addEventListener('click', () => {
    initEngine();
    const btn = document.getElementById('record-btn');
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.classList.remove('recording');
        btn.innerText = '🔴 REC Mix';
    } else {
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(destNode.stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none'; a.href = url; a.download = 'Mon_Mix_Galactic.webm';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };
        mediaRecorder.start();
        btn.classList.add('recording');
        btn.innerText = '⏹ STOP REC';
    }
});

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
    return `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
}

const spectrumCanvas = document.getElementById('spectrum');
const canvasCtx = spectrumCanvas.getContext('2d');
function resizeCanvas() { if (spectrumCanvas.parentElement) spectrumCanvas.width = spectrumCanvas.parentElement.clientWidth - 30; }
window.addEventListener('resize', resizeCanvas); resizeCanvas();

function drawSpectrum() {
    requestAnimationFrame(drawSpectrum);
    if(!analyserNode) return;
    analyserNode.getByteFrequencyData(dataArray);
    
    const w = spectrumCanvas.width;
    canvasCtx.fillStyle = '#0b0c10'; 
    canvasCtx.fillRect(0, 0, w, 120);
    const barWidth = (w / analyserNode.frequencyBinCount) * 2.5; 
    let x = 0;
    
    const cf = parseFloat(document.getElementById('crossfader').value);
    
    for (let i = 0; i < analyserNode.frequencyBinCount; i++) {
        const barHeight = dataArray[i] * 0.45; 
        
        if (cf > 0.6) {
            canvasCtx.fillStyle = `rgb(0, ${Math.min(255, barHeight + 100)}, 255)`;
            canvasCtx.shadowColor = '#00c6ff';
        } else if (cf < 0.4) {
            canvasCtx.fillStyle = `rgb(${Math.min(255, barHeight + 100)}, 50, 150)`;
            canvasCtx.shadowColor = '#ff007f';
        } else {
            canvasCtx.fillStyle = `rgb(${Math.min(255, barHeight + 50)}, 100, 200)`;
            canvasCtx.shadowColor = '#bd00ff';
        }

        canvasCtx.shadowBlur = 8;
        canvasCtx.fillRect(x, 120 - barHeight, barWidth, barHeight); 
        x += barWidth + 1;
    }
}

document.getElementById('listen-btn').addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        initEngine();
        const srcNode = audioContext.createMediaStreamSource(stream);
        
        srcNode.connect(analyserNode);
        srcNode.connect(destNode);
    } catch (err) { alert("N'oubliez pas de cocher 'Partager l'audio' !"); }
});

if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
}

function onMIDISuccess(midiAccess) {
    const inputs = midiAccess.inputs.values();
    for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
        input.value.onmidimessage = onMIDIMessage;
    }
}

function onMIDIFailure() {
    console.log("Erreur MIDI");
}

function onMIDIMessage(message) {
    const command = message.data[0];
    const note = message.data[1];
    const velocity = (message.data.length > 2) ? message.data[2] : 0;

    if (command === 176 || command === 177 || command === 178 || command === 179) {
        if (note === 58) {
            document.getElementById('crossfader').value = velocity / 127;
            updateMixer();
        }
        if (note === 55) {
            document.getElementById('master-volume').value = velocity / 127;
            updateMixer();
        }
        if (note === 57) {
            const filterVal = ((velocity / 127) * 200) - 100;
            document.getElementById('filter-a').value = filterVal;
            applyDJFilter(filterNodeA, filterVal);
        }
        if (note === 62) {
            const filterVal = ((velocity / 127) * 200) - 100;
            document.getElementById('filter-b').value = filterVal;
            applyDJFilter(filterNodeB, filterVal);
        }
    }

    if ((command === 144 || command === 145) && velocity > 0) {
        if (note === 22) document.getElementById('play-a').click();
        if (note === 21) document.getElementById('cue-a').click();
        if (note === 48) document.getElementById('play-b').click();
        if (note === 47) document.getElementById('cue-b').click();
    }
}
// Glisser-déposer des MP3 dans la file d'attente
const plBox = document.getElementById('playlist-container');
plBox.addEventListener('dragover', (e) => e.preventDefault());
plBox.addEventListener('drop', (e) => {
    e.preventDefault();
    [...e.dataTransfer.files].filter(f => f.type.startsWith('audio/')).forEach(f => addToPlaylist(f.name, 'local', { fileObj: f, url: URL.createObjectURL(f) }));
});

// Curseur de durée de transition
const trSlider = document.getElementById('transition-time');
if (trSlider) {
    trSlider.value = localStorage.getItem('transition_time') || trSlider.value;
    const trShow = () => { document.getElementById('transition-val').innerText = `${trSlider.value} s`; localStorage.setItem('transition_time', trSlider.value); };
    trSlider.addEventListener('input', trShow); trShow();
}

// Barre du haut : plein écran, fermeture, musiques locales
const fsBtn = document.getElementById('fs-btn');
let autoFullscreen = true;
function syncFs() {
    const full = !!document.fullscreenElement;
    document.body.classList.toggle('is-fullscreen', full);
    fsBtn.innerText = full ? '➖ Réduire' : '⛶ Plein écran';
}
document.addEventListener('fullscreenchange', syncFs);
fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) { autoFullscreen = false; document.exitFullscreen(); }
    else document.documentElement.requestFullscreen().catch(() => {});
});
// Plein écran automatique dès le premier clic (le navigateur l'exige)
document.addEventListener('pointerdown', (e) => {
    if (autoFullscreen && !document.fullscreenElement && !e.target.closest('#fs-btn, #close-btn')) {
        document.documentElement.requestFullscreen().catch(() => {});
    }
    autoFullscreen = false;
}, { once: true });

document.getElementById('close-btn').addEventListener('click', () => {
    if (!confirm('Fermer le lecteur ?')) return;
    if (document.fullscreenElement) document.exitFullscreen();
    window.close();
    setTimeout(() => toast('Le navigateur bloque la fermeture : ferme simplement cet onglet.'), 400);
});

const localFiles = document.getElementById('local-files');
document.getElementById('local-btn').addEventListener('click', () => localFiles.click());
localFiles.addEventListener('change', () => {
    const files = [...localFiles.files].filter(f => f.type.startsWith('audio/'));
    files.forEach(f => addToPlaylist(f.name, 'local', { fileObj: f, url: URL.createObjectURL(f) }));
    if (files.length) toast(`📁 ${files.length} morceau(x) ajouté(s) à la file`);
    localFiles.value = '';
});

// PWA : installation sur Android + masquage des fonctions non disponibles sur mobile
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) document.getElementById('listen-btn').style.display = 'none';
