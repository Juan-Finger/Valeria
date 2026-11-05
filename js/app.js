/* =========================================================
   Valéria · Turnê de Aniversário: lógica da página
   As músicas ficam em js/musicas.js (array TRACKS).
   ========================================================= */
(() => {
  'use strict';

  const TRACKS = window.TRACKS || [];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const IS_FILE = location.protocol === 'file:';
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const mod = i => (i + TRACKS.length) % TRACKS.length;

  document.documentElement.classList.add('js');

  /* ---------- Toast (avisos amigáveis) ---------- */
  const toastEl = $('#toast');
  let toastT;
  function toast(msg, ms = 5200) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  /* =========================================================
     PLAYER
     ========================================================= */
  const S = { current: 0, dir: 1, playing: false, shuffle: false, failed: new Set(), history: [], volume: 80, seeking: false };
  let yt = null, ytReady = false, ytRequested = false, ytFailed = false, pending = null, ytTimeout = null, autoplayCheck = null, tick = null;
  const audio = $('#audio');
  const player = $('#player');
  const isMp3 = i => !!(TRACKS[i] && TRACKS[i].mp3);

  const FILE_MSG = 'A música do YouTube não toca com a página aberta direto do arquivo. Sirva a pasta por http (ex.: npx serve ou python -m http.server) e abra de novo.';
  const YT_ERRORS = {
    2: 'o ID do vídeo está errado',
    5: 'o player do navegador deu erro',
    100: 'o vídeo não existe mais ou é privado',
    101: 'o dono do vídeo não deixa tocar fora do YouTube',
    150: 'o dono do vídeo não deixa tocar fora do YouTube',
    153: 'o YouTube não reconheceu o endereço da página (abra por http/https)'
  };

  /* ---------- Monta a tracklist e o select ---------- */
  const tracksEl = $('#tracks'), pick = $('#pick');
  const ACCENTS = [['pink', 'ink'], ['mint', 'ink'], ['yellow', 'ink'], ['red', 'white']];
  TRACKS.forEach((t, i) => {
    const [acc, accInk] = ACCENTS[i % ACCENTS.length];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'track';
    b.dataset.i = i;
    b.setAttribute('aria-pressed', 'false');
    b.style.setProperty('--accent', `var(--${acc})`);
    b.style.setProperty('--accent-ink', `var(--${accInk})`);
    b.innerHTML = `
      <span class="track-num" aria-hidden="true"><small>Faixa</small>${pad(i + 1)}</span>
      <span class="track-body">
        <span class="sr-only">Faixa ${i + 1}: </span>
        <span class="song">${esc(t.song)}</span>
        <span class="trait">${esc(t.trait)}</span>
        <span class="why">${esc(t.why)}</span>
      </span>
      <span class="play-tag" aria-hidden="true">
        <svg class="tri" width="18" height="18"><use href="#i-play"/></svg>
        <span class="eq"><i></i><i></i><i></i><i></i></span>
      </span>
      <span class="track-progress" aria-hidden="true"><i></i></span>
      <span class="track-fail" hidden>Não tocou aqui</span>`;
    b.addEventListener('click', () => {
      if (i === S.current && (S.playing || isLoaded())) S.playing ? pause() : resume();
      else { S.dir = 1; play(i); }
    });
    tracksEl.appendChild(b);

    const o = document.createElement('option');
    o.value = i;
    o.textContent = `${pad(i + 1)} · ${t.song}`;
    pick.appendChild(o);
  });
  const cards = $$('.track', tracksEl);

  /* ---------- YouTube: carrega a API sem travar a página ---------- */
  function loadYT() {
    if (ytRequested || IS_FILE) return;
    ytRequested = true;
    window.onYouTubeIframeAPIReady = () => {
      yt = new YT.Player('yt', {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, origin: location.origin },
        events: { onReady: onYTReady, onStateChange: onYTState, onError: onYTError }
      });
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => ytUnavailable();
    document.head.appendChild(s);
    ytTimeout = setTimeout(() => { if (!ytReady) ytUnavailable(); }, 20000);
  }
  function ytUnavailable() {
    if (ytReady || ytFailed) return;
    ytFailed = true;
    clearTimeout(ytTimeout);
    setTitle('YouTube indisponível agora');
    toast('Não consegui carregar o YouTube. Confere a internet (ou se algum bloqueador está segurando) e recarrega a página.', 8000);
  }
  function onYTReady() {
    ytReady = true;
    clearTimeout(ytTimeout);
    yt.setVolume(S.volume);
    if (pending !== null) { const p = pending; pending = null; play(p, { fromHistory: true }); }
  }
  function onYTState(e) {
    const st = YT.PlayerState;
    if (e.data === st.PLAYING) { clearTimeout(autoplayCheck); $('#toggle').classList.remove('nudge'); setPlaying(true); }
    else if (e.data === st.PAUSED) setPlaying(false);
    else if (e.data === st.ENDED) next();
  }
  function onYTError(e) {
    const i = S.current, t = TRACKS[i];
    S.failed.add(i);
    cards[i].classList.add('failed');
    $('.track-fail', cards[i]).hidden = false;
    const why = YT_ERRORS[e.data] || `erro ${e.data}`;
    console.warn(`[Valéria] "${t.song}" (${t.youtube}) não tocou: ${why}.`);
    const ytCount = TRACKS.filter((_, k) => !isMp3(k)).length;
    const failedYT = [...S.failed].filter(k => !isMp3(k)).length;
    if (failedYT >= ytCount) {
      setPlaying(false);
      setTitle('Não deu pra carregar as músicas aqui');
      toast(e.data === 153 ? FILE_MSG : `Nenhum clipe quis tocar aqui (${why}). Confere os IDs em js/musicas.js.`, 9000);
      return;
    }
    toast(`"${t.song}" não tocou: ${why}. Pulando…`);
    S.dir === -1 ? play(stepIndex(-1), { fromHistory: true }) : next();
  }
  function ytState() { return ytReady && yt.getPlayerState ? yt.getPlayerState() : -1; }
  function isLoaded() { return isMp3(S.current) ? !!audio.src : ytState() === 2; }

  /* ---------- Controles ---------- */
  function play(i, { fromHistory = false } = {}) {
    if (!TRACKS.length) return;
    if (!fromHistory && S.history[S.history.length - 1] !== S.current) S.history.push(S.current);
    if (S.history.length > 50) S.history.shift();
    S.current = mod(i);
    const t = TRACKS[S.current];
    updateUI();
    setProgress(0, 0);

    if (t.mp3) {
      if (ytReady) yt.stopVideo();
      audio.src = t.mp3;
      audio.volume = S.volume / 100;
      audio.play().then(() => setPlaying(true)).catch(() => { setPlaying(false); nudge(); });
      return;
    }
    if (!audio.paused) audio.pause();
    if (IS_FILE) { setPlaying(false); setTitle('Abra por http pra ouvir'); toast(FILE_MSG, 9000); return; }
    if (!ytReady && ytFailed) {          // tenta carregar de novo, mas já avisa
      ytFailed = false; ytRequested = false; pending = S.current;
      setTitle('YouTube indisponível agora');
      toast('Não consegui carregar o YouTube. Confere a internet (ou se algum bloqueador está segurando) e recarrega a página.', 8000);
      loadYT();
      return;
    }
    if (!ytReady) { pending = S.current; loadYT(); setTitle(`Carregando ${t.song}…`); return; }
    yt.loadVideoById(t.youtube);
    clearTimeout(autoplayCheck);
    autoplayCheck = setTimeout(() => { if (!S.playing && [-1, 5].includes(ytState())) nudge(); }, 4500);
  }
  function nudge() {
    toast('O navegador segurou o som. Toque no play aqui embaixo ▶');
    $('#toggle').classList.add('nudge');
  }
  function pause() {
    if (isMp3(S.current)) audio.pause();
    else if (ytReady) yt.pauseVideo();
    setPlaying(false);
  }
  function resume() {
    const t = TRACKS[S.current];
    if (t.mp3 && audio.src) { audio.play().then(() => setPlaying(true)).catch(nudge); return; }
    if (!t.mp3 && ytState() === 2) { yt.playVideo(); return; }
    play(S.current, { fromHistory: true });
  }
  function nextIndex() {
    const n = TRACKS.length;
    const ok = k => !S.failed.has(k) || isMp3(k);
    if (S.shuffle) {
      const recent = S.history.slice(-Math.floor(n / 2));
      let pool = [...Array(n).keys()].filter(k => k !== S.current && ok(k) && !recent.includes(k));
      if (!pool.length) pool = [...Array(n).keys()].filter(k => k !== S.current && ok(k));
      if (pool.length) return pool[(Math.random() * pool.length) | 0];
    }
    return stepIndex(1);
  }
  // próxima faixa na direção dir (1 ou -1), pulando as que já falharam
  function stepIndex(dir) {
    const n = TRACKS.length;
    for (let k = 1; k <= n; k++) {
      const i = mod(S.current + k * dir);
      if (!S.failed.has(i) || isMp3(i)) return i;
    }
    return mod(S.current + dir);
  }
  function next() { S.dir = 1; play(nextIndex()); }
  function prev() {
    if (currentTime() > 3) { seekTo(0); return; }  // como num player de verdade: volta ao começo
    S.dir = -1;
    if (S.shuffle && S.history.length) { play(S.history.pop(), { fromHistory: true }); return; }
    play(stepIndex(-1));
  }
  function currentTime() {
    if (isMp3(S.current)) return audio.currentTime || 0;
    return ytReady && yt.getCurrentTime ? yt.getCurrentTime() || 0 : 0;
  }
  function duration() {
    if (isMp3(S.current)) return isFinite(audio.duration) ? audio.duration : 0;
    return ytReady && yt.getDuration ? yt.getDuration() || 0 : 0;
  }
  function seekTo(sec) {
    if (isMp3(S.current)) audio.currentTime = sec;
    else if (ytReady) yt.seekTo(sec, true);
    setProgress(sec, duration());
  }

  /* ---------- Estado visual ---------- */
  function setPlaying(v) {
    S.playing = v;
    player.classList.toggle('playing', v);
    document.body.classList.toggle('is-playing', v);
    $('#ic-play').hidden = v;
    $('#ic-pause').hidden = !v;
    $('#toggle').setAttribute('aria-label', v ? 'Pausar' : 'Tocar');
    $('#now-label').textContent = v ? 'Tocando agora' : (S.current !== null && duration() ? 'Pausado' : 'Tocando agora');
    cards.forEach((el, k) => {
      const on = v && k === S.current;
      el.classList.toggle('playing', on);
      el.setAttribute('aria-pressed', String(on));
    });
    clearInterval(tick);
    if (v) tick = setInterval(() => setProgress(currentTime(), duration()), 250);
  }
  function setTitle(txt) { $('#now-title').textContent = txt; }
  function updateUI() {
    const t = TRACKS[S.current];
    setTitle(`${t.song} · One Direction`);
    pick.value = S.current;
    cards.forEach((el, k) => {
      el.classList.toggle('active', k === S.current);
      el.style.removeProperty('--p');
    });
  }
  const seek = $('#seek'), tCur = $('#t-cur'), tDur = $('#t-dur'), mini = $('#mini-bar');
  function setProgress(cur, dur) {
    const p = dur ? Math.min(1, cur / dur) : 0;
    if (!S.seeking) {
      seek.value = Math.round(p * 1000);
      seek.style.setProperty('--v', `${p * 100}%`);
      tCur.textContent = fmt(cur);
      seek.setAttribute('aria-valuetext', `${fmt(cur)} de ${fmt(dur)}`);
    }
    tDur.textContent = fmt(dur);
    mini.style.width = `${p * 100}%`;
    if (cards[S.current]) cards[S.current].style.setProperty('--p', p);
  }

  seek.addEventListener('input', () => {
    S.seeking = true;
    const d = duration();
    seek.style.setProperty('--v', `${seek.value / 10}%`);
    tCur.textContent = fmt(seek.value / 1000 * d);
  });
  seek.addEventListener('change', () => {
    S.seeking = false;
    seekTo(seek.value / 1000 * duration());
  });

  const vol = $('#vol');
  vol.style.setProperty('--v', `${S.volume}%`);
  vol.addEventListener('input', () => {
    S.volume = +vol.value;
    vol.style.setProperty('--v', `${S.volume}%`);
    audio.volume = S.volume / 100;
    if (ytReady) { yt.setVolume(S.volume); S.volume ? yt.unMute() : yt.mute(); }
  });

  audio.addEventListener('ended', next);
  audio.addEventListener('pause', () => { if (isMp3(S.current)) setPlaying(false); });
  audio.addEventListener('play', () => { if (isMp3(S.current)) setPlaying(true); });
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    const t = TRACKS[S.current];
    toast(`Não achei o arquivo "${t.mp3}" de "${t.song}". Pulando…`);
    S.failed.add(S.current);
    audio.removeAttribute('src');
    next();
  });

  $('#toggle').addEventListener('click', () => {
    $('#toggle').classList.remove('nudge');
    S.playing ? pause() : resume();
  });
  $('#next').addEventListener('click', next);
  $('#prev').addEventListener('click', prev);
  pick.addEventListener('change', e => { S.dir = 1; play(+e.target.value); });
  $('#shuffle').addEventListener('click', e => {
    S.shuffle = !S.shuffle;
    e.currentTarget.setAttribute('aria-pressed', String(S.shuffle));
    toast(S.shuffle ? 'Modo aleatório ligado' : 'Modo aleatório desligado', 1800);
  });
  $('#now-btn').addEventListener('click', () => {
    const card = cards[S.current];
    card.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
    card.focus({ preventScroll: true });
  });

  const videoBox = $('#video-box');
  $('#video-toggle').addEventListener('click', e => {
    const hidden = videoBox.classList.toggle('hidden');
    e.currentTarget.setAttribute('aria-pressed', String(!hidden));
    e.currentTarget.setAttribute('aria-label', hidden ? 'Mostrar o clipe' : 'Esconder o clipe');
    if (!hidden && IS_FILE) toast(FILE_MSG, 9000);
  });
  $('#expand').addEventListener('click', e => {
    const open = player.classList.toggle('expanded');
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.setAttribute('aria-label', open ? 'Menos controles' : 'Mais controles');
  });

  // altura real do player → posiciona vídeo, toast e o espaço no fim da página
  const setPlayerH = () => document.documentElement.style.setProperty('--player-h', `${player.offsetHeight}px`);
  if ('ResizeObserver' in window) new ResizeObserver(setPlayerH).observe(player);
  setPlayerH();

  // atalhos de teclado (fora de campos): espaço/K = play/pausa, ←/→ com Shift = anterior/próxima
  document.addEventListener('keydown', e => {
    if (!splash.classList.contains('gone') || !lb.hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea', 'button', 'a'].includes(tag)) return;
    if (e.key === 'k' || e.key === ' ') { e.preventDefault(); S.playing ? pause() : resume(); }
    if (e.shiftKey && e.key === 'ArrowRight') next();
    if (e.shiftKey && e.key === 'ArrowLeft') prev();
  });

  /* =========================================================
     SPLASH (ingresso)
     ========================================================= */
  const splash = $('#splash'), main = $('main');
  const setInert = on => { main.inert = on; player.inert = on; };
  document.documentElement.classList.add('splash-open');
  setInert(true);
  $('#enter').focus({ preventScroll: true });

  $('#enter').addEventListener('click', () => {
    play(0);                              // dentro do clique: o navegador libera o som
    confetti({ n: 170 });
    splash.classList.add('tearing');
    const done = () => {
      splash.classList.add('gone');
      document.documentElement.classList.remove('splash-open');
      setInert(false);
      $('#topo').focus({ preventScroll: true });
      setTimeout(() => { splash.hidden = true; }, 800);
    };
    reduceMotion.matches ? done() : setTimeout(done, 650);
  }, { once: true });

  // a API do YouTube começa a carregar quando a página termina de abrir (sem travar nada),
  // para o player já estar pronto no clique. No iPhone isso faz diferença pro autoplay.
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 600));
  if (document.readyState === 'complete') idle(loadYT, { timeout: 1500 });
  else addEventListener('load', () => idle(loadYT, { timeout: 1500 }), { once: true });
  if (IS_FILE) setTitle('Abra por http pra ouvir');

  /* =========================================================
     LIGHTBOX
     ========================================================= */
  const lb = $('#lightbox'), lbFig = $('#lb-figure'), lbFrame = $('#lb-frame'), lbImg = $('#lb-img'), lbCap = $('#lb-cap'), lbCount = $('#lb-count');
  const photos = $$('.photo');
  let lbIndex = 0, lbOpener = null;

  function showPhoto(i) {
    lbIndex = (i + photos.length) % photos.length;
    const p = photos[lbIndex];
    const crop = p.dataset.crop;
    lbFrame.className = `lb-frame ${crop}`;
    lbFig.classList.toggle('is-round', crop === 'crop-2');
    lbImg.src = p.dataset.full;
    lbImg.alt = p.dataset.alt;
    lbCap.textContent = p.dataset.cap;
    lbCount.textContent = `${lbIndex + 1} / ${photos.length}`;
    // reinicia a animação de entrada
    lbFig.style.animation = 'none'; void lbFig.offsetWidth; lbFig.style.animation = '';
  }
  function openLb(i, opener) {
    lbOpener = opener;
    showPhoto(i);
    lb.hidden = false;
    document.documentElement.classList.add('lb-open');
    setInert(true);
    $('#lb-close').focus();
  }
  function closeLb() {
    lb.hidden = true;
    document.documentElement.classList.remove('lb-open');
    setInert(false);
    if (lbOpener) lbOpener.focus({ preventScroll: true });
  }
  photos.forEach((p, i) => p.addEventListener('click', () => openLb(i, p)));
  $('#lb-close').addEventListener('click', closeLb);
  $('#lb-prev').addEventListener('click', () => showPhoto(lbIndex - 1));
  $('#lb-next').addEventListener('click', () => showPhoto(lbIndex + 1));
  lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lb-stage')) closeLb(); });
  lb.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeLb(); }
    else if (e.key === 'ArrowLeft') showPhoto(lbIndex - 1);
    else if (e.key === 'ArrowRight') showPhoto(lbIndex + 1);
    else if (e.key === 'Tab') { // mantém o foco dentro da foto ampliada
      const f = $$('button', lb);
      const k = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  let tx = null, ty = null;
  lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) showPhoto(lbIndex + (dx < 0 ? 1 : -1));
    tx = null;
  });

  /* =========================================================
     MEDIDOR DE AUTOESTIMA
     ========================================================= */
  const ego = $('#ego'), egoOut = $('#ego-out'), quip = $('#quip'), ledsEl = $('#leds');
  const QUIPS = ['Ops, aqui não desce.', 'Autoestima da Valéria não aceita desconto.', 'Tentou, né?', 'Sistema bloqueado: só funciona no máximo.', 'Nem adianta, volta pro 100.'];
  const LEDS = 20;
  for (let k = 0; k < LEDS; k++) {
    const i = document.createElement('i');
    if (k >= 12) i.classList.add('y');
    if (k >= 17) i.classList.remove('y'), i.classList.add('r');
    ledsEl.appendChild(i);
  }
  const ledEls = [...ledsEl.children];
  let qi = 0, attempt = false, dragging = false, snapT = null, anim = null;

  function renderEgo() {
    const v = +ego.value;
    egoOut.textContent = `${v}%`;
    ego.style.setProperty('--v', `${v}%`);
    ego.setAttribute('aria-valuetext', v === 100 ? '100%, no máximo' : `${v}%`);
    const lit = Math.round(v / 100 * LEDS);
    ledEls.forEach((el, k) => el.classList.toggle('on', k < lit));
  }
  function newQuip() {
    quip.textContent = QUIPS[qi++ % QUIPS.length];
    quip.classList.remove('bump'); void quip.offsetWidth; quip.classList.add('bump');
  }
  function snapBack() {
    if (dragging) return;
    cancelAnimationFrame(anim);
    const from = +ego.value;
    if (from >= 100) { attempt = false; return; }
    if (reduceMotion.matches) { ego.value = 100; renderEgo(); attempt = false; return; }
    const t0 = performance.now(), dur = 380 + (100 - from) * 4;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      ego.value = Math.round(from + (100 - from) * e);
      renderEgo();
      if (t < 1) anim = requestAnimationFrame(step); else attempt = false;
    };
    anim = requestAnimationFrame(step);
  }
  ego.addEventListener('input', () => {
    cancelAnimationFrame(anim);
    renderEgo();
    if (+ego.value < 100) {
      if (!attempt) { attempt = true; newQuip(); }
      clearTimeout(snapT);
      snapT = setTimeout(snapBack, dragging ? 900 : 450);
    }
  });
  ego.addEventListener('pointerdown', () => { dragging = true; });
  const release = () => { if (!dragging) return; dragging = false; clearTimeout(snapT); snapT = setTimeout(snapBack, 120); };
  ['pointerup', 'pointercancel', 'blur'].forEach(ev => ego.addEventListener(ev, release));
  addEventListener('pointerup', release);
  renderEgo();

  /* =========================================================
     FINI: repor o estoque
     ========================================================= */
  let refills = 0;
  $('#refill').addEventListener('click', e => {
    refills++;
    $('#refill-count').textContent = refills === 1 ? 'Estoque reposto: 1 pacotinho.' : `Estoque reposto: ${refills} pacotinhos.`;
    const r = e.currentTarget.getBoundingClientRect();
    confetti({ n: 40, x: r.left + r.width / 2, y: r.top, candy: true });
  });

  /* =========================================================
     VELINHAS
     ========================================================= */
  const candles = $$('.candle');
  const countEl = $('#candle-count'), wish = $('#wish'), relight = $('#relight');
  const lit = () => candles.filter(c => !c.classList.contains('out')).length;
  function updateCount() {
    const n = lit();
    countEl.textContent = n === 0 ? 'Todas apagadas' : n === 1 ? 'Falta 1 velinha' : n === candles.length ? `${n} velinhas acesas` : `Faltam ${n} velinhas`;
  }
  candles.forEach(c => c.addEventListener('click', () => {
    if (c.classList.contains('out')) return;
    c.classList.add('out');
    c.setAttribute('aria-label', 'Velinha apagada');
    c.setAttribute('aria-disabled', 'true');
    updateCount();
    if (!lit()) {
      wish.textContent = 'Pedido feito! Que venha um ano incrível ♡';
      wish.classList.remove('show'); void wish.offsetWidth; wish.classList.add('show');
      relight.hidden = false;
      const r = $('#cake-stage').getBoundingClientRect();
      confetti({ n: 120, x: r.left + r.width / 2, y: r.top + r.height * .3 });
      confetti({ n: 120 });
    }
  }));
  relight.addEventListener('click', () => {
    candles.forEach((c, i) => {
      c.classList.remove('out');
      c.setAttribute('aria-label', `Apagar velinha ${i + 1}`);
      c.removeAttribute('aria-disabled');
    });
    wish.textContent = '';
    relight.hidden = true;
    updateCount();
    candles[0].focus();
  });

  /* =========================================================
     REVELAR NO SCROLL
     ========================================================= */
  // escalonar a entrada dos cards da tracklist e das paradas
  cards.forEach((c, i) => { c.dataset.reveal = ''; c.style.setProperty('--d', `${(i % 2) * 0.08}s`); });
  $$('.tour li').forEach((li, i) => li.style.setProperty('--d', `${i * 0.06}s`));
  const reveal = $$('[data-reveal]');
  // depois que aparece, tira o atributo pra devolver as transições próprias do elemento (hover etc.)
  const shown = el => { el.classList.add('in'); setTimeout(() => el.removeAttribute('data-reveal'), 1100); };
  if (!reduceMotion.matches && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { shown(en.target); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    reveal.forEach(el => io.observe(el));
  } else reveal.forEach(shown);

  /* =========================================================
     CONFETE (canvas, sem biblioteca)
     ========================================================= */
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  let parts = [], raf = 0, dpr = 1;
  const COLORS = ['#D92B24', '#FFD84A', '#9FE3D0', '#F4A6B8', '#1B1F3B', '#FFFFFF'];
  const CANDY = ['#F4A6B8', '#9FE3D0', '#FFD84A', '#D92B24'];
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
  }
  addEventListener('resize', resize);
  resize();

  function confetti({ n = 150, x = null, y = null, candy = false } = {}) {
    if (reduceMotion.matches) return;
    const burst = x !== null;
    for (let i = 0; i < n && parts.length < 700; i++) {
      const shape = candy ? 'tube' : (Math.random() < .18 ? 'tube' : Math.random() < .5 ? 'rect' : 'dot');
      const a = -Math.PI / 2 + (Math.random() - .5) * 1.9;
      const sp = (5 + Math.random() * 8) * dpr;
      const w = (shape === 'tube' ? 18 + Math.random() * 8 : 6 + Math.random() * 8) * dpr;
      parts.push({
        shape,
        x: burst ? x * dpr : Math.random() * cv.width,
        y: burst ? y * dpr : -20 * dpr - Math.random() * cv.height * .35,
        w, h: (shape === 'tube' ? 8 : 8 + Math.random() * 10) * dpr,
        vx: burst ? Math.cos(a) * sp : (Math.random() - .5) * 3 * dpr,
        vy: burst ? Math.sin(a) * sp : (2 + Math.random() * 3) * dpr,
        r: Math.random() * Math.PI, vr: (Math.random() - .5) * .25,
        c: (shape === 'tube' ? CANDY : COLORS)[(Math.random() * (shape === 'tube' ? CANDY.length : COLORS.length)) | 0]
      });
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function drawTube(p) {
    const r = p.h / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-p.w / 2, -r, p.w, p.h, r); else ctx.rect(-p.w / 2, -r, p.w, p.h);
    ctx.fillStyle = p.c; ctx.fill();
    ctx.lineWidth = 1.4 * dpr; ctx.strokeStyle = '#1B1F3B'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(k * p.w / 3.4, (k % 2 ? -1 : 1) * r * .3, .9 * dpr, 0, 7); ctx.fill(); }
  }
  function frame() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.y < cv.height + 60 && p.x > -60 && p.x < cv.width + 60);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      p.vy += .09 * dpr; p.vx *= .99;
      if (p.vy > 6 * dpr) p.vy = 6 * dpr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      if (p.shape === 'tube') drawTube(p);
      else if (p.shape === 'dot') { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(frame) : (ctx.clearRect(0, 0, cv.width, cv.height), 0);
  }
})();
