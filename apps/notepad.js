(function () {
  'use strict';
  window.OSApps = window.OSApps || {};

  const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 13h6M9 17h4"/>' +
    '</svg>';

  window.OSApps.notepad = {
    id: 'notepad',
    name: 'Notepad',
    icon: ICON,
    defaultSize: { width: 640, height: 460 },
    mount(root, ctx) {
      root.classList.add('app-notepad');
      root.innerHTML =
        '<div class="np-toolbar">' +
          '<button data-act="new">New</button>' +
          '<button data-act="open">Open</button>' +
          '<button data-act="save">Save</button>' +
          '<input class="np-path" type="text" placeholder="/path/to/file.txt" spellcheck="false">' +
          '<span class="np-status"></span>' +
        '</div>' +
        '<textarea class="np-editor" spellcheck="false"></textarea>';

      const fs      = window.OS.fs;
      const pathEl  = root.querySelector('.np-path');
      const editor  = root.querySelector('.np-editor');
      const status  = root.querySelector('.np-status');
      let currentId = null;

      const setStatus = s => { status.textContent = s; };

      async function load(path) {
        try {
          const text = await fs.readFile(path);
          const node = fs.get(path);
          editor.value = text;
          pathEl.value = path;
          currentId = node ? node.id : null;
          ctx.win.setTitle('Notepad — ' + (node ? node.name : path));
          setStatus('Loaded');
        } catch (e) {
          setStatus('Not found');
        }
      }

      async function save() {
        let path = pathEl.value.trim();
        if (!path) {
          path = prompt('Save as:', '/Documents/untitled.txt');
          if (!path) return;
          pathEl.value = path;
        }
        try {
          const node = await fs.writeFile(path, editor.value, 'text/plain');
          currentId = node.id;
          ctx.win.setTitle('Notepad — ' + node.name);
          setStatus('Saved ' + fs.formatBytes(new Blob([editor.value]).size));
        } catch (e) {
          setStatus('Error: ' + e.message);
        }
      }

      root.querySelector('[data-act="new"]').onclick = () => {
        editor.value = ''; pathEl.value = ''; currentId = null;
        ctx.win.setTitle('Notepad');
        setStatus('New file');
        editor.focus();
      };
      root.querySelector('[data-act="open"]').onclick = () => {
        const p = pathEl.value.trim();
        if (p) load(p);
        else ctx.api.openApp('fileexplorer');
      };
      root.querySelector('[data-act="save"]').onclick = save;

      root.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
      });

      if (ctx.params && ctx.params.path) load(ctx.params.path);
    }
  };
})();
