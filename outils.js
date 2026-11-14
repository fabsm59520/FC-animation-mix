// ===== Outils : effets, sampler, MIDI learn, bibliothèque, waveform défilante, vu-mètres =====
(() => {
const $ = (id) => document.getElementById(id);
const DECKS = ['a', 'b'];

// ---------- Tiroir d'outils ----------
const drawer = $('tools-drawer');
drawer.innerHTML = `
<div class="tools-tabs">
  <button data-tab="fx" class="active">FX</button><button data-tab="sampler">Sampler</button>
  <button data-tab="lib">Biblio</button><button data-tab="midi">MIDI</button><button data-tab="keys">Clavier</button>
  <button id="tools-close" class="tools-x">✖</button>
</div>
<div class="tools-body">
  <section id="tab-fx"></section><section id="tab-sampler" hidden></section>
  <section id="tab-lib" hidden></section><section id="tab-midi" hidden></section><section id="tab-keys" hidden></section>
</div>`;
drawer.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    drawer.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
    drawer.querySelectorAll('section').forEach(sec => { sec.hidden = sec.id !== `tab-${b.dataset.tab}`; });
    if (b.dataset.tab === 'lib') renderLib();
}));
$('tools-btn').addEventListener('click', () => document.body.classList.toggle('show-tools'));
$('tools-close').addEventListener('click', () => document.body.classList.remove('show-tools'));

// ---------- EFFETS ----------
let fx = null, anA = null, anB = null, samplerOut = null, noiseBuffer = null;
const FXS = { on: false, target: 'ab', type: 'echo', mix: 0.5, p: 0.5 };

