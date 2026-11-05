(function initializeShortsPractice() {
  'use strict';

  // ── 기준 데이터 ───────────────────────────────────────────
  // 훈련 세트(레퍼런스 쇼츠 + 자막 + 말 빠르기)는 reference-sets.js에 있다.
  const SETS = (window.REFERENCE_SETS || []).filter(set => set && set.id && set.videoId);
  const STORE_KEY = 'galleria-video-reference-v2';
  const DEFAULT_SCRIPT = [
    '00–03초 공덕에서 만나는, 피부를 위한 새로운 공간.',
    '03–10초 당신의 이야기를 듣는 곳.',
    '10–19초 피부를 이해하는 정교한 시선.',
    '19–26초 편안히 머무를 수 있도록.',
    '26–30초 갤러리아피부과 마포공덕'
  ].join('\n');

  const $ = id => document.getElementById(id);
  const el = {
    clock: $('clock'), beatNow: $('beat-now'), timebar: $('timebar'), screen: $('screen'), track: $('track'),
    play: $('play'), prev: $('prev'), next: $('next'), restart: $('restart'), fullscreen: $('fullscreen'),
    size: $('size'), speed: $('speed'), countdown: $('countdown'), countdownWrap: $('countdown-wrap'), mirror: $('mirror'), karaoke: $('karaoke'), karaokeWrap: $('karaoke-wrap'),
    status: $('status'), keyHint: $('key-hint'), desk: $('desk'),
    ytFallback: $('yt-fallback'), ytMute: $('yt-mute'), loopBeat: $('loop-beat'),
    loopWrap: $('loop-wrap'),
    panelWatch: $('panel-watch'), panelRef: $('panel-ref'), panelPractice: $('panel-practice'), panelResult: $('panel-result'), panelEmpty: $('panel-practice-empty'),
    watchSource: $('watch-source'), pasteBox: $('paste-box'), refScript: $('ref-script'),
    sets: $('sets'), facts: $('facts'), fullLink: $('full-link'),
    script: $('script'), advance: $('advance'), pace: $('pace'), paceOut: $('pace-out'), paceRef: $('pace-ref'), target: $('target'), loadStory: $('load-story'),
    rTime: $('r-time'), rTarget: $('r-target'), rPace: $('r-pace'), rNote: $('r-note'),
    timeline: document.querySelector('#timeline tbody'), thMine: $('th-mine')
  };

  const state = {
    mode: 'watch', set: SETS[0], refScripts: {}, lines: [], current: 0, playing: false, lastTick: 0, countdownLeft: 0,
    manualIndex: 0, marks: [], activeIndex: -1, loopIndex: -1,
    ytFailed: false, ytReason: ''
  };

  // ── 유틸 ────────────────────────────────────────────────
  const fmtClock = sec => {
    const s = Math.max(0, sec);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' + Math.floor((s * 10) % 10);
  };
  const fmt = sec => { const s = Math.max(0, Math.round(sec)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const syllables = text => (text.match(/[가-힣]/g) || []).length + (text.match(/\d/g) || []).length + Math.round((text.match(/[A-Za-z]/g) || []).length / 2);
  const totalTime = () => (state.lines.length ? state.lines[state.lines.length - 1].end : 0);
  const isManual = () => state.mode === 'practice' && el.advance.value === 'manual';
  const target = () => Number(el.target.value) || 0;
  const setStatus = text => { el.status.textContent = text || ''; };
  const refPace = () => state.set?.pace || 6.6;

  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; } }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        referenceSourceVersion: 1, mode: state.mode, script: el.script.value, set: state.set?.id, refScripts: state.refScripts, watchSource: el.watchSource.value, advance: el.advance.value, pace: el.pace.value, target: el.target.value, size: el.size.value, mirror: el.mirror.checked, karaoke: el.karaoke.checked
      }));
    } catch { /* 저장이 막힌 브라우저에서는 저장 없이 동작 */ }
  }

  // ── 대본 해석 ───────────────────────────────────────────
  function parseTime(raw) {
    const sec = (mm, ss, frac) => Number(mm) * 60 + Number(ss) + (frac ? Number('0.' + frac) : 0);
    // [00:04 ~ 00:09] 처럼 시작과 끝을 함께 쓴 구간
    let m = raw.match(/^\s*\[?\s*(\d{1,2}):(\d{2})(?:\.(\d+))?\s*[~–-]\s*(\d{1,2}):(\d{2})(?:\.(\d+))?\s*\]?\s*/);
    if (m) return { start: sec(m[1], m[2], m[3]), end: sec(m[4], m[5], m[6]), rest: raw.slice(m[0].length) };
    m = raw.match(/^\s*\[?(\d{1,2}):(\d{2})(?:\.(\d+))?\]?\s*/);
    if (m) return { start: Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number('0.' + m[3]) : 0), end: null, rest: raw.slice(m[0].length) };
    m = raw.match(/^\s*(\d{1,3})\s*[–~-]\s*(\d{1,3})\s*초\s*/);
    if (m) return { start: Number(m[1]), end: Number(m[2]), rest: raw.slice(m[0].length) };
    return { start: null, end: null, rest: raw };
  }

  function linesFromScript(text, pace) {
    const rows = text.split('\n').map(parseTime).filter(row => row.rest.trim());
    const out = [];
    let cursor = 0;
    for (const row of rows) {
      const start = row.start ?? cursor;
      const natural = start + Math.max(1.2, syllables(row.rest) / pace);
      const end = row.end > start ? row.end : natural;
      out.push({ start, end, timed: row.start !== null, text: row.rest.trim() });
      cursor = end + (row.end > start ? 0 : 0.3);
    }
    out.sort((a, b) => a.start - b.start);
    for (let i = 0; i < out.length - 1; i++) out[i].end = out[i + 1].timed ? out[i + 1].start : Math.min(out[i].end, out[i + 1].start);
    return out.map(({ timed, ...line }) => line);
  }

  // ── 그리기 ──────────────────────────────────────────────
  function currentIndex() {
    if (!state.lines.length) return -1;
    if (isManual()) return Math.min(state.manualIndex, state.lines.length - 1);
    let found = 0;
    for (let i = 0; i < state.lines.length; i++) if (state.lines[i].start <= state.current + 0.001) found = i;
    return found;
  }

  function scale() { return Math.max(totalTime(), state.mode === 'practice' ? target() : 0) || 1; }

  function render() {
    el.track.replaceChildren();
    el.timeline.replaceChildren();
    el.timebar.replaceChildren();
    const showMine = state.mode === 'practice' && isManual() && state.marks.length > 1;
    el.thMine.hidden = !showMine;
    state.lines.forEach((line, index) => {
      const p = document.createElement('p');
      p.className = 'prompter-line';
      if (line.label) { const tag = document.createElement('span'); tag.className = 'prompter-label'; tag.textContent = line.label; p.append(tag); }
      const text = document.createElement('span'); text.className = 'prompter-text'; text.textContent = line.text; p.append(text);
      p.addEventListener('click', () => jump(index));
      el.track.append(p);

      const syl = line.syl ?? syllables(line.text);
      const length = Math.max(0.1, line.end - line.start);
      const tr = document.createElement('tr');
      const cells = [[fmt(line.start) + ' – ' + fmt(line.end), '시간'], [(line.label ? line.label + ' · ' : '') + line.text, '문장'], [syl + '음절', '음절'], [(syl / length).toFixed(1) + '/초', '속도']];
      if (showMine) {
        const dur = state.marks[index + 1] - state.marks[index];
        const pace = dur > 0 ? syl / dur : 0;
        const mine = Number.isFinite(dur) ? dur.toFixed(1) + '초 · ' + pace.toFixed(1) + '/초' : '-';
        cells.push([mine, '내 기록', pace > refPace() * 1.15 ? 'fast' : pace && pace < refPace() * 0.76 ? 'slow' : '']);
      }
      for (const [value, label, cls] of cells) {
        const td = document.createElement('td');
        td.textContent = value; td.dataset.label = label;
        if (cls) td.className = cls;
        tr.append(td);
      }
      tr.addEventListener('click', () => { jump(index); el.desk.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
      el.timeline.append(tr);

      const seg = document.createElement('span');
      seg.style.setProperty('--w', String(length));
      el.timebar.append(seg);
    });
    const rest = scale() - totalTime();
    if (rest > 0.1) { const pad = document.createElement('span'); pad.style.setProperty('--w', String(rest)); pad.style.background = 'transparent'; pad.style.outline = '1px dashed #3a312a'; el.timebar.append(pad); }
    if (state.mode === 'practice' && target()) {
      const mark = document.createElement('i');
      mark.className = 'target'; mark.title = '목표 길이';
      mark.style.left = `calc(${(target() / scale()) * 100}% - 1px)`;
      el.timebar.append(mark);
    }
    state.activeIndex = -1;
    update();
  }

  // 노래방처럼 지금 문장을 시간 비율만큼 왼쪽부터 채운다. 직접 넘기기 모드는 시간 정보가 없어 채우지 않는다.
  function fillActive(index) {
    const text = el.track.children[index]?.querySelector('.prompter-text');
    if (!text) return;
    const line = state.lines[index];
    const ratio = isManual() ? 0 : Math.min(1, Math.max(0, (state.current - line.start) / Math.max(0.1, line.end - line.start)));
    text.style.setProperty('--k', (ratio * 100).toFixed(1) + '%');
  }

  function update() {
    const total = state.mode === 'practice' && target() ? target() : totalTime();
    const time = state.mode === 'practice' && isManual() ? state.current : state.current;
    el.clock.firstChild.textContent = fmtClock(time);
    el.clock.lastChild.textContent = '/ ' + fmt(total);
    el.clock.classList.toggle('is-over', state.mode === 'practice' && target() > 0 && time > target());
    const index = currentIndex();
    fillActive(index);
    if (index === state.activeIndex) return;
    state.activeIndex = index;
    [...el.track.children].forEach((node, i) => { node.classList.toggle('is-active', i === index); node.classList.toggle('is-past', i < index); });
    [...el.timeline.children].forEach((node, i) => node.classList.toggle('is-active', i === index));
    [...el.timebar.querySelectorAll('span')].forEach((node, i) => { node.classList.toggle('is-active', i === index); node.classList.toggle('is-done', i < index); });
    const line = state.lines[index];
    el.beatNow.replaceChildren();
    if (line) {
      const strong = document.createElement('strong');
      strong.textContent = line.label || `${index + 1} / ${state.lines.length}번째 문장`;
      el.beatNow.append(strong, document.createTextNode(fmt(line.start) + ' – ' + fmt(line.end)));
    }
    const node = el.track.children[index];
    if (node) el.track.style.transform = `translateY(${el.screen.clientHeight * 0.36 - node.offsetTop - node.offsetHeight / 2}px)`;
  }

  // ── 레퍼런스 영상 ───────────────────────────────────────
  // 공식 IFrame API(api)를 먼저 쓰고, 그 스크립트가 막히면 iframe에 직접 명령을 보내는 방식(msg)으로 바꾼다.
  const YT_ORIGIN = 'https://www.youtube.com';
  const YT_ERRORS = {
    2: '영상 주소가 잘못됐어요.',
    5: '이 브라우저에서 유튜브 플레이어를 재생하지 못해요.',
    100: '영상이 삭제됐거나 비공개로 바뀌었어요.',
    101: '영상 주인이 다른 사이트에서의 재생을 막았어요.',
    150: '영상 주인이 다른 사이트에서의 재생을 막았어요.',
    153: '유튜브가 이 페이지 주소를 확인하지 못했어요.'
  };
  const yt = {
    kind: null, ready: false, player: null, frame: null, unlinked: false, pendingPlay: false,
    time: 0, stamp: 0, state: -1, rate: 1,
    now() {
      if (this.kind === 'api') return this.player.getCurrentTime() || 0;
      return this.state === 1 ? this.time + ((performance.now() - this.stamp) / 1000) * this.rate : this.time;
    },
    call(func, ...args) {
      if (!this.ready) return;
      if (this.kind === 'api') this.player[func](...args);
      else this.frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), YT_ORIGIN);
    },
    play() { this.call('setPlaybackRate', Number(el.speed.value)); this.call('playVideo'); },
    pause() { this.call('pauseVideo'); },
    seek(t) { this.call('seekTo', t, true); if (this.kind === 'msg') { this.time = t; this.stamp = performance.now(); } },
    mute(on) { this.call(on ? 'mute' : 'unMute'); },
    setRate(r) { this.call('setPlaybackRate', r); }
  };
  const embedUrl = id => `${YT_ORIGIN}/embed/${id}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`;
  const canFollowVideo = () => state.mode === 'watch' && yt.ready;

  function onYtReady() {
    if (yt.ready) return;
    yt.ready = true; state.ytFailed = false; refreshStage();
    if (yt.kind === 'msg') ['onStateChange', 'onError'].forEach(name => yt.call('addEventListener', name));
    yt.mute(el.ytMute.checked);
    if (yt.pendingPlay) { yt.pendingPlay = false; setStatus(''); yt.play(); }
  }

  function onYtState(code) {
    if (code === yt.state) return;
    yt.state = code;
    if (state.mode !== 'watch') return;
    if (code === 1) { if (!state.playing) startLoop(); }
    else if (code === 2 || code === 0) { state.playing = false; syncFromPlayer(); setPlayButton(); }
  }

  function onYtError(code) {
    yt.pendingPlay = false;
    state.ytFailed = true;
    state.ytReason = (YT_ERRORS[code] || '유튜브 플레이어에서 오류가 났어요.') + ` (오류 ${code})`;
    refreshStage();
  }

  function messageEmbed() {
    const holder = document.getElementById('yt-player');
    if (yt.ready || yt.kind || !holder) return;
    yt.kind = 'msg';
    const frame = document.createElement('iframe');
    frame.id = 'yt-player';
    frame.title = '레퍼런스 쇼츠';
    frame.src = embedUrl(state.set.videoId);
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    holder.replaceWith(frame);
    yt.frame = frame;
    // 플레이어가 대답할 때까지 '듣고 있다'는 신호를 보낸다(최대 15초).
    let tries = 0;
    const hello = setInterval(() => {
      if (yt.ready) { clearInterval(hello); return; }
      if (++tries > 60) {
        clearInterval(hello);
        yt.unlinked = true;
        if (yt.pendingPlay) { yt.pendingPlay = false; startLoop(); }
        setStatus('영상은 보이지만 프롬프터와 연결되지 않았어요. 영상 재생과 ▶ 시작을 함께 눌러 주세요.');
        return;
      }
      frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT_ORIGIN);
    }, 250);
  }

  window.addEventListener('message', event => {
    if (yt.kind !== 'msg' || event.origin !== YT_ORIGIN || event.source !== yt.frame?.contentWindow) return;
    let data;
    try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
    if (!data || typeof data !== 'object') return;
    if (data.event === 'onReady') onYtReady();
    else if ((data.event === 'infoDelivery' || data.event === 'initialDelivery') && data.info) {
      onYtReady();
      if (typeof data.info.currentTime === 'number') { yt.time = data.info.currentTime; yt.stamp = performance.now(); }
      if (typeof data.info.playbackRate === 'number') yt.rate = data.info.playbackRate;
      if (typeof data.info.playerState === 'number') onYtState(data.info.playerState);
    } else if (data.event === 'onStateChange') onYtState(Number(data.info));
    else if (data.event === 'onError') onYtError(Number(data.info));
  });

  function loadPlayer() {
    const slow = setTimeout(messageEmbed, 12000);
    window.onYouTubeIframeAPIReady = () => {
      if (yt.kind) return;
      yt.kind = 'api';
      yt.player = new YT.Player('yt-player', {
        videoId: state.set.videoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onReady: () => { clearTimeout(slow); onYtReady(); },
          onStateChange: event => onYtState(event.data),
          onError: event => { clearTimeout(slow); onYtError(event.data); }
        }
      });
    };
    const script = document.createElement('script');
    script.src = YT_ORIGIN + '/iframe_api';
    script.onerror = () => { clearTimeout(slow); messageEmbed(); };
    document.head.append(script);
  }

  function syncFromPlayer() {
    if (yt.ready) { state.current = yt.now(); update(); }
  }

  // 세트를 바꾸면 영상만 갈아 끼우고(재생은 하지 않음) 플레이어는 그대로 쓴다.
  function changeVideo(id) {
    yt.pendingPlay = false;
    if (yt.kind === 'api' && yt.player?.cueVideoById) yt.player.cueVideoById(id);
    else if (yt.kind === 'msg' && yt.ready) yt.call('cueVideoById', id);
    else if (yt.kind === 'msg' && yt.frame) yt.frame.src = embedUrl(id);
    yt.time = 0; yt.stamp = performance.now();
  }

  // ── 재생 루프 ───────────────────────────────────────────
  function startLoop() {
    state.playing = true; state.lastTick = performance.now(); setPlayButton(); setStatus('');
    requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!state.playing) return;
    const delta = (now - state.lastTick) / 1000;
    state.lastTick = now;
    if (state.mode === 'watch') {
      if (yt.ready) {
        state.current = yt.now();
        const loop = state.lines[state.loopIndex];
        if (el.loopBeat.checked && loop && state.current >= loop.end - 0.05) yt.seek(loop.start);
      } else {
        state.current += delta * Number(el.speed.value);
        if (state.current >= totalTime()) { state.current = totalTime(); state.playing = false; setPlayButton(); }
      }
    } else if (state.countdownLeft > 0) {
      state.countdownLeft -= delta;
      el.screen.dataset.countdown = state.countdownLeft > 0 ? String(Math.ceil(state.countdownLeft)) : '';
      if (state.countdownLeft <= 0) beginTake();
    } else {
      state.current += delta * (isManual() ? 1 : Number(el.speed.value));
      if (!isManual() && state.current >= totalTime()) { state.current = totalTime(); update(); finish(); return; }
    }
    update();
    requestAnimationFrame(tick);
  }

  function setPlayButton() {
    el.play.setAttribute('aria-pressed', String(state.playing));
    if (state.mode === 'practice' && state.playing) el.play.textContent = isManual() ? '■ 끝내기' : '⏸ 멈춤';
    else if (state.mode === 'watch' && state.playing) el.play.textContent = '⏸ 멈춤';
    else el.play.textContent = state.current > 0.05 && !isManual() && state.current < totalTime() ? '▶ 이어서' : '▶ 시작';
  }

  function play() {
    if (!state.lines.length) { setStatus(state.mode === 'practice' ? '먼저 아래 칸에 대본을 써 주세요.' : '먼저 아래 칸에 레퍼런스 대본을 붙여 넣어 주세요.'); return; }
    if (state.mode === 'watch') {
      // 시작을 누르면 유튜브 영상도 같이 재생한다. 프롬프터는 영상 시간을 따라간다.
      if (yt.ready) { if (state.current >= totalTime() - 0.05) yt.seek(0); yt.play(); }
      else if (!state.ytFailed && !yt.unlinked) { yt.pendingPlay = true; setStatus('영상을 준비하는 중이에요. 준비되면 같이 시작합니다.'); }
      else startLoop();
      return;
    }
    const fresh = isManual() || state.current <= 0.05 || state.current >= totalTime();
    if (fresh) { state.current = 0; state.manualIndex = 0; state.marks = []; el.panelResult.hidden = true; render(); }
    state.countdownLeft = fresh && el.countdown.checked ? 3 : 0;
    startLoop();
    if (!state.countdownLeft) beginTake();
  }

  function beginTake() {
    el.screen.dataset.countdown = '';
    state.lastTick = performance.now();
    if (isManual() && !state.marks.length) state.marks = [0];
    setPlayButton();
  }

  function pause() {
    if (state.mode === 'watch') { yt.pendingPlay = false; if (yt.ready) yt.pause(); else { state.playing = false; setPlayButton(); } return; }
    if (isManual()) { finish(); return; }
    state.playing = false; state.countdownLeft = 0; el.screen.dataset.countdown = '';
    setPlayButton();
  }

  function jump(index) {
    if (!state.lines.length) return;
    const i = Math.max(0, Math.min(state.lines.length - 1, index));
    if (isManual()) {
      if (state.playing) {
        if (i > state.manualIndex) return advanceManual();
        if (i < state.manualIndex) { state.marks.pop(); state.manualIndex = Math.max(0, state.manualIndex - 1); update(); }
        return;
      }
      state.manualIndex = i; update(); return;
    }
    state.loopIndex = i;
    state.current = state.lines[i].start;
    if (canFollowVideo()) yt.seek(state.current);
    update();
  }

  function advanceManual() {
    if (state.countdownLeft > 0) return;
    state.marks[state.manualIndex + 1] = state.current;
    if (state.manualIndex >= state.lines.length - 1) { finish(); return; }
    state.manualIndex += 1;
    update();
  }

  function restart() {
    if (canFollowVideo()) { yt.pause(); yt.seek(0); }
    state.playing = false; state.countdownLeft = 0; el.screen.dataset.countdown = '';
    state.current = 0; state.manualIndex = 0; state.marks = []; state.loopIndex = 0;
    setPlayButton(); render(); setStatus('');
  }

  function finish() {
    state.playing = false; state.countdownLeft = 0; el.screen.dataset.countdown = '';
    if (isManual() && state.marks.length === state.manualIndex + 1) state.marks[state.manualIndex + 1] = state.current;
    setPlayButton();
    showResult();
    render();
  }

  function showResult() {
    const elapsed = state.current;
    if (elapsed < 0.5) return;
    const doneCount = isManual() ? Math.max(0, state.marks.length - 1) : state.lines.length;
    const syl = state.lines.slice(0, doneCount).reduce((sum, line) => sum + syllables(line.text), 0);
    const pace = syl / elapsed;
    el.rTime.textContent = elapsed.toFixed(1) + '초';
    const t = target();
    el.rTarget.textContent = t ? (elapsed - t >= 0 ? '+' : '') + (elapsed - t).toFixed(1) + '초' : '-';
    el.rPace.textContent = pace.toFixed(1) + '/초';
    const notes = [];
    if (isManual()) {
      if (pace < refPace() * 0.8) notes.push(`레퍼런스(초당 ${refPace().toFixed(1)}음절)보다 여유롭게 말했어요. 설명형 쇼츠라면 조금 더 붙여 읽어도 됩니다.`);
      else if (pace > refPace() * 1.15) notes.push('레퍼런스보다 빠릅니다. 숫자·병원 이름처럼 들려야 하는 말은 한 박자 늦춰 보세요.');
      else notes.push('레퍼런스와 비슷한 속도예요.');
      notes.push('아래 표의 「내 기록」에서 파란색은 느린 문장, 빨간색은 빠른 문장입니다.');
    } else {
      notes.push('자동 모드라 대본에 맞춘 시간입니다. 따라가기 버거웠던 문장을 짧게 고쳐 보세요.');
    }
    if (t && elapsed > t + 0.5) notes.push(`목표 ${t}초보다 ${(elapsed - t).toFixed(1)}초 길어요. 한두 문장을 줄이거나 합쳐 보세요.`);
    else if (t && elapsed < t - 3) notes.push(`목표 ${t}초보다 ${(t - elapsed).toFixed(1)}초 남아요. 화면만 보여 주는 쉼을 넣어도 좋습니다.`);
    el.rNote.textContent = notes.join(' ');
    el.panelResult.hidden = false; el.panelEmpty.hidden = true;
  }

  function refreshStage() {
    el.ytFallback.hidden = !state.ytFailed;
    // 파일로 직접 열면(file://) 유튜브가 사이트 주소를 확인하지 못해 재생을 막는다(오류 153).
    if (!state.ytFailed) return;
    const box = el.ytFallback.firstElementChild;
    if (location.protocol === 'file:') {
      box.innerHTML = '파일로 직접 열어서 유튜브가 재생을 막았어요.<br>게시된 사이트 주소나 <b>http://localhost</b> 주소로 열어 주세요.<br><br>지금은 아래 「원본 풀 영상」 링크로 보면서<br>프롬프터는 ▶ 시작으로 따로 돌릴 수 있어요.';
    } else {
      box.replaceChildren('영상을 불러오지 못했어요.', document.createElement('br'), state.ytReason || '', document.createElement('br'), document.createElement('br'), '아래 「원본 풀 영상」 링크로 보면서', document.createElement('br'), '프롬프터는 ▶ 시작으로 따로 돌릴 수 있어요.');
    }
  }

  // ── 모드 · 소스 ─────────────────────────────────────────
  function buildLines() {
    const source = el.watchSource.value;
    if (state.mode === 'watch') state.lines = linesFromScript(source === 'paste' ? el.refScript.value : state.set?.script || '', refPace());
    else state.lines = linesFromScript(el.script.value, Number(el.pace.value));
  }

  function setMode(mode) {
    if (state.playing) pause();
    if (mode === 'practice') { yt.pendingPlay = false; yt.pause(); }
    state.mode = mode;
    document.querySelectorAll('.modes [role=radio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    const practice = mode === 'practice';
    el.loopWrap.hidden = practice; // 구간 반복은 영상과 프롬프터가 연동되는 보기 단계에서만
    if (practice) el.loopBeat.checked = false;
    el.panelWatch.hidden = practice; el.panelRef.hidden = practice;
    el.panelPractice.hidden = !practice;
    el.panelResult.hidden = true; el.panelEmpty.hidden = !practice;
    el.countdownWrap.hidden = !practice;
    el.karaokeWrap.hidden = isManual(); // 직접 넘기기에는 문장별 시간이 없다
    el.keyHint.textContent = practice
      ? (isManual() ? '스페이스: 시작 · 다음 문장으로 / Esc: 끝내기 · ←: 한 문장 되돌리기' : '스페이스: 시작/멈춤 · ← →: 문장 이동')
      : '스페이스: 재생/멈춤 · ← →: 구간 이동';
    state.current = 0; state.manualIndex = 0; state.marks = []; state.playing = false;
    buildLines(); refreshStage(); setPlayButton(); render(); setStatus(''); save();
  }

  function rebuild() {
    if (state.playing) return; // 연습 중에는 대본을 바꾸지 않는다
    buildLines();
    state.current = Math.min(state.current, totalTime());
    render();
    if (state.mode === 'watch' && el.watchSource.value === 'paste' && !state.lines.length) setStatus('아래 「레퍼런스 대본」 칸에 시간이 붙은 문장을 붙여 넣어 주세요.');
  }

  // ── 훈련 세트 ───────────────────────────────────────────
  function renderSets() {
    el.sets.replaceChildren(...SETS.map(set => {
      const button = document.createElement('button');
      button.type = 'button'; button.setAttribute('role', 'radio'); button.dataset.set = set.id;
      const name = document.createElement('b'); name.textContent = set.title;
      const meta = document.createElement('small');
      meta.textContent = [set.kind, set.length, set.pace ? `초당 ${set.pace}음절` : ''].filter(Boolean).join(' · ');
      button.append(name, meta);
      button.addEventListener('click', () => selectSet(set.id));
      return button;
    }));
  }

  function renderFacts() {
    const set = state.set;
    const rows = [];
    const row = (term, main, note, href) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = term;
      const dd = document.createElement('dd');
      if (href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = main + ' ↗'; dd.append(a); }
      else { const strong = document.createElement(term === '말 빠르기' ? 'strong' : 'span'); strong.textContent = main; dd.append(strong); }
      if (note) { const small = document.createElement('small'); small.textContent = note; dd.append(small); }
      div.append(dt, dd); rows.push(div);
    };
    row('쇼츠', set.videoTitle || set.title, [set.channel, set.published, set.length].filter(Boolean).join(' · '), `https://www.youtube.com/shorts/${set.videoId}`);
    if (set.original?.url) row('원본', set.original.title || '원본 영상', set.original.note, set.original.url);
    if (set.paceText) row('말 빠르기', set.paceText, set.paceNote);
    if (set.flowText) row('흐름', set.flowText, set.flowNote);
    el.facts.replaceChildren(...rows);
    el.fullLink.href = set.original?.url || `https://www.youtube.com/shorts/${set.videoId}`;
    el.fullLink.textContent = set.original?.url ? '원본 풀 영상 ↗' : '유튜브에서 보기 ↗';
  }

  function selectSet(id, { initial = false } = {}) {
    const set = SETS.find(item => item.id === id) || SETS[0];
    if (!set || (!initial && set === state.set)) return;
    if (!initial && state.playing) pause();
    if (!initial) state.refScripts[state.set.id] = el.refScript.value;
    state.set = set;
    el.refScript.value = state.refScripts[set.id] || '';
    el.sets.querySelectorAll('[role=radio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.set === set.id)));
    renderFacts();
    if (!initial) {
      changeVideo(set.videoId);
      state.playing = false; state.current = 0; state.manualIndex = 0; state.marks = []; state.loopIndex = -1;
      el.panelResult.hidden = true; el.panelEmpty.hidden = state.mode !== 'practice';
      const url = new URL(location.href); url.searchParams.set('set', set.id); history.replaceState(null, '', url);
      buildLines(); setPlayButton(); render(); setStatus(''); save();
    }
  }

  // ── 이벤트 ──────────────────────────────────────────────
  document.querySelectorAll('.modes [role=radio]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  el.play.addEventListener('click', () => (state.playing ? pause() : play()));
  el.prev.addEventListener('click', () => jump(currentIndex() - 1));
  el.next.addEventListener('click', () => (isManual() && state.playing ? advanceManual() : jump(currentIndex() + 1)));
  el.restart.addEventListener('click', restart);
  el.timebar.addEventListener('click', event => {
    if (isManual()) return;
    const rect = el.timebar.getBoundingClientRect();
    const t = ((event.clientX - rect.left) / rect.width) * scale();
    state.current = Math.max(0, Math.min(totalTime(), t));
    if (canFollowVideo()) yt.seek(state.current);
    state.loopIndex = currentIndex(); update();
  });
  el.fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.desk.requestFullscreen?.().catch(() => setStatus('이 브라우저에서는 크게 보기를 쓸 수 없어요.'));
  });
  document.addEventListener('fullscreenchange', () => { el.fullscreen.textContent = document.fullscreenElement ? '작게 보기' : '프롬프터 크게'; state.activeIndex = -1; setTimeout(update, 60); });
  window.addEventListener('resize', () => { state.activeIndex = -1; update(); });

  el.size.addEventListener('input', () => { el.screen.style.setProperty('--prompter-size', el.size.value + 'px'); state.activeIndex = -1; update(); save(); });
  el.karaoke.addEventListener('change', () => { el.screen.classList.toggle('is-karaoke', el.karaoke.checked); save(); });
  el.mirror.addEventListener('change', () => { el.screen.classList.toggle('is-mirrored', el.mirror.checked); save(); });
  el.speed.addEventListener('change', () => yt.setRate(Number(el.speed.value)));
  el.ytMute.addEventListener('change', () => yt.mute(el.ytMute.checked));
  el.loopBeat.addEventListener('change', () => { state.loopIndex = currentIndex(); });

  function showSourceBox() { el.pasteBox.hidden = el.watchSource.value !== 'paste'; }
  el.watchSource.addEventListener('change', () => { showSourceBox(); setStatus(''); save(); rebuild(); });
  el.refScript.addEventListener('input', () => { state.refScripts[state.set.id] = el.refScript.value; save(); setStatus(''); rebuild(); });

  el.script.addEventListener('input', () => { save(); rebuild(); });
  el.advance.addEventListener('change', () => { save(); setMode('practice'); });
  el.pace.addEventListener('input', () => { el.paceOut.textContent = Number(el.pace.value).toFixed(1); save(); rebuild(); });
  el.paceRef.addEventListener('click', () => { el.pace.value = String(refPace()); el.paceOut.textContent = refPace().toFixed(1); save(); rebuild(); });
  el.target.addEventListener('change', () => { save(); render(); });
  el.loadStory.addEventListener('click', () => {
    if (el.script.value.trim() && el.script.value.trim() !== DEFAULT_SCRIPT && !confirm('지금 쓴 대본을 05 영상 구성 초안으로 바꿀까요?')) return;
    el.script.value = DEFAULT_SCRIPT; save(); rebuild();
  });


  document.addEventListener('keydown', event => {
    if (event.target.closest?.('input, textarea, select, [contenteditable]') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === ' ') {
      event.preventDefault();
      if (isManual() && state.playing) advanceManual();
      else state.playing ? pause() : play();
    } else if (event.key === 'Escape' && state.playing) { pause(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); el.next.click(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); jump(currentIndex() - 1); }
  });

  // ── 시작 ────────────────────────────────────────────────
  const saved = load();
  el.script.value = typeof saved.script === 'string' ? saved.script : DEFAULT_SCRIPT;
  if (!SETS.length) { setStatus('훈련 세트가 없어요. reference-sets.js를 확인해 주세요.'); return; }
  state.refScripts = saved.refScripts && typeof saved.refScripts === 'object' ? saved.refScripts : {};
  // 세트가 생기기 전에 붙여 넣은 대본은 첫 세트의 것으로 옮긴다.
  if (typeof saved.refScript === 'string' && saved.refScript && !state.refScripts[SETS[0].id]) state.refScripts[SETS[0].id] = saved.refScript;
  if (saved.referenceSourceVersion === 1 && saved.watchSource === 'paste') el.watchSource.value = 'paste';
  renderSets();
  selectSet(new URLSearchParams(location.search).get('set') || saved.set, { initial: true });
  showSourceBox();
  if (saved.advance) el.advance.value = saved.advance;
  if (saved.pace) el.pace.value = saved.pace;
  if (saved.target) el.target.value = saved.target;
  if (saved.size) { el.size.value = saved.size; el.screen.style.setProperty('--prompter-size', saved.size + 'px'); }
  if (saved.karaoke === false) { el.karaoke.checked = false; el.screen.classList.remove('is-karaoke'); }
  if (saved.mirror) { el.mirror.checked = true; el.screen.classList.add('is-mirrored'); }
  el.paceOut.textContent = Number(el.pace.value).toFixed(1);
  loadPlayer();
  setMode(saved.mode === 'practice' ? 'practice' : 'watch');
})();
