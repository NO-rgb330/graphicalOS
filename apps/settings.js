(function () {
  'use strict';
  window.OSApps = window.OSApps || {};

  const WALL_KEY = 'webos.wallpaper';
  const WALLPAPERS = [
    { id: 'default',  label: 'Midnight', css: 'radial-gradient(circle at 20% 10%, #0d1220 0%, #050608 55%)' },
    { id: 'graphite', label: 'Graphite', css: 'linear-gradient(160deg, #14161b 0%, #050608 100%)' },
    { id: 'ocean',    label: 'Ocean',    css: 'linear-gradient(160deg, #0b1a2b 0%, #050a12 100%)' },
    { id: 'violet',   label: 'Violet',   css: 'linear-gradient(160deg, #1a0f2b 0%, #08040f 100%)' }
  ];

  window.OSApps.settings = {
    id: 'settings',
    name: 'Settings',
    icon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
      '</svg>',
    defaultSize: { width: 660, height: 560 },
    mount(root, ctx) {
      root.classList.add('app-settings');
      const fs      = window.OS.fs;
      const desktop = document.getElementById('desktop');

      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(WALL_KEY) || 'null'); } catch (e) {}

      const currentTheme = window.OS.getTheme();
      const currentWall  = saved && saved.type === 'preset' ? saved.value : null;

      root.innerHTML =
        '<div class="set-section">' +
          '<div class="set-title">Storage</div>' +
          '<div class="storage-bar"><div id="usage"></div></div>' +
          '<div class="storage-meta"><span id="used">0 B used</span><span id="cap">10 GB</span></div>' +
          '<div class="storage-meta"><span id="free"></span><span id="backend"></span></div>' +
        '</div>' +
        '<div class="set-section">' +
          '<div class="set-title">Appearance</div>' +
          '<div class="theme-toggle">' +
            '<button data-theme="light" class="' + (currentTheme === 'light' ? 'active' : '') + '">Light</button>' +
            '<button data-theme="dark"  class="' + (currentTheme === 'dark'  ? 'active' : '') + '">Dark</button>' +
          '</div>' +
        '</div>' +
        '<div class="set-section">' +
          '<div class="set-title">Wallpaper</div>' +
          '<div class="wallpaper-grid">' +
            WALLPAPERS.map(w =>
              '<button data-wall="' + w.id + '" class="' + (currentWall === w.id ? 'active' : '') + '" ' +
              'style="background:' + w.css + '" title="' + w.label + '"></button>'
            ).join('') +
          '</div>' +
          '<div style="margin-top:14px">' +
            '<button class="set-btn" id="wall-from-file">Use image from Files...</button>' +
            '<button class="set-btn" id="wall-reset" style="margin-left:8px">Reset</button>' +
          '</div>' +
        '</div>';

      function updateStorage() {
        const sp = fs.getSpaceDetails();
        const pct = Math.min(100, (sp.used / sp.capacity) * 100);
        root.querySelector('#usage').style.width = pct + '%';
        root.querySelector('#used').textContent  = fs.formatBytes(sp.used) + ' used';
        root.querySelector('#cap').textContent   = fs.formatBytes(sp.capacity);
        root.querySelector('#free').textContent  = fs.formatBytes(sp.free) + ' free';
        root.querySelector('#backend').textContent = 'Backend: ' + fs.backend.toUpperCase();
      }

      root.querySelectorAll('[data-theme]').forEach(b => {
        b.onclick = () => {
          const t = b.dataset.theme;
          window.OS.setTheme(t);
          root.querySelectorAll('[data-theme]').forEach(x => x.classList.toggle('active', x.dataset.theme === t));
        };
      });

      root.querySelectorAll('[data-wall]').forEach(b => {
        b.onclick = () => {
          const w = WALLPAPERS.find(x => x.id === b.dataset.wall);
          if (!w) return;
          desktop.style.backgroundImage = 'none';
          desktop.style.background = w.css;
          localStorage.setItem(WALL_KEY, JSON.stringify({ type: 'preset', value: w.id }));
          root.querySelectorAll('[data-wall]').forEach(x => x.classList.toggle('active', x === b));
        };
      });

      root.querySelector('#wall-reset').onclick = () => {
        desktop.style.backgroundImage = 'none';
        desktop.style.background = WALLPAPERS[0].css;
        localStorage.removeItem(WALL_KEY);
        root.querySelectorAll('[data-wall]').forEach(x => x.classList.toggle('active', x.dataset.wall === 'default'));
      };

      root.querySelector('#wall-from-file').onclick = async () => {
        const p = prompt('Path to image inside Files:', '/System/wallpaper.png');
        if (!p) return;
        const node = fs.get(p);
        if (!node || node.type !== 'file') { alert('File not found: ' + p); return; }
        const blob = await fs.readBlobById(node.id);
        if (!blob) { alert('Could not read file'); return; }
        const reader = new FileReader();
        reader.onload = e => {
          desktop.style.background = '#000';
          desktop.style.backgroundImage = 'url("' + e.target.result + '")';
          desktop.style.backgroundSize = 'cover';
          desktop.style.backgroundPosition = 'center';
          localStorage.setItem(WALL_KEY, JSON.stringify({ type: 'image', value: e.target.result }));
          root.querySelectorAll('[data-wall]').forEach(x => x.classList.remove('active'));
        };
        reader.readAsDataURL(blob);
      };

      updateStorage();
      const unsub = fs.on(updateStorage);
      ctx.win.onClose(() => unsub());
    }
  };
})();
