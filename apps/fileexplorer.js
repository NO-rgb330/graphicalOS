(function () {
  'use strict';
  window.OSApps = window.OSApps || {};

  const ICON_FOLDER =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' +
    '<path d="M3 6h5l2 2h11v11H3z"/></svg>';
  const ICON_FILE =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' +
    '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/></svg>';

  window.OSApps.fileexplorer = {
    id: 'fileexplorer',
    name: 'Files',
    icon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' +
      '<path d="M3 6h5l2 2h11v11H3z"/></svg>',
    defaultSize: { width: 760, height: 520 },
    mount(root, ctx) {
      root.classList.add('app-files');
      root.innerHTML =
        '<div class="fx-toolbar">' +
          '<button data-act="up">Up</button>' +
          '<button data-act="newfolder">New Folder</button>' +
          '<button data-act="refresh">Refresh</button>' +
          '<div class="fx-path"></div>' +
          '<div class="fx-space"></div>' +
        '</div>' +
        '<div class="fx-body"><div class="fx-list"></div></div>';

      const fs      = window.OS.fs;
      const listEl  = root.querySelector('.fx-list');
      const pathEl  = root.querySelector('.fx-path');
      const spaceEl = root.querySelector('.fx-space');
      let cwd = (ctx.params && ctx.params.path) || '/';

      function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
      }

      function render() {
        const items = fs.list(cwd);
        pathEl.textContent = cwd === '/' ? 'Home' : cwd;
        const sp = fs.getSpaceDetails();
        spaceEl.textContent = fs.formatBytes(sp.used) + ' / ' + fs.formatBytes(sp.capacity);

        if (!items.length) {
          listEl.innerHTML = '<div class="fx-empty">This folder is empty.</div>';
          return;
        }

        listEl.innerHTML = items.map(n => {
          const ic = n.type === 'dir' ? ICON_FOLDER : ICON_FILE;
          const meta = n.type === 'dir' ? 'Folder' : fs.formatBytes(n.size || 0);
          return '<div class="fx-item" data-id="' + n.id + '">' +
            '<div class="fx-ic">' + ic + '</div>' +
            '<div class="fx-name">' + esc(n.name) + '</div>' +
            '<div class="fx-meta">' + meta + '</div>' +
            '<button class="fx-del" title="Delete">×</button>' +
          '</div>';
        }).join('');

        listEl.querySelectorAll('.fx-item').forEach(el => {
          const id = el.dataset.id;
          el.ondblclick = () => openNode(id);
          el.querySelector('.fx-del').onclick = async e => {
            e.stopPropagation();
            const node = fs.getById(id);
            if (!node) return;
            if (!confirm('Delete "' + node.name + '"?')) return;
            await fs.delete(fs.pathOf(node.id));
          };
        });
      }

      async function openNode(id) {
        const n = fs.getById(id);
        if (!n) return;
        const p = fs.pathOf(n.id);
        if (n.type === 'dir') { cwd = p; render(); return; }
        const mime = n.mime || '';
        if (mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')) {
          ctx.api.openApp('mediaplayer', { path: p });
        } else if (mime.startsWith('text/') || /\.(txt|md|json|js|css|html|log|csv)$/i.test(n.name)) {
          ctx.api.openApp('notepad', { path: p });
        } else {
          const blob = await fs.readBlobById(n.id);
          if (!blob) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = n.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }
      }

      root.querySelector('[data-act="up"]').onclick = () => {
        if (cwd === '/') return;
        const parts = cwd.split('/').filter(Boolean);
        parts.pop();
        cwd = '/' + parts.join('/');
        render();
      };
      root.querySelector('[data-act="newfolder"]').onclick = async () => {
        const name = prompt('New folder name:');
        if (!name) return;
        try {
          await fs.mkdir((cwd === '/' ? '' : cwd) + '/' + name);
        } catch (e) { alert(e.message); }
      };
      root.querySelector('[data-act="refresh"]').onclick = render;

      // Upload via drag & drop
      listEl.addEventListener('dragover', e => e.preventDefault());
      listEl.addEventListener('drop', async e => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files || []);
        for (const f of files) {
          try {
            await fs.writeFile((cwd === '/' ? '' : cwd) + '/' + f.name, f, f.type || 'application/octet-stream');
          } catch (err) { alert('Upload failed: ' + err.message); }
        }
      });

      const unsub = fs.on(render);
      ctx.win.onClose(() => unsub());

      render();
    }
  };
})();