function makeIR(ctx) {
    const len = Math.floor(ctx.sampleRate * 2.5), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    return b;
}
window.initExtras = function () {
    const ctx = audioContext, g = () => ctx.createGain();
    fx = { in: g(), sendA: g(), sendB: g(), mix: g(), echo: ctx.createDelay(2), efb: g(), eout: g(), conv: ctx.createConvolver(), rout: g(),
           fl: ctx.createDelay(0.05), flfb: g(), flout: g(), lfo: ctx.createOscillator(), lfog: g() };
    fx.sendA.gain.value = 0; fx.sendB.gain.value = 0;
    filterNodeA.connect(fx.sendA); filterNodeB.connect(fx.sendB); fx.sendA.connect(fx.in); fx.sendB.connect(fx.in);
    fx.in.connect(fx.echo); fx.echo.connect(fx.eout); fx.echo.connect(fx.efb); fx.efb.connect(fx.echo); fx.efb.gain.value = 0.45;
    fx.conv.buffer = makeIR(ctx); fx.in.connect(fx.conv); fx.conv.connect(fx.rout);
    fx.fl.delayTime.value = 0.004; fx.flfb.gain.value = 0.5; fx.lfo.frequency.value = 0.4; fx.lfog.gain.value = 0.003;
    fx.in.connect(fx.fl); fx.fl.connect(fx.flout); fx.fl.connect(fx.flfb); fx.flfb.connect(fx.fl); fx.lfo.connect(fx.lfog); fx.lfog.connect(fx.fl.delayTime); fx.lfo.start();
    [fx.eout, fx.rout, fx.flout].forEach(n => n.connect(fx.mix)); fx.mix.connect(masterGainNode);
    anA = ctx.createAnalyser(); anB = ctx.createAnalyser(); anA.fftSize = anB.fftSize = 256;
    filterNodeA.connect(anA); filterNodeB.connect(anB);
    samplerOut = g(); samplerOut.gain.value = 0.8; samplerOut.connect(masterGainNode);
    applyFx();
};
function deckBpm(d) { const s = DJ[d]; return s.bpm ? s.bpm * s.rate : null; }
function applyFx() {
    if (!fx) return;
    const t = audioContext.currentTime;
    fx.sendA.gain.setTargetAtTime(FXS.on && FXS.target.includes('a') ? 1 : 0, t, 0.02);
    fx.sendB.gain.setTargetAtTime(FXS.on && FXS.target.includes('b') ? 1 : 0, t, 0.02);
    fx.eout.gain.value = FXS.type === 'echo' ? 1 : 0; fx.rout.gain.value = FXS.type === 'reverb' ? 1 : 0; fx.flout.gain.value = FXS.type === 'flanger' ? 1 : 0;
    fx.mix.gain.setTargetAtTime(FXS.mix, t, 0.02);
    const bpms = DECKS.filter(d => FXS.target.includes(d)).map(deckBpm).filter(Boolean), bpm = bpms.length ? bpms[0] : 120;
    const frac = [0.25, 0.5, 0.75, 1][Math.round(FXS.p * 3)];
    fx.echo.delayTime.setTargetAtTime(Math.min(1.9, 60 / bpm * frac), t, 0.05);
    fx.lfo.frequency.setTargetAtTime(0.1 + FXS.p * 1.9, t, 0.05);
}
function brake(d) {
    if (!isLocal(d) || !DJ[d].src) return toast('Brake : MP3 locaux uniquement');
    const m = wsOf(d).getMediaElement(); if (m.paused) return;
    const r0 = m.playbackRate, t0 = performance.now(), D = 1400; m.preservesPitch = false;
    (function step() {
        const p = (performance.now() - t0) / D;
        if (p >= 1) { m.pause(); m.playbackRate = DJ[d].rate; m.preservesPitch = DJ[d].keylock; return; }
        m.playbackRate = Math.max(0.0625, r0 * (1 - p) * (1 - p)); requestAnimationFrame(step);
    })();
}
(() => {
    const sec = $('tab-fx');
    sec.innerHTML = `
    <div class="fx-row"><span>Cible</span><button data-t="a">A</button><button data-t="b">B</button><button data-t="ab" class="active">A+B</button></div>
    <div class="fx-row"><span>Effet</span><button data-e="echo" class="active">Écho</button><button data-e="reverb">Réverb</button><button data-e="flanger">Flanger</button></div>
    <div class="fx-row"><span>Mix</span><input type="range" id="fx-mix" min="0" max="1" step="0.01" value="0.5"></div>
    <div class="fx-row"><span id="fx-plabel">Durée</span><input type="range" id="fx-p" min="0" max="1" step="0.01" value="0.5"></div>
    <button id="fx-on" class="mini-btn big">FX : OFF</button>
    <div class="fx-row"><span>Brake</span><button id="brake-a">⏹ Platine A</button><button id="brake-b">⏹ Platine B</button></div>
    <p class="hint">L’écho se cale sur le BPM de la platine ciblée. Le brake ralentit la platine comme un disque qu’on arrête (MP3 locaux).</p>`;
    const labels = { echo: 'Durée', reverb: '—', flanger: 'Vitesse' };
    sec.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { FXS.target = b.dataset.t; sec.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('active', x === b)); applyFx(); }));
    sec.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => { FXS.type = b.dataset.e; $('fx-plabel').textContent = labels[FXS.type]; sec.querySelectorAll('[data-e]').forEach(x => x.classList.toggle('active', x === b)); applyFx(); }));
    $('fx-mix').addEventListener('input', (e) => { FXS.mix = +e.target.value; applyFx(); });
    $('fx-p').addEventListener('input', (e) => { FXS.p = +e.target.value; applyFx(); });
    window.toggleFx = () => { initEngine(); FXS.on = !FXS.on; $('fx-on').textContent = FXS.on ? 'FX : ON' : 'FX : OFF'; $('fx-on').classList.toggle('active', FXS.on); applyFx(); };
    $('fx-on').addEventListener('click', () => window.toggleFx());
    $('brake-a').addEventListener('click', () => brake('a')); $('brake-b').addEventListener('click', () => brake('b'));
})();

