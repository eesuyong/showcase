(function initializeShortsPractice() {
  'use strict';

  // ── 기준 데이터 ───────────────────────────────────────────
  // 레퍼런스 쇼츠의 말하기 박자. 원문은 담지 않고, 구간별 역할(직접 요약)과 음절 수만 기록한다.
  // 시간·음절 수는 2026-11-05 유튜브 자동 자막(ko) 기준.
  const VIDEO_ID = 'rmSY18yNkr8';
  const BEATS = [
    { start: 0.16, end: 9.68, syl: 58, label: '문제 제기', text: '효과를 망치는 시술 방식 두 가지를 이름만 먼저 꺼낸다' },
    { start: 9.68, end: 22.48, syl: 86, label: '첫 번째 정의', text: '쌍쎄라가 무엇인지 손동작을 섞어 설명한다' },
    { start: 22.48, end: 33.92, syl: 82, label: '상대 주장 → 반박', text: '시술하는 쪽의 논리를 소개하고 내 의견을 붙인다' },
    { start: 33.92, end: 41.8, syl: 56, label: '근거 + 결론', text: '정확도가 떨어지는 이유, 그래서 추천하지 않는다' },
    { start: 41.8, end: 57.72, syl: 103, label: '두 번째 정의', text: '점쎄라 — 길이를 줄여 시간을 아끼는 방식을 숫자로 설명한다' },
    { start: 57.72, end: 65.28, syl: 52, label: '실제 사례', text: '어떤 곳에서 쓰이고, 환자는 왜 알아채지 못하는지' },
    { start: 65.28, end: 69.56, syl: 18, label: '결론 한 문장', text: '속도를 확 늦춰 또박또박 마무리한다' }
  ];
  const REF_PACE = 6.6;
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
    size: $('size'), speed: $('speed'), countdown: $('countdown'), countdownWrap: $('countdown-wrap'), mirror: $('mirror'),
    status: $('status'), keyHint: $('key-hint'), desk: $('desk'),
    ytFallback: $('yt-fallback'), ytMute: $('yt-mute'), loopBeat: $('loop-beat'),
    loopWrap: $('loop-wrap'),
    panelWatch: $('panel-watch'), panelRef: $('panel-ref'), panelPractice: $('panel-practice'), panelResult: $('panel-result'), panelEmpty: $('panel-practice-empty'),
    watchSource: $('watch-source'), vttBox: $('vtt-box'), vttFile: $('vtt-file'),
    script: $('script'), advance: $('advance'), pace: $('pace'), paceOut: $('pace-out'), paceRef: $('pace-ref'), target: $('target'), loadStory: $('load-story'),
    rTime: $('r-time'), rTarget: $('r-target'), rPace: $('r-pace'), rNote: $('r-note'),
    timeline: document.querySelector('#timeline tbody'), thMine: $('th-mine')
  };

  const state = {
    mode: 'watch', lines: [], vttLines: [], current: 0, playing: false, lastTick: 0, countdownLeft: 0,
    manualIndex: 0, marks: [], activeIndex: -1, loopIndex: -1,
    player: null, playerReady: false, ytFailed: false
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

  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; } }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        mode: state.mode, script: el.script.value, advance: el.advance.value, pace: el.pace.value, target: el.target.value, size: el.size.value, mirror: el.mirror.checked
      }));
    } catch { /* 저장이 막힌 브라우저에서는 저장 없이 동작 */ }
  }

  // ── 대본 해석 ───────────────────────────────────────────
  function parseTime(raw) {
    let m = raw.match(/^\s*\[?(\d{1,2}):(\d{2})(?:\.(\d+))?\]?\s*/);
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

  // 유튜브 자막(.vtt). 줄이 겹쳐 흘러가는 자동 자막도 새로 나온 줄만 골라낸다.
  function linesFromVtt(text) {
    const toSec = t => { const p = t.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
    const recent = [], out = [];
    for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
      const m = block.match(/(\d[\d:.]+)\s+-->\s+(\d[\d:.]+)/);
      if (!m) continue;
      const start = toSec(m[1]), end = toSec(m[2]);
      if (end - start < 0.05) continue;
      const body = block.split('\n').filter(row => !row.includes('-->')).map(row => row.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
      const fresh = body.filter(row => !recent.includes(row));
      if (!fresh.length) continue;
      recent.push(...fresh); recent.splice(0, Math.max(0, recent.length - 4));
      out.push({ start, end, text: fresh.join(' ') });
    }
    for (let i = 0; i < out.length - 1; i++) out[i].end = out[i + 1].start;
    return out;
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
      p.append(document.createTextNode(line.text));
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
        cells.push([mine, '내 기록', pace > 7.6 ? 'fast' : pace && pace < 5 ? 'slow' : '']);
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

  function update() {
    const total = state.mode === 'practice' && target() ? target() : totalTime();
    const time = state.mode === 'practice' && isManual() ? state.current : state.current;
    el.clock.firstChild.textContent = fmtClock(time);
    el.clock.lastChild.textContent = '/ ' + fmt(total);
    el.clock.classList.toggle('is-over', state.mode === 'practice' && target() > 0 && time > target());
    const index = currentIndex();
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

  // ── 레퍼런스 영상 (YouTube IFrame API) ────────────────────
  function loadPlayer() {
    const fallback = setTimeout(() => { if (!state.playerReady) { state.ytFailed = true; refreshStage(); setStatus('영상 플레이어를 불러오지 못했어요. 링크로 유튜브에서 보면서 프롬프터는 ▶ 시작으로 따로 돌릴 수 있어요.'); } }, 9000);
    window.onYouTubeIframeAPIReady = () => {
      state.player = new YT.Player('yt-player', {
        videoId: VIDEO_ID,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onReady: () => { state.playerReady = true; state.ytFailed = false; clearTimeout(fallback); refreshStage(); if (el.ytMute.checked) state.player.mute(); },
          onStateChange: event => {
            if (state.mode !== 'watch') return;
            if (event.data === YT.PlayerState.PLAYING) startLoop();
            else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) { state.playing = false; setPlayButton(); syncFromPlayer(); }
          },
          onError: () => { state.ytFailed = true; refreshStage(); }
        }
      });
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { state.ytFailed = true; refreshStage(); };
    document.head.append(script);
  }

  function syncFromPlayer() {
    if (state.playerReady && state.player.getCurrentTime) { state.current = state.player.getCurrentTime() || 0; update(); }
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
      if (state.playerReady) {
        state.current = state.player.getCurrentTime() || 0;
        const loop = state.lines[state.loopIndex];
        if (el.loopBeat.checked && loop && state.current >= loop.end - 0.05) state.player.seekTo(loop.start, true);
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
    if (!state.lines.length) { setStatus(state.mode === 'practice' ? '먼저 아래 칸에 대본을 써 주세요.' : '먼저 자막 파일을 골라 주세요.'); return; }
    if (state.mode === 'watch') {
      if (state.playerReady) { state.player.setPlaybackRate(Number(el.speed.value)); state.player.playVideo(); }
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
    if (state.mode === 'watch') { if (state.playerReady) state.player.pauseVideo(); else { state.playing = false; setPlayButton(); } return; }
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
    if (state.mode === 'watch' && state.playerReady) state.player.seekTo(state.current, true);
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
    if (state.mode === 'watch' && state.playerReady) { state.player.pauseVideo(); state.player.seekTo(0, true); }
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
      if (pace < 5.2) notes.push('레퍼런스(초당 6.6음절)보다 여유롭게 말했어요. 설명형 쇼츠라면 조금 더 붙여 읽어도 됩니다.');
      else if (pace > 7.6) notes.push('레퍼런스보다 빠릅니다. 숫자·병원 이름처럼 들려야 하는 말은 한 박자 늦춰 보세요.');
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
  }

  // ── 모드 · 소스 ─────────────────────────────────────────
  function buildLines() {
    if (state.mode === 'watch') state.lines = el.watchSource.value === 'vtt' ? state.vttLines : BEATS.map(b => ({ ...b }));
    else state.lines = linesFromScript(el.script.value, Number(el.pace.value));
  }

  function setMode(mode) {
    if (state.playing) pause();
    if (mode === 'practice' && state.playerReady) state.player.pauseVideo();
    state.mode = mode;
    document.querySelectorAll('.modes [role=radio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    const practice = mode === 'practice';
    el.loopWrap.hidden = practice; // 구간 반복은 영상과 프롬프터가 연동되는 보기 단계에서만
    if (practice) el.loopBeat.checked = false;
    el.panelWatch.hidden = practice; el.panelRef.hidden = practice;
    el.panelPractice.hidden = !practice;
    el.panelResult.hidden = true; el.panelEmpty.hidden = !practice;
    el.countdownWrap.hidden = !practice;
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
    if (state.mode === 'watch' && el.watchSource.value === 'vtt' && !state.vttLines.length) setStatus('자막 파일(.vtt)을 고르면 문장이 나타나요.');
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
    if (state.mode === 'watch' && state.playerReady) state.player.seekTo(state.current, true);
    state.loopIndex = currentIndex(); update();
  });
  el.fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.desk.requestFullscreen?.().catch(() => setStatus('이 브라우저에서는 크게 보기를 쓸 수 없어요.'));
  });
  document.addEventListener('fullscreenchange', () => { el.fullscreen.textContent = document.fullscreenElement ? '작게 보기' : '프롬프터 크게'; state.activeIndex = -1; setTimeout(update, 60); });
  window.addEventListener('resize', () => { state.activeIndex = -1; update(); });

  el.size.addEventListener('input', () => { el.screen.style.setProperty('--prompter-size', el.size.value + 'px'); state.activeIndex = -1; update(); save(); });
  el.mirror.addEventListener('change', () => { el.screen.classList.toggle('is-mirrored', el.mirror.checked); save(); });
  el.speed.addEventListener('change', () => { if (state.playerReady) state.player.setPlaybackRate(Number(el.speed.value)); });
  el.ytMute.addEventListener('change', () => { if (state.playerReady) el.ytMute.checked ? state.player.mute() : state.player.unMute(); });
  el.loopBeat.addEventListener('change', () => { state.loopIndex = currentIndex(); });

  el.watchSource.addEventListener('change', () => { el.vttBox.hidden = el.watchSource.value !== 'vtt'; setStatus(''); rebuild(); });
  el.vttFile.addEventListener('change', async () => {
    const file = el.vttFile.files[0];
    if (!file) return;
    try {
      state.vttLines = linesFromVtt(await file.text());
      setStatus(state.vttLines.length ? `${file.name}에서 ${state.vttLines.length}개 구간을 읽었어요.` : '시간 정보가 있는 자막을 찾지 못했어요. .vtt 파일인지 확인해 주세요.');
      rebuild();
    } catch { setStatus('파일을 읽지 못했어요.'); }
  });

  el.script.addEventListener('input', () => { save(); rebuild(); });
  el.advance.addEventListener('change', () => { save(); setMode('practice'); });
  el.pace.addEventListener('input', () => { el.paceOut.textContent = Number(el.pace.value).toFixed(1); save(); rebuild(); });
  el.paceRef.addEventListener('click', () => { el.pace.value = String(REF_PACE); el.paceOut.textContent = REF_PACE.toFixed(1); save(); rebuild(); });
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
  if (saved.advance) el.advance.value = saved.advance;
  if (saved.pace) el.pace.value = saved.pace;
  if (saved.target) el.target.value = saved.target;
  if (saved.size) { el.size.value = saved.size; el.screen.style.setProperty('--prompter-size', saved.size + 'px'); }
  if (saved.mirror) { el.mirror.checked = true; el.screen.classList.add('is-mirrored'); }
  el.paceOut.textContent = Number(el.pace.value).toFixed(1);
  loadPlayer();
  setMode(saved.mode === 'practice' ? 'practice' : 'watch');
})();
