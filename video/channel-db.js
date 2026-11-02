/* Read-only analysis of the public snapshot embedded in index.html. */
function channelSubscriberCount(display) {
  const value = Number.parseFloat(String(display).replaceAll(',', ''));
  return Number.isFinite(value) ? Math.round(value * (String(display).includes('만') ? 10000 : 1)) : 0;
}

function channelDatabaseRows(snapshot) {
  return snapshot.channels.flatMap(channel => channel.items.map(item => ({
    ...item,
    channelKey: channel.key,
    channelName: channel.name,
    subscriberDisplay: channel.subscribers?.display || '미확인',
    subscribers: channelSubscriberCount(channel.subscribers?.display || ''),
    concepts: item.concepts.map(Number),
  })));
}

function filterChannelRows(rows, filters) {
  return rows.filter(row => {
    if (filters.channels.length && !filters.channels.includes(row.channelKey)) return false;
    if (filters.format && filters.format !== 'all' && row.format !== filters.format) return false;
    if (filters.concepts.length) {
      const matches = concept => row.concepts.includes(concept);
      if (!(filters.conceptMode === 'all' ? filters.concepts.every(matches) : filters.concepts.some(matches))) return false;
    }
    return true;
  });
}

function channelConceptStats(rows, concepts) {
  const stats = Object.keys(concepts).map(number => ({
    number: Number(number), name: concepts[number], count: 0, videos: 0, shorts: 0, percent: 0,
  }));
  const byNumber = new Map(stats.map(item => [item.number, item]));
  for (const row of rows) {
    for (const number of new Set(row.concepts)) {
      const stat = byNumber.get(number);
      if (!stat) continue;
      stat.count += 1;
      if (row.format === 'videos') stat.videos += 1;
      else if (row.format === 'shorts') stat.shorts += 1;
    }
  }
  for (const stat of stats) stat.percent = rows.length ? stat.count / rows.length * 100 : 0;
  return stats.sort((a, b) => b.count - a.count || a.number - b.number);
}

function sortChannelRows(rows, order) {
  const compare = (a, b) => a.localeCompare(b, 'ko');
  const byDate = (a, b) => compare(b.publishedTimestamp, a.publishedTimestamp) || compare(a.id, b.id);
  return [...rows].sort((a, b) => {
    if (order === 'date-asc') return -byDate(a, b);
    if (order === 'subscribers-desc') return b.subscribers - a.subscribers || byDate(a, b);
    if (order === 'subscribers-asc') return a.subscribers - b.subscribers || byDate(a, b);
    if (order === 'channel') return compare(a.channelName, b.channelName) || byDate(a, b);
    if (order === 'title') return compare(a.title, b.title) || byDate(a, b);
    return byDate(a, b);
  });
}

