(function initializePageTabs() {
  const list = document.querySelector('.page-tabs');
  if (!list) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('main > [data-page-panel]')];
  const panelById = new Map(panels.map(panel => [panel.id, panel]));
  if (!tabs.length || panels.length !== tabs.length) return;

  function resolve(fragment) {
    let id;
    try { id = decodeURIComponent(fragment.replace(/^#/, '')); } catch { return null; }
    const target = document.getElementById(id);
    if (!target) return null;
    const panel = target.closest('[data-page-panel]');
    return panel && panelById.has(panel.id) ? { panel, target } : null;
  }

  function scrollTo(target) {
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  function activate(id, { focus = false, scroll = false, fragment } = {}) {
    if (!panelById.has(id)) return;
    for (const panel of panels) panel.hidden = panel.id !== id;
    for (const tab of tabs) {
      const selected = tab.getAttribute('aria-controls') === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) {
        tab.focus({ preventScroll: true });
        if (typeof tab.scrollIntoView === 'function') tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
    if (fragment && location.hash !== fragment) history.pushState(null, '', fragment);
    if (scroll) scrollTo(resolve(fragment || '#' + id)?.target || panelById.get(id));
  }

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => {
      const id = tab.getAttribute('aria-controls');
      activate(id, { fragment: '#' + id, scroll: true });
    });
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      const id = tabs[next].getAttribute('aria-controls');
      activate(id, { fragment: '#' + id, focus: true, scroll: true });
    });
  }

  // Internal sources/survey links can target a section inside a different tab.
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href^="#"]');
    if (!link || link.target === '_blank') return;
    const fragment = link.getAttribute('href');
    const match = resolve(fragment);
    if (!match) return;
    event.preventDefault();
    activate(match.panel.id, { fragment, scroll: true });
  });

  function followLocation() {
    const match = resolve(location.hash);
    activate(match ? match.panel.id : panels[0].id);
    if (match) scrollTo(match.target);
  }
  window.addEventListener('hashchange', followLocation);
  window.addEventListener('popstate', followLocation);
  followLocation();
})();
