/**
 * desktop.js — Window manager, taskbar, start menu, desktop icons, boot.
 * Depends on: fs.js (window.fs), apps/*.js (window.OSApps)
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Element handles
   * ------------------------------------------------------------------ */
  const desktop      = document.getElementById('desktop');
  const windowsLayer = document.getElementById('windows');
  const iconsLayer   = document.getElementById('desktop-icons');
  const taskbarApps  = document.getElementById('taskbar-apps');
  const startBtn     = document.getElementById('start-btn');
  const startMenu    = document.getElementById('start-menu');
  const smApps       = document.getElementById('sm-apps');
  const smTheme      = document.getElementById('sm-theme');
  const clockEl      = document.getElementById('clock');
  const fsBadge      = document.getElementById('fs-badge');

  const apps = window.OSApps || {};
  const fs   = window.fs;

  /* ------------------------------------------------------------------ *
   *  Constants / state
   * ------------------------------------------------------------------ */
  const THEME_KEY = 'webos.theme';
  const WALL_KEY  = 'webos.wallpaper';
  const WALLPAPERS = {
    default:  'radial-gradient(circle at 20% 10%, #0d1220 0%, #050608 55%)',
    graphite: 'linear-gradient(160deg, #14161b 0%, #050608 100%)',
    ocean:    'linear-gradient(160deg, #0b1a2b 0%, #050a12 100%)',
    violet:   'linear-gradient(160deg, #1a0f2b 0%, #08040f 100%)'
  };

  let zTop      = 100;
  let winSeq    = 0;
  let activeId  = null;
  let initPromise = null;

  /** id -> { id, appId, el, params, minimized, maximized, prevRect, _tb, _closeFn } */
  const windows = new Map();

  /* ------------------------------------------------------------------ *
   *  Theme
   * ------------------------------------------------------------------ */
  function setTheme(t) {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add('theme-' + t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    if (smTheme) smTheme.textContent = t === 'dark' ? 'Switch to Light' : 'Switch to Dark';
  }
  function getTheme() {
    return document.body.classList.contains('theme-light') ? 'light' : 'dark';
  }
  setTheme((localStorage.getItem(THEME_KEY) || 'dark'));

  /* ------------------------------------------------------------------ *
   *  Wallpaper
   * ------------------------------------------------------------------ */
  function applyWallpaper() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(WALL_KEY) || 'null'); } catch (e) {}

    desktop.style.backgroundImage = 'none';
    desktop.style.backgroundSize  = '';
    desktop.style.backgroundPosition = '';

    if (saved && saved.type === 'image' && saved.value) {
      desktop.style.background = '#000';
      desktop.style.backgroundImage    = 'url("' + saved.value + '")';
      desktop.style.backgroundSize     = 'cover';
      desktop.style.backgroundPosition = 'center';
    } else if (saved && saved.type === 'preset' && WALLPAPERS[saved.value]) {
      desktop.style.background = WALLPAPERS[saved.value];
    } else {
      desktop.style.background = WALLPAPERS.default;
    }
  }
  applyWallpaper();

  /* ------------------------------------------------------------------ *
   *  Window creation
   * ------------------------------------------------------------------ */
  function createWindow(appId, params) {
    const app = apps[appId];
    if (!app) { console.warn('[desktop] unknown app:', appId); return null; }

    const id   = 'win_' + (++winSeq);
    const size = app.defaultSize || { width: 640, height: 480 };
    const el   = document.createElement('div');
    el.className    = 'window';
    el.dataset.id   = id;

    /* cascade placement */
    const offset = (windows.size % 8) * 26;
    el.style.left   = Math.min(80 + offset, Math.max(20, window.innerWidth  - size.width  - 40)) + 'px';
    el.style.top    = Math.min(60 + offset, Math.max(20, window.innerHeight - size.height - 100)) + 'px';
    el.style.width  = Math.min(size.width,  window.innerWidth  - 40) + 'px';
    el.style.height = Math.min(size.height, window.innerHeight - 110) + 'px';
    el.style.zIndex = ++zTop;

    el.innerHTML =
      '<div class="win-titlebar">' +
        '<div class="win-title">' +
          '<span class="win-icon">' + (app.icon || '') + '</span>' +
          '<span class="win-title-text">' + escapeHtml(app.name) + '</span>' +
        '</div>' +
        '<div class="win-controls">' +
          '<button class="win-btn min"   title="Minimize"></button>' +
          '<button class="win-btn max"   title="Maximize"></button>' +
          '<button class="win-btn close" title="Close"></button>' +
        '</div>' +
      '</div>' +
      '<div class="win-body"></div>' +
      '<div class="win-resize r-n"  data-dir="n"></div>'  +
      '<div class="win-resize r-s"  data-dir="s"></div>'  +
      '<div class="win-resize r-e"  data-dir="e"></div>'  +
      '<div class="win-resize r-w"  data-dir="w"></div>'  +
      '<div class="win-resize r-ne" data-dir="ne"></div>' +
      '<div class="win-resize r-nw" data-dir="nw"></div>' +
      '<div class="win-resize r-se" data-dir="se"></div>' +
      '<div class="win-resize r-sw" data-dir="sw"></div>';

    windowsLayer.appendChild(el);

    /* taskbar entry */
    const tb = document.createElement('button');
    tb.className    = 'taskbar-app';
    tb.dataset.id   = id;
    tb.title        = app.name;
    tb.innerHTML    = '<span class="tb-icon">' + (app.icon || '') + '</span>' +
                      '<span class="tb-label">' + escapeHtml(app.name) + '</span>';
    tb.addEventListener('click', () => toggleMinimize(id));
    taskbarApps.appendChild(tb);

    /* public window handle exposed to apps */
    const winObj = {
      id,
      appId,
      el,
      params,
      minimized:  false,
      maximized:  false,
      prevRect:   null,
      setTitle:   t => {
        const n = el.querySelector('.win-title-text');
        if (n) n.textContent = t;
        const l = tb.querySelector('.tb-label');
        if (l) l.textContent = t;
      },
      close:      () => closeWindow(id),
      minimize:   () => minimizeWindow(id),
      maximize:   () => toggleMaximize(id),
      onClose:    fn => { winObj._closeFn = fn; }
    };
    winObj._tb = tb;
    winObj._closeFn = null;

    /* window controls */
    el.querySelector('.win-btn.min').addEventListener('click', e => {
      e.stopPropagation(); minimizeWindow(id);
    });
    el.querySelector('.win-btn.max').addEventListener('click', e => {
      e.stopPropagation(); toggleMaximize(id);
    });
    el.querySelector('.win-btn.close').addEventListener('click', e => {
      e.stopPropagation(); closeWindow(id);
    });

    /* focus on any pointerdown inside */
    el.addEventListener('pointerdown', () => focusWindow(id), true);

    /* drag + resize */
    attachDrag(el.querySelector('.win-titlebar'), el, id);
    el.querySelectorAll('.win-resize').forEach(h => attachResize(h, el, id));

    windows.set(id, winObj);
    focusWindow(id);

    /* mount app */
    const body = el.querySelector('.win-body');
    const api = {
      appId,
      fs: window.fs,
      setTheme,
      getTheme,
      openApp: (a, p) => openApp(a, p),
      close:   () => closeWindow(id)
    };

    try {
      app.mount(body, { win: winObj, api, params: params || {} });
    } catch (err) {
      console.error('[desktop] mount error for ' + appId, err);
      body.innerHTML = '<div class="fx-empty">Failed to start app: ' + escapeHtml(err.message) + '</div>';
    }

    return winObj;
  }

  /* ------------------------------------------------------------------ *
   *  Focus / minimize / maximize / close
   * ------------------------------------------------------------------ */
  function focusWindow(id) {
    const w = windows.get(id);
    if (!w) return;

    if (w.minimized) {
      w.minimized = false;
      w.el.classList.remove('minimized');
    }

    w.el.style.zIndex = ++zTop;
    activeId = id;

    windows.forEach((ww, wid) => {
      ww.el.classList.toggle('focused', wid === id);
      if (ww._tb) ww._tb.classList.toggle('active', wid === id);
    });
  }

  function minimizeWindow(id) {
    const w = windows.get(id);
    if (!w) return;
    w.minimized = true;
    w.el.classList.add('minimized');
    w.el.classList.remove('focused');
    if (w._tb) w._tb.classList.remove('active');
    if (activeId === id) activeId = null;
  }

  function toggleMinimize(id) {
    const w = windows.get(id);
    if (!w) return;
    if (w.minimized) {
      focusWindow(id);
    } else if (activeId === id) {
      minimizeWindow(id);
    } else {
      focusWindow(id);
    }
  }

  function toggleMaximize(id) {
    const w = windows.get(id);
    if (!w) return;

    if (w.maximized) {
      /* restore */
      const r = w.prevRect || {};
      w.el.style.left   = r.left   || '80px';
      w.el.style.top    = r.top    || '60px';
      w.el.style.width  = r.width  || '640px';
      w.el.style.height = r.height || '480px';
      w.maximized = false;
      w.el.classList.remove('maximized');
    } else {
      /* store current rect */
      w.prevRect = {
        left:   w.el.style.left,
        top:    w.el.style.top,
        width:  w.el.style.width,
        height: w.el.style.height
      };
      w.el.style.left   = '0px';
      w.el.style.top    = '0px';
      w.el.style.width  = '100vw';
      w.el.style.height = 'calc(100vh - var(--tb-height))';
      w.maximized = true;
      w.el.classList.add('maximized');
    }
    focusWindow(id);
  }

  function closeWindow(id) {
    const w = windows.get(id);
    if (!w) return;

    if (typeof w._closeFn === 'function') {
      try { w._closeFn(); } catch (e) { console.error(e); }
    }
    w.el.remove();
    if (w._tb) w._tb.remove();
    windows.delete(id);

    if (activeId === id) {
      activeId = null;
      /* focus the top-most remaining window */
      let topZ = -1, topId = null;
      windows.forEach((ww, wid) => {
        const z = parseInt(ww.el.style.zIndex, 10) || 0;
        if (!ww.minimized && z > topZ) { topZ = z; topId = wid; }
      });
      if (topId) focusWindow(topId);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Pointer-based drag (titlebar)
   * ------------------------------------------------------------------ */
  function attachDrag(handle, el, id) {
    let pointerId = null;
    let startX = 0, startY = 0, origL = 0, origT = 0;

    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.win-controls')) return;
      if (el.classList.contains('maximized')) return;

      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      const r = el.getBoundingClientRect();
      origL = r.left;
      origT = r.top;

      el.classList.add('dragging');
      try { handle.setPointerCapture(pointerId); } catch (err) {}
      focusWindow(id);
      e.preventDefault();
    });

    handle.addEventListener('pointermove', e => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      /* keep a bit of the titlebar on screen */
      const maxL = window.innerWidth  - 40;
      const maxT = window.innerHeight - (parseInt(getComputedStyle(document.documentElement)
                    .getPropertyValue('--tb-height'), 10) || 48) - 20;

      el.style.left = Math.max(-el.offsetWidth + 80, Math.min(maxL, origL + dx)) + 'px';
      el.style.top  = Math.max(0,                     Math.min(maxT, origT + dy)) + 'px';
    });

    const stop = e => {
      if (pointerId === null) return;
      el.classList.remove('dragging');
      try { handle.releasePointerCapture(pointerId); } catch (err) {}
      pointerId = null;
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('lostpointercapture', stop);
  }

  /* ------------------------------------------------------------------ *
   *  Pointer-based resize (edges + corners)
   * ------------------------------------------------------------------ */
  function attachResize(handle, el, id) {
    const MIN_W = 280;
    const MIN_H = 180;
    let pointerId = null;
    let startX = 0, startY = 0;
    let rect = null;
    let dir = '';

    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (el.classList.contains('maximized')) return;

      dir       = handle.dataset.dir || '';
      pointerId = e.pointerId;
      startX    = e.clientX;
      startY    = e.clientY;
      rect      = el.getBoundingClientRect();

      try { handle.setPointerCapture(pointerId); } catch (err) {}
      focusWindow(id);
      e.preventDefault();
      e.stopPropagation();
    });

    handle.addEventListener('pointermove', e => {
      if (pointerId === null || e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let L = rect.left;
      let T = rect.top;
      let W = rect.width;
      let H = rect.height;

      if (dir.indexOf('e') !== -1) W = Math.max(MIN_W, rect.width + dx);
      if (dir.indexOf('s') !== -1) H = Math.max(MIN_H, rect.height + dy);
      if (dir.indexOf('w') !== -1) {
        W = Math.max(MIN_W, rect.width - dx);
        L = rect.left + (rect.width - W);
      }
      if (dir.indexOf('n') !== -1) {
        H = Math.max(MIN_H, rect.height - dy);
        T = Math.max(0, rect.top + (rect.height - H));
        if (T === 0) H = rect.bottom;  // clamp if pushed past top
      }

      el.style.left   = L + 'px';
      el.style.top    = T + 'px';
      el.style.width  = W + 'px';
      el.style.height = H + 'px';
    });

    const stop = () => {
      if (pointerId === null) return;
      try { handle.releasePointerCapture(pointerId); } catch (err) {}
      pointerId = null;
      rect = null;
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('lostpointercapture', stop);
  }

  /* ------------------------------------------------------------------ *
   *  Start menu
   * ------------------------------------------------------------------ */
  function buildStartMenu() {
    smApps.innerHTML = Object.values(apps).map(app =>
      '<button class="sm-app" data-app="' + app.id + '" title="' + escapeHtml(app.name) + '">' +
        '<span class="sm-app-icon">' + (app.icon || '') + '</span>' +
        '<span class="sm-app-name">' + escapeHtml(app.name) + '</span>' +
      '</button>'
    ).join('');

    smApps.querySelectorAll('.sm-app').forEach(btn => {
      btn.addEventListener('click', async () => {
        closeStartMenu();
        await openApp(btn.dataset.app);
      });
    });
  }

  function openStartMenu() {
    startMenu.hidden = false;
    startBtn.classList.add('active');
  }
  function closeStartMenu() {
    startMenu.hidden = true;
    startBtn.classList.remove('active');
  }

  /* start button icon */
  startBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="currentColor">' +
      '<rect x="3"  y="3"  width="8" height="8" rx="1.5"/>' +
      '<rect x="13" y="3"  width="8" height="8" rx="1.5"/>' +
      '<rect x="3"  y="13" width="8" height="8" rx="1.5"/>' +
      '<rect x="13" y="13" width="8" height="8" rx="1.5"/>' +
    '</svg>';

  startBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (startMenu.hidden) openStartMenu(); else closeStartMenu();
  });

  document.addEventListener('pointerdown', e => {
    if (startMenu.hidden) return;
    if (startMenu.contains(e.target) || startBtn.contains(e.target)) return;
    closeStartMenu();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !startMenu.hidden) closeStartMenu();
  });

  smTheme.addEventListener('click', () => {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  });

  /* ------------------------------------------------------------------ *
   *  Desktop icons
   * ------------------------------------------------------------------ */
  const DESKTOP_APPS = ['fileexplorer', 'notepad', 'browser', 'mediaplayer', 'calculator', 'settings'];

  function buildDesktopIcons() {
    iconsLayer.innerHTML = DESKTOP_APPS
      .filter(id => apps[id])
      .map(id => {
        const app = apps[id];
        return '<button class="desk-icon" data-app="' + id + '" title="' + escapeHtml(app.name) + '">' +
          '<span class="desk-icon-glyph">' + (app.icon || '') + '</span>' +
          '<span class="desk-icon-label">' + escapeHtml(app.name) + '</span>' +
        '</button>';
      }).join('');

    iconsLayer.querySelectorAll('.desk-icon').forEach(el => {
      el.addEventListener('dblclick', () => openApp(el.dataset.app));
      el.addEventListener('click', e => {
        iconsLayer.querySelectorAll('.desk-icon').forEach(i => i.classList.remove('sel'));
        el.classList.add('sel');
        e.stopPropagation();
      });
    });

    desktop.addEventListener('pointerdown', e => {
      if (!e.target.closest('.desk-icon')) {
        iconsLayer.querySelectorAll('.desk-icon').forEach(i => i.classList.remove('sel'));
      }
    });
  }

  /* ------------------------------------------------------------------ *
   *  Clock
   * ------------------------------------------------------------------ */
  function tickClock() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    clockEl.textContent = hh + ':' + mm;
    clockEl.title = d.toLocaleString();
  }

  /* ------------------------------------------------------------------ *
   *  Helpers
   * ------------------------------------------------------------------ */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* public opener that waits for fs.init() to finish */
  async function openApp(id, params) {
    if (initPromise) {
      try { await initPromise; } catch (e) {}
    }
    return createWindow(id, params);
  }

  /* ------------------------------------------------------------------ *
   *  Boot
   * ------------------------------------------------------------------ */
  async function boot() {
    tickClock();
    setInterval(tickClock, 1000);

    buildStartMenu();
    buildDesktopIcons();

    /* initialise fs (OPFS with IDB fallback) */
    try {
      initPromise = fs.init();
      const backend = await initPromise;
      const label =
        backend === 'opfs' ? 'OPFS' :
        backend === 'idb'  ? 'IDB'  : 'OFFLINE';
      fsBadge.textContent = label;
      fsBadge.title       = 'Storage backend: ' + backend;
      console.info('[desktop] storage backend:', backend);
    } catch (err) {
      console.error('[desktop] fs.init failed', err);
      fsBadge.textContent = 'ERROR';
      fsBadge.title       = 'Storage init failed: ' + err.message;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Public API used by apps & settings
   * ------------------------------------------------------------------ */
  window.OS = {
    openApp,
    createWindow,
    focusWindow,
    closeWindow,
    fs,
    setTheme,
    getTheme,
    applyWallpaper
  };

  boot();
})();