function channelCsvCell(value) {
  let text = String(value ?? '');
  // Spreadsheet applications can interpret a title starting with a formula character.
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function channelRowsCsv(rows, concepts) {
  const header = ['채널', '유형', '게시일', '제목', '컨셉', '분류 상태'];
  const lines = rows.map(row => [
    row.channelName, row.format === 'videos' ? '일반 영상' : '쇼츠',
    row.published, row.title,
    row.concepts.map(number => String(number).padStart(2, '0') + ' ' + concepts[number]).join(' / '),
    row.tentative ? '잠정 분류 · 본문 확인 필요' : '제목 기준 분류',
  ]);
  return '\uFEFF' + [header, ...lines].map(line => line.map(channelCsvCell).join(',')).join('\r\n');
}

(function initializeChannelDatabase() {
  const embedded = document.getElementById('channel-db-data');
  if (!embedded) return;
  const snapshot = JSON.parse(embedded.textContent);
  const allRows = channelDatabaseRows(snapshot);
  const el = id => document.getElementById(id);
  const state = { page: 1, rows: [] };
  const from = snapshot.period.startInclusive;
  const end = new Date(snapshot.period.endExclusive + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() - 1);
  const to = end.toISOString().slice(0, 10);
  el('db-source-info').textContent = '수집 기간 ' + from + ' ~ ' + to + ' · ' + allRows.length + '편 · ' + snapshot.channels.length + '개 채널 · 구독자 수 확인일 ' + snapshot.checkedOn + '. 필터 결과는 이 공개 수집본 안에서만 조회됩니다.';

  function chip(container, value, label, color, detail) {
    const wrapper = document.createElement('label');
    wrapper.className = 'db-chip' + (color !== undefined ? ' concept-color-' + color : '');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = value;
    input.addEventListener('change', applyFilters);
    wrapper.append(input);
    if (detail) {
      const text = document.createElement('span');
      text.append(document.createTextNode(label));
      const note = document.createElement('small');
      note.className = 'db-channel-subscribers';
      note.textContent = detail;
      text.append(note);
      wrapper.append(text);
    } else wrapper.append(document.createTextNode(label));
    container.append(wrapper);
  }
  for (const channel of snapshot.channels) chip(el('db-channels'), channel.key, channel.name, undefined, '구독자 ' + (channel.subscribers?.display || '미확인'));
  for (const [number, name] of Object.entries(snapshot.concepts)) {
    chip(el('db-concepts'), number, number.padStart(2, '0') + ' ' + name, Number(number) - 1);
  }
  const checked = id => [...el(id).querySelectorAll('input:checked')].map(input => input.value);
  function readFilters() {
    return {
      channels: checked('db-channels'),
      format: document.querySelector('input[name="dbFormat"]:checked').value,
      concepts: checked('db-concepts').map(Number),
      conceptMode: el('db-concept-mode').value,
    };
  }

  function applyFilters() {
    const filters = readFilters();
    state.rows = sortChannelRows(filterChannelRows(allRows, filters), el('db-sort').value);
    state.page = 1;
    for (const panel of document.querySelectorAll('[data-insight-format]')) panel.hidden = filters.format !== 'all' && panel.dataset.insightFormat !== filters.format;
    el('db-legend-video').hidden = filters.format === 'shorts';
    el('db-legend-shorts').hidden = filters.format === 'videos';
    el('db-concepts-count').textContent = filters.concepts.length ? filters.concepts.length + '개 선택 · ' + (filters.conceptMode === 'all' ? '모두 해당' : '하나라도 해당') : '전체 ' + Object.keys(snapshot.concepts).length + '개 컨셉';
    render();
  }

  function focusConcept(number) {
    for (const input of el('db-concepts').querySelectorAll('input')) input.checked = Number(input.value) === number;
    el('db-concepts').closest('details').open = true;
    applyFilters();
  }

  function renderChart() {
    const filters = readFilters();
    const names = snapshot.channels.filter(channel => filters.channels.includes(channel.key)).map(channel => channel.name);
    const scope = names.length ? names.join(' · ') : '전체 채널';
    const formatLabel = filters.format === 'videos' ? '일반 영상' : filters.format === 'shorts' ? '쇼츠' : '일반 영상 + 쇼츠';
    el('db-chart-context').textContent = scope + ' / ' + formatLabel + ' / ' + (filters.concepts.length ? '선택한 컨셉 조건 적용 / ' : '') + state.rows.length + '편 기준';
    el('db-concept-chart').replaceChildren();
    el('db-chart-empty').hidden = state.rows.length > 0;
    if (!state.rows.length) return;
    const denominator = state.rows.length;
    for (const stat of channelConceptStats(state.rows, snapshot.concepts)) {
      const row = document.createElement('div');
      row.className = 'db-chart-row' + (!stat.count ? ' is-zero' : '');
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', String(stat.number).padStart(2, '0') + ' ' + stat.name + ': ' + stat.count + '편, ' + stat.percent.toFixed(1) + '%, 일반 영상 ' + stat.videos + '편, 쇼츠 ' + stat.shorts + '편');
      row.dataset.concept = stat.number;
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'db-chart-name';
      name.title = stat.name + ' 컨셉으로 필터';
      const number = document.createElement('span');
      number.className = 'db-chart-number concept-color-' + (stat.number - 1);
      number.textContent = String(stat.number).padStart(2, '0');
      name.append(number, document.createTextNode(stat.name));
      name.addEventListener('click', () => focusConcept(stat.number));
      const track = document.createElement('div');
      track.className = 'db-chart-track';
      track.setAttribute('aria-hidden', 'true');
      track.title = '일반 영상 ' + stat.videos + '편 · 쇼츠 ' + stat.shorts + '편';
      for (const [format, count] of [['video', stat.videos], ['shorts', stat.shorts]]) {
        const segment = document.createElement('span');
        segment.className = 'db-chart-' + format;
        segment.style.width = (count / denominator * 100) + '%';
        track.append(segment);
      }
      const value = document.createElement('span');
      value.className = 'db-chart-value';
      value.append(document.createTextNode(stat.percent.toFixed(1) + '%'));
      const count = document.createElement('small');
      count.textContent = stat.count + '편';
      value.append(count);
      row.append(name, track, value);
      el('db-concept-chart').append(row);
    }
  }

  function render() {
    renderChart();
    const rows = state.rows;
    const count = rows.length;
    const videos = rows.filter(row => row.format === 'videos').length;
    const shorts = rows.filter(row => row.format === 'shorts').length;
    el('db-total').textContent = count + '편';
    el('db-videos').textContent = videos + '편';
    el('db-shorts').textContent = shorts + '편';
    el('db-video-ratio').textContent = count ? (videos / count * 100).toFixed(1) + '%' : '—';
    el('db-shorts-ratio').textContent = count ? (shorts / count * 100).toFixed(1) + '%' : '—';
    el('db-channel-total').textContent = new Set(rows.map(row => row.channelKey)).size + '개';
    const size = Number(el('db-page-size').value);
    const pages = Math.max(1, Math.ceil(count / size));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * size;
    el('db-result-status').textContent = '전체 ' + allRows.length + '편 중 ' + count + '편' + (count ? ' · ' + (start + 1) + '–' + Math.min(start + size, count) + ' 표시' : '');
    el('db-rows').replaceChildren();
    if (!count) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'db-empty';
      cell.textContent = '조건에 맞는 콘텐츠가 없습니다. 채널이나 컨셉 선택을 줄여 보세요.';
      row.append(cell);
      el('db-rows').append(row);
    }
    for (const entry of rows.slice(start, start + size)) {
      const row = document.createElement('tr');
      for (const value of [entry.channelName, entry.format === 'videos' ? '일반 영상' : '쇼츠', entry.published, entry.title]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      const cell = document.createElement('td');
      const tags = document.createElement('div');
      tags.className = 'db-concept-tags';
      for (const number of entry.concepts) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'db-concept-tag concept-color-' + (number - 1);
        button.textContent = String(number).padStart(2, '0') + ' ' + snapshot.concepts[number];
        button.title = snapshot.concepts[number] + ' 컨셉으로 필터';
        button.addEventListener('click', () => focusConcept(number));
        tags.append(button);
      }
      cell.append(tags);
      if (entry.tentative) {
        const note = document.createElement('small');
        note.className = 'tentative-map';
        note.textContent = '잠정 분류 · 본문 확인 필요';
        cell.append(note);
      }
      row.append(cell);
      el('db-rows').append(row);
    }
    el('db-page-label').textContent = count ? state.page + ' / ' + pages + ' 페이지' : '결과 없음';
    el('db-prev').disabled = !count || state.page === 1;
    el('db-next').disabled = !count || state.page === pages;
    el('db-export').disabled = !count;
  }

  for (const input of document.querySelectorAll('input[name="dbFormat"]')) input.addEventListener('change', applyFilters);
  for (const id of ['db-concept-mode', 'db-sort', 'db-page-size']) el(id).addEventListener('change', applyFilters);
  el('db-prev').addEventListener('click', () => { state.page -= 1; render(); });
  el('db-next').addEventListener('click', () => { state.page += 1; render(); });
  el('db-reset').addEventListener('click', () => {
    document.querySelector('input[name="dbFormat"][value="all"]').checked = true;
    el('db-concept-mode').value = 'any';
    el('db-sort').value = 'date-desc';
    el('db-page-size').value = '10';
    for (const input of document.querySelectorAll('#db-channels input, #db-concepts input')) input.checked = false;
    applyFilters();
  });
  el('db-export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([channelRowsCsv(state.rows, snapshot.concepts)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'galleria-channel-content-' + state.rows.length + '.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    el('db-result-status').textContent = '현재 필터 결과 ' + state.rows.length + '편의 CSV 내려받기를 요청했습니다.';
  });
  applyFilters();
})();
