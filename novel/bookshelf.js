/* 읽은 책: 책장(전체·작가별), 작가 탭 대표작의 '분석 보기', 책 분석 화면. 데이터는 books.js의 NOVEL_BOOKS예요.
   learning.js보다 먼저 실행해요. 그래야 책장이 작가 비교 위에 놓이고, #book-… 주소에서 다른 화면을 먼저 숨긴 뒤 learning.js가 스크롤해요. */
(function () {
  'use strict';
  const books = window.NOVEL_BOOKS || [];
  if (!books.length) return;
  const main = document.querySelector('main');
  const read = (key, fallback = '') => { try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* 저장 못 해도 화면은 그대로 써요. */ } };
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function jp(tag, cls, text) { const n = el(tag, cls, text); n.lang = 'ja'; return n; }
  function authorOf(id) {
    const tab = document.querySelector('[data-author="' + id + '"]'), name = document.querySelector('#a-' + id + ' .hero .jp');
    return { id, ko: tab ? tab.querySelector('b').textContent : id, jp: name ? name.textContent.split(' · ')[0] : '' };
  }
  const done = b => b.done === true;
  // 작가는 탭 순서대로, 읽은 책이 있는 사람만.
  const authors = Array.from(document.querySelectorAll('[data-author]')).map(t => t.dataset.author)
    .filter(id => books.some(b => b.author === id)).map(authorOf);
  const booksOf = id => books.filter(b => b.author === id);

  /* 책장: 일본어 노트의 곡 목록처럼 [전체 | 작가] 버튼과 카드. 전체는 작가마다 묶어요. */
  function card(b) {
    const a = el('a', 'shelf-card'); a.href = '#book-' + b.id;
    const top = el('span', 'sc-top');
    top.append(el('span', 'pill' + (done(b) ? ' ready' : ''), done(b) ? '분석 완료' : '분석 쓰는 중'), el('span', 'sc-meta', b.kind));
    a.append(top, jp('span', 'jt', b.jt), el('span', 'kt', '『' + b.kt + '』'));
    return a;
  }
  function cards(list) { const box = el('div', 'shelf-cards'); list.forEach(b => box.append(card(b))); return box; }
  function head(a) { const h = el('h3', 'shelf-h'); h.append(el('span', '', a.ko), jp('span', 'jp', a.jp)); return h; }
  const shelf = el('section', 'shelf'); shelf.id = 'shelf'; shelf.setAttribute('aria-labelledby', 'shelf-title');
  const title = el('h2', '', '읽은 책'); title.id = 'shelf-title';
  const seg = el('div', 'shelf-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '작가');
  const list = el('div', 'shelf-list');
  shelf.append(title, el('p', 'note', '읽은 책을 작가별로 모아요. 책을 누르면 분석을 볼 수 있어요.'), seg, list);
  function renderShelf(sel) {
    if (!authors.some(a => a.id === sel)) sel = 'all';
    seg.replaceChildren(...[['all', '전체', books.length]].concat(authors.map(a => [a.id, a.ko, booksOf(a.id).length])).map(([id, label, n]) => {
      const b = el('button', 'tg', label); b.type = 'button'; b.setAttribute('aria-pressed', String(id === sel));
      b.append(el('span', 'cnt', String(n)));
      b.addEventListener('click', () => { write('novel.shelf', id); renderShelf(id); });
      return b;
    }));
    if (sel === 'all') {
      list.replaceChildren(...authors.map(a => { const g = el('div', 'shelf-group'); g.append(head(a), cards(booksOf(a.id))); return g; }));
    } else {
      const go = el('a', 'shelf-go', '작가 노트 보기 →'); go.href = '#a-' + sel;
      list.replaceChildren(go, cards(booksOf(sel)));
    }
  }
  renderShelf(read('novel.shelf', 'all'));
  document.querySelector('.tabs').before(shelf);

  /* 작가 탭의 '읽어 볼 대표작': 같은 원서 제목 카드에 링크를 달고, 목록에 없는 책은 앞에 새로 넣어요. */
  books.forEach(b => {
    const panel = document.getElementById('a-' + b.author); if (!panel) return;
    const section = Array.from(panel.querySelectorAll('section')).find(s => /대표작/.test((s.querySelector('h2') || {}).textContent));
    const grid = section && section.querySelector('.books'); if (!grid) return;
    let box = Array.from(grid.querySelectorAll('.book')).find(n => (n.querySelector('.jt') || {}).textContent === b.jt);
    if (!box) {
      box = el('div', 'book'); box.append(el('span', 'yr', b.orig.split(' · ')[0]), jp('span', 'jt', b.jt), el('span', 'kt', '한국어판 『' + b.kt + '』'));
      grid.prepend(box);
    }
    const go = el('a', 'book-go', done(b) ? '읽은 책 · 분석 보기 →' : '읽은 책 · 분석 쓰는 중 →'); go.href = '#book-' + b.id;
    box.classList.add('read'); box.append(go);
  });

  /* 책 분석 화면. #book-<id>일 때 body.reading으로 다른 내용을 숨기고 이 책만 보여 줘요. */
  function page(b) {
    const a = authorOf(b.author), art = el('article', 'book-page'); art.id = 'book-' + b.id; art.hidden = true;
    const back = el('a', 'back', '← ' + a.ko); back.href = '#a-' + b.author;
    const top = el('header', 'book-head');
    top.append(back, el('p', 'eyebrow', '소설 · 읽은 책'), jp('h1', '', b.jt), el('p', 'lede', '한국어판 『' + b.kt + '』'));
    const hero = el('div', 'hero'), facts = el('dl', 'facts');
    const who = el('a', '', a.ko); who.href = '#a-' + b.author;
    [['작가', who], ['형식', b.kind], ['원서', b.orig], ['한국어판', b.ko]].forEach(([k, v]) => {
      if (!v) return; const dd = el('dd'); dd.append(v); facts.append(el('dt', '', k), dd);
    });
    hero.append(facts);
    if (b.intro) hero.append(el('p', 'book-intro', b.intro));
    art.append(top, hero);
    if (b.stories && b.stories.length) {
      const s = el('section'), ol = el('ol', 'stories');
      s.append(el('h2', '', '수록작'));
      b.stories.forEach(st => {
        const li = el('li'); li.append(el('b', '', st.kt));
        if (st.note) li.append(el('span', 'st-note', st.note));
        if (st.first) li.append(el('span', 'st-first', '처음 실린 곳 · ' + st.first));
        ol.append(li);
      });
      s.append(ol); art.append(s);
    }
    // 수록작별 시놉시스: 인물·배경·세계관·컨셉·도입은 펼쳐 두고, 추리와 진상만 접어요.
    if ((b.stories || []).some(st => st.cast || st.world)) {
      const s = el('section'); s.append(el('h2', '', '수록작별 시놉시스'));
      if (b.synNote) s.append(el('p', 'note', b.synNote));
      b.stories.forEach((st, i) => {
        if (!st.cast && !st.world) return;
        const box = el('article', 'syn'), dl = el('dl', 'syn-facts');
        box.append(el('h3', '', String(i + 1).padStart(2, '0') + ' · ' + st.kt));
        if (st.cast && st.cast.length) {
          const ul = el('ul', 'syn-cast');
          st.cast.forEach(([name, who]) => { const li = el('li'); li.append(el('b', '', name), el('span', '', who)); ul.append(li); });
          const dd = el('dd'); dd.append(ul); dl.append(el('dt', '', '등장인물'), dd);
        }
        [['배경', st.setting], ['세계관', st.world], ['핵심 컨셉', st.concept], ['사건의 시작', st.plot]].forEach(([k, v]) => {
          if (v) dl.append(el('dt', '', k), el('dd', '', v));
        });
        box.append(dl);
        if (st.twist || (st.solve && st.solve.length)) {
          const d = el('details', 'spoiler'), ol = el('ol', 'syn-solve');
          d.append(el('summary', '', '반전과 진상 · 펼쳐 보기'));
          if (st.twist) { const p = el('p', 'syn-twist'); p.append(el('b', '', '반전'), document.createTextNode(st.twist)); d.append(p); }
          (st.solve || []).forEach(t => ol.append(el('li', '', t)));
          if (ol.children.length) d.append(ol);
          box.append(d);
        }
        s.append(box);
      });
      art.append(s);
    }
    if (b.analysis && b.analysis.length) {
      b.analysis.forEach(part => {
        const s = el('section'); s.append(el('h2', '', part.h));
        const body = part.spoiler ? el('details', 'spoiler') : s;
        if (part.spoiler) { body.append(el('summary', '', '줄거리와 해결이 나와요 · 펼쳐 보기')); s.append(body); }
        (part.body || []).forEach(t => { const p = el('p'); p.innerHTML = t; body.append(p); });
        // 작품별 흐름: 한 줄 요약 → 첫 아이디어에서 완성까지의 단계 → 근거.
        (part.traces || []).forEach(t => {
          const box = el('div', 'syn trace'), ol = el('ol', 'trace-steps');
          box.append(el('h3', '', t.h));
          if (t.line) { const p = el('p', 'syn-twist'); p.append(el('b', '', '한 줄로'), document.createTextNode(t.line)); box.append(p); }
          (t.steps || []).forEach(([k, v]) => { const li = el('li'), tx = el('span'); tx.innerHTML = v; li.append(el('span', 'pill', k), tx); ol.append(li); });
          box.append(ol);
          if (t.basis) box.append(el('p', 'note', t.basis));
          body.append(box);
        });
        (part.groups || []).forEach(g => {
          const box = el('div', 'syn'), dl = el('dl', 'syn-facts');
          box.append(el('h3', '', g.h));
          g.items.forEach(([k, v]) => { const dd = el('dd'); dd.innerHTML = v; dl.append(el('dt', '', k), dd); });
          box.append(dl); body.append(box);
        });
        art.append(s);
      });
    }
    if (!done(b)) art.append(el('p', 'soon-box', b.analysis && b.analysis.length ? '이어서 쓰는 중이에요.' : '분석을 쓰는 중이에요.'));
    if (b.sources && b.sources.length) {
      const s = el('section'), ul = el('ul', 'source-links');
      b.sources.forEach(([t, url]) => { const li = el('li'), link = el('a', '', t + ' ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; li.append(link); ul.append(li); });
      s.append(el('h2', '', '출처'), ul); art.append(s);
    }
    return art;
  }
  const view = el('div', 'book-view'); books.forEach(b => view.append(page(b))); main.append(view);
  function route() {
    let hash; try { hash = decodeURIComponent(location.hash.slice(1)); } catch (_) { hash = ''; }
    const id = hash.startsWith('book-') && document.getElementById(hash) ? hash : '';
    document.body.classList.toggle('reading', !!id);
    view.querySelectorAll('.book-page').forEach(p => { p.hidden = p.id !== id; });
    if (id) document.title = (books.find(b => 'book-' + b.id === id) || {}).kt + ' · 소설';
    else document.title = baseTitle;
  }
  const baseTitle = document.title;
  window.addEventListener('hashchange', route); route();
})();
