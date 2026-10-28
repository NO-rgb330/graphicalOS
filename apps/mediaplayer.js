(function () {
  'use strict';
  window.OSApps = window.OSApps || {};

  window.OSApps.mediaplayer = {
    id: 'mediaplayer',
    name: 'Media',
    icon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' +
      '<path d="M8 5l11 7-11 7z"/></svg>',
    defaultSize: { width: 720, height: 500 },
    mount(root, ctx) {
      root.classList.add('app-media');
      root.innerHTML =
        '<div class="mp-stage" id="stage"></div>' +
        '<div class="mp-toolbar">' +
          '<select id="filepick"></select>' +
          '<button id="refresh">Refresh</button>' +
          '<span id="mpinfo"></span>' +
        '</div>';

      const fs    = window.OS.fs;
      const stage = root.querySelector('#stage');
      const pick  = root.querySelector('#filepick');
      const info  = root.querySelector('#mpinfo');
      let currentUrl = null;
      let selectedId = null;

      function collect() {
        const out = [];
        (function walk(id, prefix) {
          for (const n of fs.listById(id)) {
            const p = prefix + '/' + n.name;
            if (n.type === 'dir') walk(n.id, p);
            else if (n.mime && /^(audio|video|image)\//.test(n.mime)) {
              out.push({ id: n.id, name: n.name, path: p, mime: n.mime });
            }
          }
        })(fs.rootId, '');
        return out;
      }

      function refresh() {
        const list = collect();
        pick.innerHTML = '<option value="">— Select a media file —</option>' +
          list.map(m => '<option value="' + m.id + '">' + m.path + '</option>').join('');
        if (selectedId && list.some(m => m.id === selectedId)) pick.value = selectedId;
      }

      function cleanup() {
        if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
      }

      async function play(id) {
        cleanup();
        stage.innerHTML = '';
        info.textContent = '';
        if (!id) return;
        const n = fs.getById(id);
        if (!n) return;
        const blob = await fs.readBlobById(id);
        if (!blob) { info.textContent = 'Could not read file'; return; }
        currentUrl = URL.createObjectURL(blob);
        let el;
        if (n.mime.startsWith('video/'))      el = document.createElement('video');
        else if (n.mime.startsWith('audio/')) el = document.createElement('audio');
        else                                  el = document.createElement('img');
        if (el.tagName !== 'IMG') { el.controls = true; el.autoplay = true; }
        el.src = currentUrl;
        stage.appendChild(el);
        info.textContent = n.name + ' — ' + fs.formatBytes(n.size || 0);
        selectedId = id;
      }

      pick.onchange = () => play(pick.value);
      root.querySelector('#refresh').onclick = refresh;

      refresh();
      if (ctx.params && ctx.params.path) {
        const node = fs.get(ctx.params.path);
        if (node) { selectedId = node.id; refresh(); play(node.id); }
      }

      ctx.win.onClose(cleanup);
    }
  };
})();
