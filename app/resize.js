// Weather card size only. The four boards are placed by layout-ui.js on the 12x6 grid; the
// weather card sits in the header, so its width/height handles appear while [배치 편집] is on.
(() => {
  const header = document.querySelector('header');
  const weather = document.querySelector('.weather');
  const storageKey = 'boardSizes';
  const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const loaded = read(storageKey, {});
  // Column/row fractions written by earlier versions stay in the saved value untouched:
  // older backups and the first-run layout migration still read them.
  const legacy = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded : {};
  let sizes = {};
  if (finite(legacy.weatherWidth)) sizes.weatherWidth = legacy.weatherWidth;
  if (finite(legacy.weatherHeight)) sizes.weatherHeight = legacy.weatherHeight;
  let enabled = false, drag = null, frame;

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
  function persist() {
    const value = {...legacy};
    delete value.weatherWidth;
    delete value.weatherHeight;
    put(storageKey, Object.assign(value, sizes));
  }
  function finish() {
    if (!drag) return;
    const {handle, pointerId} = drag;
    drag = null;
    document.body.classList.remove('resizing-board');
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    persist();
  }
  function change(kind, dx, dy, start) {
    if (kind === 'weather-width') sizes.weatherWidth = start.weatherWidth - dx;
    else if (kind === 'weather-height') sizes.weatherHeight = start.weatherHeight + dy;
    apply();
  }
  function startMetrics() {
    const box = weather.getBoundingClientRect();
    return {weatherWidth: box.width, weatherHeight: box.height};
  }
  function handle(edge, kind, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `board-resize-handle edge-${edge}`;
    button.dataset.resize = kind;
    button.setAttribute('aria-label', label);
    button.title = label + ' · 방향키로도 조절';
    button.hidden = true;
    // Visible mark while [배치 편집] is on (layout.css); the button itself is the larger touch area.
    const mark = document.createElement('span');
    mark.className = 'handle-mark';
    button.append(mark);
    weather.append(button);
    button.addEventListener('pointerdown', e => {
      if (!enabled || e.button !== 0) return;
      e.preventDefault();
      drag = {handle: button, pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: startMetrics()};
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
      e.stopPropagation(); // arrows here size the weather card, not a board
      const step = e.shiftKey ? 30 : 10;
      change(kind, e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0,
        e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0, startMetrics());
      persist();
    });
  }
  handle('left', 'weather-width', '날씨 가로 크기 조절');
  handle('bottom', 'weather-height', '날씨 세로 크기 조절');
  // Used by [배치 편집]: show the handles, and restore or reset the size on 취소 / 기본 배치로.
  window.weatherSize = {
    get: () => ({...sizes}),
    set(value) { finish(); sizes = {}; if (finite(value?.weatherWidth)) sizes.weatherWidth = value.weatherWidth; if (finite(value?.weatherHeight)) sizes.weatherHeight = value.weatherHeight; persist(); apply(); },
    reset() { finish(); sizes = {}; persist(); apply(); },
    enable(on) { finish(); enabled = !!on; weather.querySelectorAll('.board-resize-handle').forEach(el => el.hidden = !enabled); }
  };
  window.addEventListener('blur', finish);
  window.addEventListener('pagehide', finish);
  window.addEventListener('resize', () => {
    finish();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  });
  const headerObserver = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  });
  headerObserver.observe(header);
  apply();
})();