// ---------- SAMPLER ----------
const PAD_NAMES = ['KICK', 'SNARE', 'CLAP', 'HAT', 'SIRÈNE', 'LASER', 'HORN', 'RISER'];
const custom = new Array(8).fill(null);
function noise() {
    if (!noiseBuffer) { noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate); const d = noiseBuffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return noiseBuffer;
}
function synth(i) {
    const ctx = audioContext, t = ctx.currentTime, out = samplerOut;
    const env = (g, a, d, at = t) => { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(a, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + d); };
    const osc = (type, f0, f1, d, vol) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d); env(g, vol, d); o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.05); };
    const nz = (type, f, d, vol, delay = 0) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise(); fl.type = type; fl.frequency.value = f; env(g, vol, d, t + delay); s.connect(fl).connect(g).connect(out); s.start(t + delay); s.stop(t + delay + d + 0.05); };
    switch (i) {
        case 0: osc('sine', 160, 45, 0.4, 1); break;
        case 1: osc('triangle', 190, 120, 0.15, 0.5); nz('highpass', 1800, 0.2, 0.7); break;
        case 2: [0, 0.012, 0.024].forEach(dl => nz('bandpass', 1500, 0.05, 0.8, dl)); nz('bandpass', 1500, 0.2, 0.6, 0.036); break;
        case 3: nz('highpass', 8000, 0.06, 0.6); break;
        case 4: { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(500, t); o.frequency.linearRampToValueAtTime(1100, t + 0.5); o.frequency.linearRampToValueAtTime(500, t + 1); env(g, 0.35, 1); o.connect(g).connect(out); o.start(t); o.stop(t + 1.05); break; }
        case 5: osc('sawtooth', 3000, 150, 0.3, 0.4); break;
        case 6: osc('sawtooth', 466, null, 0.9, 0.3); osc('sawtooth', 587, null, 0.9, 0.3); osc('square', 233, null, 0.9, 0.2); break;
        case 7: { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise(); s.loop = true; fl.type = 'bandpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(200, t); fl.frequency.exponentialRampToValueAtTime(6000, t + 2);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 1.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1); s.connect(fl).connect(g).connect(out); s.start(t); s.stop(t + 2.2); break; }
    }
}
function playSample(i) {
    initEngine(); if (audioContext.state === 'suspended') audioContext.resume();
    if (custom[i]) { const s = audioContext.createBufferSource(); s.buffer = custom[i]; s.connect(samplerOut); s.start(); } else synth(i);
}
window.playSample = playSample;
(() => {
    const sec = $('tab-sampler');
    sec.innerHTML = `<div class="pad-grid" id="sam-pads"></div>
    <div class="fx-row"><span>Volume</span><input type="range" id="sam-vol" min="0" max="1.5" step="0.01" value="0.8"></div>
    <button id="sam-reset" class="mini-btn">↺ Sons d’origine</button>
    <input type="file" id="sam-file" accept="audio/*" hidden>
    <p class="hint">Appui : jouer • Appui long : remplacer par ton propre son • Touches 1 à 8 au clavier.</p>`;
    const grid = $('sam-pads'); let target = 0;
    const label = (b, i) => { b.textContent = custom[i] ? '★ ' + custom[i].name : `${i + 1} · ${PAD_NAMES[i]}`; };
    PAD_NAMES.forEach((_, i) => {
        const b = document.createElement('button'); b.className = 'sam-pad'; label(b, i); grid.appendChild(b);
        let timer = null, long = false;
        b.addEventListener('pointerdown', () => { long = false; timer = setTimeout(() => { long = true; target = i; $('sam-file').click(); }, 600); b.classList.add('hit'); });
        b.addEventListener('pointerup', () => { clearTimeout(timer); b.classList.remove('hit'); if (!long) playSample(i); });
        ['pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { clearTimeout(timer); b.classList.remove('hit'); }));
        b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    $('sam-file').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return; initEngine();
        try { const buf = await audioContext.decodeAudioData(await f.arrayBuffer()); buf.name = f.name.replace(/\.[^.]+$/, '').slice(0, 14); custom[target] = buf; label(grid.children[target], target); }
        catch (err) { toast('Son illisible'); }
        e.target.value = '';
    });
    $('sam-vol').addEventListener('input', (e) => { if (samplerOut) samplerOut.gain.value = +e.target.value; });
    $('sam-reset').addEventListener('click', () => { custom.fill(null); [...grid.children].forEach((b, i) => label(b, i)); });
    document.addEventListener('keydown', (e) => {
        if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.repeat) return;
        if (e.key >= '1' && e.key <= '8') playSample(+e.key - 1);
    });
})();

