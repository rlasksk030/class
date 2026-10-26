// Size-only controls. Existing grid slots, content, and data services stay untouched.
(() => {
  const main = document.querySelector('main');
  const header = document.querySelector('header');
  const weather = document.querySelector('.weather');
  const cards = Object.fromEntries(['timetable', 'morning', 'notices', 'meal'].map(id => [id, document.querySelector('.' + id)]));
  const storageKey = 'boardSizes';
  const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const loaded = read(storageKey, {});
  let sizes = {};
  if (loaded && typeof loaded === 'object') {
    if (Array.isArray(loaded.columns) && loaded.columns.length === 3 && loaded.columns.every(n => finite(n) && n > 0)) {
      const sum = loaded.columns.reduce((a, b) => a + b, 0);
      if (Number.isFinite(sum)) sizes.columns = loaded.columns.map(n => n / sum);
    }
    if (finite(loaded.row)) sizes.row = clamp(loaded.row, .1, .9);
    if (finite(loaded.weatherWidth)) sizes.weatherWidth = loaded.weatherWidth;
    if (finite(loaded.weatherHeight)) sizes.weatherHeight = loaded.weatherHeight;
  }
  let enabled = false, drag = null, frame;
  const controls = document.createElement('div');
  controls.className = 'size-controls';
  const toggle = document.createElement('button');
  toggle.id = 'resizeToggle';
  toggle.textContent = '크기 조절';
  toggle.setAttribute('aria-pressed', 'false');
  const reset = document.createElement('button');
  reset.id = 'resizeReset';
  reset.textContent = '기본 크기로 복원';
  reset.hidden = true;
  controls.append(reset, toggle);
  document.body.append(controls);

  function metrics() {
    const style = getComputedStyle(main);
    const gap = parseFloat(style.columnGap);
    return {
      width: main.clientWidth - 2 * gap,
      height: main.clientHeight - parseFloat(style.rowGap),
      widths: [cards.timetable, cards.morning, cards.meal].map(el => el.getBoundingClientRect().width),
      top: cards.morning.getBoundingClientRect().height
    };
  }
  function minimumWidth(card, base) {
    const title = card.querySelector('h2'), bar = card.querySelector('.cardhead');
    const cs = getComputedStyle(title), bs = getComputedStyle(bar);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return Math.max(base, Math.ceil(ctx.measureText(title.dataset.defaultTitle ?? title.textContent).width + (bar.querySelector('[data-edit]') || bar.querySelector('button')).getBoundingClientRect().width + parseFloat(bs.paddingLeft) + parseFloat(bs.paddingRight) + 16));
  }
  function minimums() {
    return [minimumWidth(cards.timetable, 220), minimumWidth(cards.morning, 280), minimumWidth(cards.meal, 230)];
  }
  function constrainColumns(widths, available) {
    const mins = minimums();
    const extra = Math.max(0, available - mins.reduce((a, b) => a + b, 0));
    const weights = widths.map((w, i) => Math.max(0, w - mins[i]));
    const sum = weights.reduce((a, b) => a + b, 0);
    return mins.map((m, i) => m + extra * (sum ? weights[i] / sum : 1 / 3));
  }
  function apply() {
    // Empty state intentionally leaves original CSS defaults in control.
    weather.classList.toggle('custom-weather-size', sizes.weatherWidth !== undefined || sizes.weatherHeight !== undefined);
    if (sizes.weatherWidth !== undefined) {
      const hs = getComputedStyle(header);
      const available = header.clientWidth - document.querySelector('.headerRight').getBoundingClientRect().width - 2 * parseFloat(hs.columnGap) - 300;
      weather.style.width = clamp(sizes.weatherWidth, 210, Math.min(420, available)) + 'px';
    } else weather.style.removeProperty('width');
    if (sizes.weatherHeight !== undefined) weather.style.height = clamp(sizes.weatherHeight, 110, Math.min(220, innerHeight * .25)) + 'px';
    else weather.style.removeProperty('height');
    const m = metrics();
    if (sizes.columns) {
      const cols = constrainColumns(sizes.columns.map(n => n * m.width), m.width);
      main.style.gridTemplateColumns = cols.map(n => n + 'px').join(' ');
    } else main.style.removeProperty('grid-template-columns');
    if (sizes.row !== undefined) {
      const top = clamp(sizes.row * m.height, Math.min(240, m.height * .6), m.height - 125);
      main.style.gridTemplateRows = `${top}px minmax(0, 1fr)`;
    } else main.style.removeProperty('grid-template-rows');
    fitContents();
    fitWeather();
  }
  function fitWeather() {
    const content = document.getElementById('weather');
    if (!weather.classList.contains('custom-weather-size') && !weather.classList.contains('weather-font-custom')) {
      content.style.removeProperty('font-size');
      return;
    }
    const label = weather.querySelector('.eyebrow');
    const available = weather.clientHeight - label.offsetHeight - parseFloat(getComputedStyle(label).marginBottom);
    let low = 6, high = 16 * (window.boardFontScales?.weather || 1);
    for (let i = 0; i < 10; i++) {
      const value = (low + high) / 2;
      content.style.fontSize = value + 'px';
      if (content.scrollHeight <= available + 1 && content.scrollWidth <= content.clientWidth + 1) low = value;
      else high = value;
    }
    content.style.fontSize = Math.floor(low * 10) / 10 + 'px';
  }
  document.addEventListener('board-font-change', fitWeather);
  new MutationObserver(fitWeather).observe(document.getElementById('weather'), {childList: true});
  const persist = () => put(storageKey, sizes);
  function finish() {
    if (!drag) return;
    const {handle, pointerId} = drag;
    drag = null;
    document.body.classList.remove('resizing-board');
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    persist();
  }
  function change(kind, dx, dy, start) {
    const mins = minimums(), widths = [...start.widths];
    if (kind === 'left-column') {
      widths[0] = clamp(start.widths[0] + dx, mins[0], start.widths[0] + start.widths[1] - mins[1]);
      widths[1] += start.widths[0] - widths[0];
    } else if (kind === 'right-column') {
      widths[2] = clamp(start.widths[2] - dx, mins[2], start.widths[2] + start.widths[1] - mins[1]);
      widths[1] += start.widths[2] - widths[2];
    } else if (kind === 'middle-column') {
      widths[1] = clamp(start.widths[1] + dx, mins[1], start.widths[1] + start.widths[2] - mins[2]);
      widths[2] += start.widths[1] - widths[1];
    } else if (kind === 'row') {
      sizes.row = clamp(start.top + dy, Math.min(240, start.height * .6), start.height - 125) / start.height;
    } else if (kind === 'weather-width') sizes.weatherWidth = start.weatherWidth - dx;
    else if (kind === 'weather-height') sizes.weatherHeight = start.weatherHeight + dy;
    if (kind.endsWith('column')) sizes.columns = widths.map(n => n / start.width);
    apply();
  }
  function startMetrics() {
    return {...metrics(), weatherWidth: weather.getBoundingClientRect().width, weatherHeight: weather.getBoundingClientRect().height};
  }
  function handle(card, edge, kind, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `board-resize-handle edge-${edge}`;
    button.dataset.resize = kind;
    button.setAttribute('aria-label', label);
    button.title = label + ' · 방향키로도 조절';
    button.hidden = true;
    card.append(button);
    button.addEventListener('pointerdown', e => {
      if (!enabled || e.button !== 0) return;
      e.preventDefault();
      drag = {handle: button, pointerId: e.pointerId, kind, x: e.clientX, y: e.clientY, start: startMetrics()};
      button.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing-board');
    });
    button.addEventListener('pointermove', e => {
      if (!enabled || !drag || drag.handle !== button || drag.pointerId !== e.pointerId) return;
      change(kind, e.clientX - drag.x, e.clientY - drag.y, drag.start);
    });
    button.addEventListener('pointerup', finish);
    button.addEventListener('pointercancel', finish);
    button.addEventListener('lostpointercapture', finish);
    button.addEventListener('keydown', e => {
      if (!enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? 30 : 10;
      change(kind, e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0,
        e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0, startMetrics());
      persist();
    });
  }
  handle(cards.timetable, 'right', 'left-column', '시간표 가로 크기 조절');
  handle(cards.meal, 'left', 'right-column', '급식 가로 크기 조절');
  handle(cards.morning, 'right', 'middle-column', '아침활동 가로 크기 조절');
  handle(cards.morning, 'bottom', 'row', '아침활동 세로 크기 조절');
  handle(cards.notices, 'right', 'middle-column', '안내사항 가로 크기 조절');
  handle(cards.notices, 'top', 'row', '안내사항 세로 크기 조절');
  handle(weather, 'left', 'weather-width', '날씨 가로 크기 조절');
  handle(weather, 'bottom', 'weather-height', '날씨 세로 크기 조절');
  toggle.onclick = () => {
    finish();
    enabled = !enabled;
    document.body.classList.toggle('board-size-mode', enabled);
    toggle.textContent = enabled ? '크기 조절 완료' : '크기 조절';
    toggle.setAttribute('aria-pressed', String(enabled));
    reset.hidden = !enabled;
    document.querySelectorAll('.board-resize-handle').forEach(el => el.hidden = !enabled);
  };
  reset.onclick = () => {
    finish();
    sizes = {};
    persist();
    apply();
  };
  window.addEventListener('blur', finish);
  window.addEventListener('pagehide', finish);
  window.addEventListener('resize', () => {
    finish();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  });
  // Changes to individual tracks do not resize <main>; watch the cards as well.
  const observer = new ResizeObserver(fitContents);
  Object.values(cards).forEach(card => observer.observe(card));
  const headerObserver = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  });
  headerObserver.observe(header);
  apply();
})();