// ---------- MIDI LEARN (canal par canal, absolu ou relatif) ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const setFilter = (d, v) => { const el = $(`filter-${d}`); el.value = v; el.dispatchEvent(new Event('input')); };
const setSlider = (id, v) => { $(id).value = clamp(v, 0, 1); updateMixer(); };
const ACTIONS = []; // [id, libellé, 'b' (bouton) | 'a' (potentiomètre), action, action relative]
DECKS.forEach(d => {
    const D = d.toUpperCase();
    ACTIONS.push([`play-${d}`, `Play ${D}`, 'b', () => $(`play-${d}`).click()], [`cue-${d}`, `Cue ${D}`, 'b', () => $(`cue-${d}`).click()],
        [`sync-${d}`, `Sync ${D}`, 'b', () => syncDeck(d)], [`loop-${d}`, `Boucle 4 temps ${D}`, 'b', () => setLoop(d, 4)],
        [`brake-${d}`, `Brake ${D}`, 'b', () => brake(d)],
        [`pitch-${d}`, `Pitch ${D}`, 'a', (v) => setRate(d, -16 + v * 32), (n) => setRate(d, clamp((DJ[d].rate - 1) * 100 + n * 0.1, -16, 16))],
        [`filter-${d}`, `Filtre ${D}`, 'a', (v) => setFilter(d, -100 + v * 200), (n) => setFilter(d, clamp(+$(`filter-${d}`).value + n * 3, -100, 100))]);
});
ACTIONS.push(['xfader', 'Crossfader', 'a', (v) => setSlider('crossfader', v), (n) => setSlider('crossfader', +$('crossfader').value + n * 0.02)],
    ['master', 'Volume master', 'a', (v) => setSlider('master-volume', v), (n) => setSlider('master-volume', +$('master-volume').value + n * 0.02)],
    ['fx', 'FX ON / OFF', 'b', () => window.toggleFx()]);
for (let i = 0; i < 8; i++) ACTIONS.push([`pad-${i}`, `Pad sampler ${i + 1}`, 'b', () => playSample(i)]);
let midiMap = {}, midiMode = {};
try { midiMap = JSON.parse(localStorage.getItem('midi_map') || '{}'); midiMode = JSON.parse(localStorage.getItem('midi_mode') || '{}'); } catch (e) {}
let learning = null;
const midiLog = [], lastFire = {};
const NATIVE_N = { 22: 'play-a', 21: 'cue-a', 48: 'play-b', 47: 'cue-b' }, NATIVE_C = { 58: 'xfader', 55: 'master', 57: 'filter-a', 62: 'filter-b' };
const saveMap = () => { localStorage.setItem('midi_map', JSON.stringify(midiMap)); localStorage.setItem('midi_mode', JSON.stringify(midiMode)); };
const modeOf = (id) => midiMode[id] || (id.startsWith('pitch') ? 'rel' : 'abs');
const fmtKey = (k) => { const m = /^([nc])(\d*):(\d+)$/.exec(k); return m ? `${m[1] === 'n' ? 'Note' : 'CC'} ${m[3]}${m[2] !== '' ? ' · canal ' + (+m[2] + 1) : ''}` : k; };
// Encodeurs relatifs : 1..15 = +, 113..127 = − (complément à 2) ; 65..79 / 49..63 = autour de 64
const relDelta = (v) => (v >= 1 && v <= 15) ? v : (v >= 113 && v <= 127) ? v - 128 : (v >= 65 && v <= 79) ? v - 64 : (v >= 49 && v <= 63) ? v - 64 : 0;
function renderMidi() {
    const sec = $('tab-midi');
    sec.innerHTML = '<p class="hint" id="midi-status"></p><pre class="hint midi-last" id="midi-last">Derniers messages : —</pre><div id="midi-list"></div><button id="midi-clear" class="mini-btn">Tout effacer</button>';
    $('midi-status').textContent = navigator.requestMIDIAccess ? 'Clique « Apprendre », puis appuie sur le bouton ou bouge le potentiomètre de ton contrôleur. Pour un pitch qui envoie des impulsions (+1 / −1), garde le mode REL.' : 'MIDI non disponible dans ce navigateur.';
    const list = $('midi-list');
    ACTIONS.forEach(([id, label, kind]) => {
        const row = document.createElement('div'); row.className = 'midi-row';
        const key = Object.keys(midiMap).find(k => midiMap[k] === id);
        const name = document.createElement('span'); name.textContent = label;
        const ctl = document.createElement('span'); ctl.className = 'midi-ctl'; ctl.textContent = learning === id ? '…en attente' : (key ? fmtKey(key) : '—');
        const mode = kind === 'a' ? mkBtn(modeOf(id).toUpperCase(), () => { midiMode[id] = modeOf(id) === 'rel' ? 'abs' : 'rel'; saveMap(); renderMidi(); }) : document.createElement('span');
        if (kind === 'a') mode.title = 'ABS : fader (valeur directe) • REL : encodeur / impulsions';
        row.append(name, ctl, mode, mkBtn('Apprendre', () => { learning = id; renderMidi(); }), mkBtn('✖', () => { if (key) { delete midiMap[key]; saveMap(); renderMidi(); } }));
        list.appendChild(row);
    });
    $('midi-clear').addEventListener('click', () => { midiMap = {}; saveMap(); renderMidi(); });
}
// Appelé en premier par le gestionnaire MIDI d'origine : renvoie true si le message est pris en charge ici
window.midiIntercept = (e) => {
    const [st, d1, d2 = 0] = e.data, type = st & 0xF0, ch = st & 0x0F;
    if (type !== 0x90 && type !== 0x80 && type !== 0xB0) return false;
    const isNote = type !== 0xB0, key = `${isNote ? 'n' : 'c'}${ch}:${d1}`, pressed = isNote ? (type === 0x90 && d2 > 0) : d2 > 63;
    midiLog.unshift(`${fmtKey(key)} · valeur ${d2}`); midiLog.length = Math.min(midiLog.length, 6);
    const last = $('midi-last'); if (last) last.textContent = 'Derniers messages :\n' + midiLog.join('\n');
    if (learning) {
        if (isNote && !pressed) return true;
        Object.keys(midiMap).forEach(k => { if (midiMap[k] === learning) delete midiMap[k]; });
        midiMap[key] = learning; saveMap(); toast(`MIDI : ${fmtKey(key)} assigné`); learning = null; renderMidi(); return true;
    }
    const id = midiMap[key] || midiMap[`${isNote ? 'n' : 'c'}:${d1}`], act = ACTIONS.find(a => a[0] === id);
    // Pas d'assignation sur cette touche : l'ancien mappage fixe est neutralisé si la commande a été apprise ailleurs
    if (!act) { const nat = (isNote ? NATIVE_N : NATIVE_C)[d1]; return !!(nat && Object.values(midiMap).includes(nat)); }
    if (act[2] === 'b') {
        // Anti-doublon : certains contrôleurs envoient le même message deux fois (deux ports, ou appui + relâchement)
        if (pressed) { const now = performance.now(); if (now - (lastFire[id] || 0) > 150) { lastFire[id] = now; act[3](); } }
    }
    else if (modeOf(id) === 'rel' && act[4]) { const n = relDelta(d2); if (n) act[4](n); }
    else act[3](d2 / 127);
    return true;
};
renderMidi();
if (navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(acc => {
    const hook = () => acc.inputs.forEach(i => { if (!i.onmidimessage) i.onmidimessage = onMIDIMessage; });
    hook(); acc.addEventListener('statechange', hook);
}).catch(() => {});

// ---------- BIBLIOTHÈQUE (IndexedDB) + PLAYLISTS ----------
let dbP = null;
const openDb = () => dbP || (dbP = new Promise((res, rej) => { const r = indexedDB.open('galactic-dj', 1); r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const idb = async (mode, fn) => { const d = await openDb(); return new Promise((res, rej) => { const t = d.transaction('tracks', mode), q = fn(t.objectStore('tracks')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
const libAll = () => idb('readonly', s => s.getAll()), libGet = (id) => idb('readonly', s => s.get(id)), libPut = (r) => idb('readwrite', s => s.put(r)), libDel = (id) => idb('readwrite', s => s.delete(id));
window.libUpdateBpm = async (id, bpm) => { const r = await libGet(id); if (r && !r.bpm) { r.bpm = bpm; await libPut(r); } };
const fileId = (f) => `${f.name}|${f.size}`;

async function importFiles(files) {
    let added = 0;
    for (const f of files) {
        if (!f.type.startsWith('audio/') || await libGet(fileId(f))) continue;
        const sp = splitTitle(f.name.replace(/\.[^.]+$/, ''), null);
        const rec = { id: fileId(f), name: f.name, artist: sp.artist, title: sp.name, duration: null, bpm: null, blob: f, added: Date.now() };
        await libPut(rec); added++;
        if (window.jsmediatags) window.jsmediatags.read(f, { onSuccess: ({ tags }) => { if (tags.artist) rec.artist = tags.artist; if (tags.title) rec.title = tags.title; libPut(rec).then(renderLib); }, onError: () => {} });
        const url = URL.createObjectURL(f);
        bpmQueue = bpmQueue.then(() => analyzeUrl(url)).then(r => { rec.bpm = r.bpm; rec.duration = r.duration; return libPut(rec); }).then(renderLib).catch(() => {});
    }
    renderLib(); return added;
}
async function libToQueue(rec, deck) {
    const f = new File([rec.blob], rec.name, { type: rec.blob.type });
    addToPlaylist(rec.name, 'local', { fileObj: f, url: URL.createObjectURL(f), bpm: rec.bpm, libId: rec.id });
    if (deck) loadPlaylistIndex(deck, playlist.length - 1);
}
const getPl = () => { try { return JSON.parse(localStorage.getItem('dj_playlists') || '[]'); } catch (e) { return []; } };
const setPl = (v) => localStorage.setItem('dj_playlists', JSON.stringify(v));
async function savePlaylist() {
    if (!playlist.length) return toast('La file est vide');
    const name = $('pl-name').value.trim() || `Playlist ${new Date().toLocaleDateString('fr-FR')}`, items = [];
    for (const it of playlist) {
        if (it.type === 'youtube') items.push({ t: 'y', title: it.title, id: it.sourceData, artist: it.artist, duration: it.duration });
        else { const f = it.sourceData.fileObj; if (!(await libGet(fileId(f)))) await importFiles([f]); items.push({ t: 'l', id: fileId(f) }); }
    }
    const all = getPl().filter(p => p.name !== name); all.push({ name, items }); setPl(all); $('pl-name').value = ''; renderLib(); toast(`💾 « ${name} » sauvée (${items.length})`);
}
async function loadPlaylist(p) {
    let missing = 0;
    for (const it of p.items) {
        if (it.t === 'y') addToPlaylist(it.title, 'youtube', it.id, { artist: it.artist, duration: it.duration });
        else { const rec = await libGet(it.id); if (rec) await libToQueue(rec); else missing++; }
    }
    toast(missing ? `Playlist chargée (${missing} fichier(s) manquant(s))` : '📂 Playlist chargée');
}
let libFilter = '';
function mkBtn(label, fn, cls = 'mini-btn') { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.addEventListener('click', fn); return b; }
async function renderLib() {
    const list = $('lib-list'); if (!list) return;
    const all = (await libAll()).sort((x, y) => `${x.artist || ''}${x.title}`.localeCompare(`${y.artist || ''}${y.title}`, 'fr', { sensitivity: 'base' }));
    list.textContent = '';
    const shown = all.filter(r => !libFilter || `${r.artist || ''} ${r.title}`.toLowerCase().includes(libFilter));
    $('lib-count').textContent = `${shown.length} / ${all.length} titres`;
    shown.forEach(r => {
        const row = document.createElement('div'); row.className = 'lib-row';
        const t = document.createElement('span'); t.className = 'lib-title'; t.textContent = `${r.artist ? r.artist + ' – ' : ''}${r.title}`;
        const m = document.createElement('span'); m.className = 'lib-meta'; m.textContent = `${r.bpm || '…'} · ${r.duration ? formatTime(r.duration) : '—'}`;
        row.append(t, m, mkBtn('➕', () => libToQueue(r)), mkBtn('▶A', () => libToQueue(r, 'a')), mkBtn('▶B', () => libToQueue(r, 'b')), mkBtn('✖', async () => { await libDel(r.id); renderLib(); }));
        list.appendChild(row);
    });
    const pl = $('pl-list'); pl.textContent = '';
    getPl().forEach(p => {
        const row = document.createElement('div'); row.className = 'lib-row';
        const t = document.createElement('span'); t.className = 'lib-title'; t.textContent = `📋 ${p.name} (${p.items.length})`;
        row.append(t, mkBtn('Charger', () => loadPlaylist(p)), mkBtn('✖', () => { setPl(getPl().filter(x => x.name !== p.name)); renderLib(); }));
        pl.appendChild(row);
    });
}
(() => {
    $('tab-lib').innerHTML = `
    <div class="fx-row"><button id="lib-import" class="mini-btn">⬆ Importer des MP3</button><input type="file" id="lib-files" accept="audio/*" multiple hidden><span id="lib-count" class="hint"></span></div>
    <input id="lib-search" class="lib-search" placeholder="🔍 Rechercher dans la bibliothèque…">
    <div id="lib-list" class="lib-list"></div>
    <div class="fx-row"><input id="pl-name" class="lib-search" placeholder="Nom de la playlist"><button id="pl-save" class="mini-btn">💾 Sauver la file</button></div>
    <div id="pl-list" class="lib-list"></div>
    <p class="hint">La bibliothèque garde tes MP3 dans ce navigateur, avec leur BPM déjà calculé : plus besoin de les recharger ni de les ré-analyser.</p>`;
    $('lib-import').addEventListener('click', () => $('lib-files').click());
    $('lib-files').addEventListener('change', async (e) => { const n = await importFiles([...e.target.files]); toast(`📚 ${n} titre(s) importé(s)`); e.target.value = ''; });
    $('lib-search').addEventListener('input', (e) => { libFilter = e.target.value.trim().toLowerCase(); renderLib(); });
    $('pl-save').addEventListener('click', savePlaylist);
    // Filtre instantané sur la file d'attente
    const qs = document.createElement('input'); qs.className = 'lib-search'; qs.placeholder = '🔍 Filtrer la file…';
    qs.addEventListener('input', () => { queueFilter = qs.value.trim().toLowerCase(); renderPlaylist(); });
    document.querySelector('.playlist-controls').appendChild(qs);
})();

// ---------- WAVEFORM DÉFILANTE + VU-MÈTRES ----------
const WFP = { a: null, b: null }, vuLvl = { a: 0, b: 0 }, vuBuf = new Uint8Array(256);
window.onTrackLoadedExtra = (d, src) => {
    WFP[d] = null; if (!src) return;
    analyzeUrl(src.url).then(r => { if (DJ[d].src === src) WFP[d] = r.peaks; }).catch(() => {});
};
function drawWf(d) {
    const cv = $(`wf-${d}`), dpr = window.devicePixelRatio || 1, w = Math.floor(cv.clientWidth * dpr), h = Math.floor(cv.clientHeight * dpr);
    if (!w || !h) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext('2d'), p = WFP[d]; g.clearRect(0, 0, w, h);
    if (!p || !isLocal(d)) { g.fillStyle = '#2a2a33'; g.fillRect(0, h / 2 - 1, w, 2); return; }
    const cur = wsOf(d).getCurrentTime(), pps = w / 6, n = p.length / 3, col = d === 'a' ? '#ff007f' : '#00c6ff';
    for (let x = 0; x < w; x += 2) {
        const i = Math.floor((cur + (x - w / 2) / pps) * 100); if (i < 0 || i >= n) continue;
        const lo = p[i * 3], mi = p[i * 3 + 1], hi = p[i * 3 + 2], s = lo + mi + hi + 1e-6, bh = Math.min(1, Math.sqrt(s * 2)) * h * 0.95;
        g.fillStyle = `rgb(${((lo * 255 + mi * 90 + hi * 80) / s) | 0},${((lo * 70 + mi * 255 + hi * 170) / s) | 0},${((lo * 70 + mi * 110 + hi * 255) / s) | 0})`;
        g.fillRect(x, (h - bh) / 2, 2, bh);
    }
    const lp = DJ[d].loop; if (lp) { g.fillStyle = 'rgba(255,140,0,0.3)'; g.fillRect(w / 2 + (lp.start - cur) * pps, 0, (lp.end - lp.start) * pps, h); }
    g.fillStyle = col; DJ[d].cues.forEach(c => { if (c != null) { const x = w / 2 + (c - cur) * pps; g.fillRect(x - 1, 0, 2, h); g.fillRect(x - 5, 0, 10, 6); } });
    g.fillStyle = '#fff'; g.fillRect(w / 2 - 1, 0, 2, h);
}
function drawVu(d, an) {
    const cv = $(`vu-${d}`), g = cv.getContext('2d'), H = cv.height; let lvl = 0;
    if (an) { an.getByteTimeDomainData(vuBuf); let sum = 0; for (let i = 0; i < vuBuf.length; i++) { const v = (vuBuf[i] - 128) / 128; sum += v * v; } lvl = Math.min(1, Math.sqrt(sum / vuBuf.length) * 3); }
    vuLvl[d] = Math.max(lvl, vuLvl[d] * 0.9); g.clearRect(0, 0, cv.width, H);
    const segs = 12, lit = Math.round(vuLvl[d] * segs), sh = H / segs;
    for (let i = 0; i < segs; i++) { g.fillStyle = i < lit ? (i < 8 ? '#28a745' : i < 10 ? '#ffc107' : '#e52d27') : '#1e1e24'; g.fillRect(0, H - (i + 1) * sh + 1, cv.width, sh - 1); }
}
(function tick() { drawWf('a'); drawWf('b'); drawVu('a', anA); drawVu('b', anB); requestAnimationFrame(tick); })();
DECKS.forEach(d => {
    const cv = $(`wf-${d}`); let lastX = 0, on = false;
    cv.addEventListener('pointerdown', (e) => { if (!isLocal(d) || !DJ[d].src) return; on = true; lastX = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
        if (!on) return; const ws = wsOf(d), dx = e.clientX - lastX; lastX = e.clientX;
        ws.setTime(Math.max(0, Math.min(ws.getDuration(), ws.getCurrentTime() - dx / (cv.clientWidth / 6))));
    });
    ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { on = false; }));
});

// ---------- AUTOMIX : option « caler le BPM » ----------
(() => {
    const lab = document.createElement('label'); lab.className = 'transition-box'; lab.title = 'La platine entrante prend le tempo de la platine sortante (MP3 locaux)';
    lab.innerHTML = '<input type="checkbox" id="automix-sync"> Sync BPM à chaque transition';
    const cb = lab.querySelector('input'); cb.checked = localStorage.getItem('automix_sync') === '1';
    cb.addEventListener('change', () => localStorage.setItem('automix_sync', cb.checked ? '1' : '0'));
    document.querySelector('.playlist-controls').appendChild(lab);
    window.automixSync = (d) => {
        if (!cb.checked) return;
        const other = d === 'a' ? 'b' : 'a'; let tries = 0;
        (function attempt() {
            if (DJ[d].bpm && DJ[other].bpm) return syncDeck(d);
            if (++tries < 12) setTimeout(attempt, 500); // le BPM peut encore être en cours de calcul
        })();
    };
})();

// ---------- RACCOURCIS CLAVIER (positions physiques : valables en AZERTY comme en QWERTY) ----------
(() => {
    const SHORT = {
        KeyQ: ['Play A', () => $('play-a').click()], KeyW: ['Cue A', () => $('cue-a').click()], KeyE: ['Sync A', () => syncDeck('a')],
        KeyI: ['Play B', () => $('play-b').click()], KeyO: ['Cue B', () => $('cue-b').click()], KeyP: ['Sync B', () => syncDeck('b')],
        KeyZ: ['Repère 1 A', () => hotCue('a', 0)], KeyX: ['Repère 2 A', () => hotCue('a', 1)], KeyC: ['Repère 3 A', () => hotCue('a', 2)], KeyV: ['Repère 4 A', () => hotCue('a', 3)],
        KeyN: ['Repère 1 B', () => hotCue('b', 0)], KeyM: ['Repère 2 B', () => hotCue('b', 1)], Comma: ['Repère 3 B', () => hotCue('b', 2)], Period: ['Repère 4 B', () => hotCue('b', 3)],
        KeyA: ['Boucle 4 temps A', () => setLoop('a', 4)], KeyL: ['Boucle 4 temps B', () => setLoop('b', 4)],
        KeyF: ['FX ON / OFF', () => window.toggleFx()],
        ArrowLeft: ['Crossfader ◀', () => setSlider('crossfader', +$('crossfader').value - 0.05)], ArrowRight: ['Crossfader ▶', () => setSlider('crossfader', +$('crossfader').value + 0.05)],
        ArrowUp: ['Volume +', () => setSlider('master-volume', +$('master-volume').value + 0.05)], ArrowDown: ['Volume −', () => setSlider('master-volume', +$('master-volume').value - 0.05)]
    };
    const REPEAT_OK = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
    document.addEventListener('keydown', (e) => {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range') return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        const s = SHORT[e.code]; if (!s || (e.repeat && !REPEAT_OK.has(e.code))) return;
        e.preventDefault(); s[1]();
    });
    const sec = $('tab-keys');
    sec.innerHTML = '<p class="hint">Les touches suivent la position sur le clavier : le libellé affiché est celui de ton clavier.</p><div id="kb-list"></div>';
    const draw = (layout) => {
        const list = $('kb-list'); list.textContent = '';
        Object.entries(SHORT).forEach(([code, [label]]) => {
            const row = document.createElement('div'); row.className = 'midi-row kb-row';
            const k = document.createElement('kbd'); k.textContent = (layout && layout.get(code)) || code.replace('Key', '').replace('Arrow', '→ ').replace('Comma', ',').replace('Period', '.');
            const n = document.createElement('span'); n.textContent = label; row.append(k, n); list.appendChild(row);
        });
        const row = document.createElement('div'); row.className = 'midi-row kb-row'; row.innerHTML = '<kbd>1 – 8</kbd><span>Pads du sampler</span>'; list.appendChild(row);
    };
    draw(null);
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(draw).catch(() => {});
})();
})();
