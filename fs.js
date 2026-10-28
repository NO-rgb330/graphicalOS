/**
 * fs.js — Virtual file system with OPFS primary backend and IndexedDB fallback.
 * Metadata lives in localStorage (JSON tree). File blobs live in OPFS (or IDB).
 */
(function (global) {
  'use strict';

  const OPFS_DIR   = 'webos-fs';
  const META_KEY   = 'webos.fs.meta.v1';
  const CAPACITY   = 10 * 1024 * 1024 * 1024; // 10 GiB
  const IDB_NAME   = 'webos-fs';
  const IDB_STORE  = 'blobs';
  const listeners  = new Set();

  let backend  = 'none';
  let opfsRoot = null;
  let idb      = null;
  let meta     = null;

  const uid   = () => 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  const emit  = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

  // ---------------- IndexedDB fallback ----------------
  function openIDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  function idbPut(id, blob) {
    return new Promise((res, rej) => {
      const t = idb.transaction(IDB_STORE, 'readwrite');
      t.objectStore(IDB_STORE).put({ id, blob });
      t.oncomplete = () => res();
      t.onerror    = () => rej(t.error);
    });
  }
  function idbGet(id) {
    return new Promise(res => {
      const t = idb.transaction(IDB_STORE, 'readonly');
      const r = t.objectStore(IDB_STORE).get(id);
      r.onsuccess = () => res(r.result ? r.result.blob : null);
      r.onerror   = () => res(null);
    });
  }
  function idbDel(id) {
    return new Promise(res => {
      const t = idb.transaction(IDB_STORE, 'readwrite');
      t.objectStore(IDB_STORE).delete(id);
      t.oncomplete = () => res();
      t.onerror    = () => res();
    });
  }

  // ---------------- OPFS ----------------
  async function openOPFS() {
    if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('OPFS unavailable');
    const root = await navigator.storage.getDirectory();
    const dir  = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    // Probe write to be sure we have permissions
    const probe = await dir.getFileHandle('.probe', { create: true });
    const w = await probe.createWritable();
    await w.write('ok');
    await w.close();
    await dir.removeEntry('.probe').catch(() => {});
    return dir;
  }

  // ---------------- Blob I/O ----------------
  async function blobPut(id, blob) {
    if (backend === 'opfs') {
      const fh = await opfsRoot.getFileHandle(id, { create: true });
      const w  = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return;
    }
    if (backend === 'idb') return idbPut(id, blob);
    throw new Error('No storage backend available');
  }

  async function blobGet(id) {
    if (backend === 'opfs') {
      try {
        const fh = await opfsRoot.getFileHandle(id);
        return await fh.getFile();
      } catch (e) { return null; }
    }
    if (backend === 'idb') return idbGet(id);
    return null;
  }

  async function blobDel(id) {
    if (backend === 'opfs') {
      try { await opfsRoot.removeEntry(id); } catch (e) {}
      return;
    }
    if (backend === 'idb') return idbDel(id);
  }

  // ---------------- Metadata ----------------
  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return null;
      const m = JSON.parse(raw);
      if (m && m.rootId && m.nodes && m.nodes[m.rootId]) return m;
    } catch (e) {}
    return null;
  }
  function persist() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); }
    catch (e) { console.warn('Metadata persist failed', e); }
  }

  function createSeed() {
    const now = Date.now();
    const nodes = {};
    const rootId = 'root';
    nodes[rootId] = { id: rootId, parentId: null, name: 'Home', type: 'dir', created: now, modified: now };

    const mk = (parentId, name, type, extra) => {
      const id = uid();
      nodes[id] = Object.assign({ id, parentId, name, type, created: now, modified: now }, extra || {});
      return id;
    };
    const docs = mk(rootId, 'Documents', 'dir');
    const dl   = mk(rootId, 'Downloads', 'dir');
    const desk = mk(rootId, 'Desktop',   'dir');
    const sys  = mk(rootId, 'System',    'dir');
    mk(docs, 'welcome.txt', 'file', { size: 0, mime: 'text/plain' });
    mk(docs, 'notes.txt',   'file', { size: 0, mime: 'text/plain' });
    mk(desk, 'readme.txt',  'file', { size: 0, mime: 'text/plain' });
    mk(sys,  'about.txt',   'file', { size: 0, mime: 'text/plain' });
    mk(sys,  'wallpaper.png','file', { size: 0, mime: 'image/png' });
    void dl;
    return { rootId, nodes };
  }

  function makePng(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return new Promise(r => c.toBlob(r, 'image/png'));
  }

  async function seedContents() {
    await fs.writeFile('/Documents/welcome.txt',
      'Welcome to Web OS.\n\nYour virtual drive lives inside the browser, backed by the Origin Private File System (OPFS) when available, with IndexedDB as a fallback.\n\nTotal capacity: 10 GB.\n\nTry the Files, Notepad, Browser, Media and Settings apps.', 'text/plain');
    await fs.writeFile('/Documents/notes.txt',
      'Meeting notes\n\n- Ship the Web OS demo\n- Test OPFS on Safari\n- Polish window animations', 'text/plain');
    await fs.writeFile('/Desktop/readme.txt',
      'Right-click a file in Files to delete it.\nDrag files onto the grid to upload from your computer.', 'text/plain');
    await fs.writeFile('/System/about.txt',
      'Web OS 1.0\nBackend: OPFS / IndexedDB\nUI: Vanilla JS, no framework.', 'text/plain');

    const png = await makePng(800, 500, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#0b1a2b'); g.addColorStop(1, '#050608');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = '#4f8cff'; x.font = '600 44px -apple-system, sans-serif';
      x.fillText('Web OS', 48, h / 2 + 8);
    });
    if (png) await fs.writeFile('/System/wallpaper.png', png, 'image/png');
  }

  // ---------------- Path helpers ----------------
  function normPath(p) {
    if (p == null) return [];
    return String(p).split('/').filter(Boolean);
  }
  function resolveNode(path) {
    const parts = normPath(path);
    let cur = meta.nodes[meta.rootId];
    for (const part of parts) {
      const next = Object.values(meta.nodes).find(n => n.parentId === cur.id && n.name === part);
      if (!next) return null;
      cur = next;
    }
    return cur;
  }
  function pathOfNode(id) {
    const parts = [];
    let cur = meta.nodes[id];
    while (cur && cur.id !== meta.rootId) {
      parts.unshift(cur.name);
      cur = meta.nodes[cur.parentId];
    }
    return '/' + parts.join('/');
  }
  function childrenOf(id) {
    return Object.values(meta.nodes)
      .filter(n => n.parentId === id)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  // ---------------- Formatting ----------------
  function formatBytes(b) {
    if (b == null) return '—';
    if (b === 0) return '0 B';
    if (b < 1024) return b + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let n = b, i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  }

  // ---------------- Public API ----------------
  const fs = {
    CAPACITY,
    get backend() { return backend; },
    get rootId()  { return meta && meta.rootId; },

    async init() {
      // 1) Try OPFS
      try {
        opfsRoot = await openOPFS();
        backend = 'opfs';
      } catch (e) {
        opfsRoot = null;
        try { idb = await openIDB(); backend = 'idb'; }
        catch (e2) { backend = 'none'; }
      }

      // 2) Load / seed metadata
      meta = loadMeta();
      const fresh = !meta;
      if (!meta) { meta = createSeed(); persist(); }
      if (fresh) { try { await seedContents(); } catch (e) { console.warn('Seed failed', e); } }

      // 3) Ask the browser to make storage persistent (may be denied)
      if (navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch (e) {}
      }
      return backend;
    },

    list(path) {
      const dir = resolveNode(path);
      if (!dir || dir.type !== 'dir') return [];
      return childrenOf(dir.id);
    },
    listById(id) {
      if (!meta.nodes[id]) return [];
      return childrenOf(id);
    },
    get(path)    { return resolveNode(path); },
    getById(id)  { return meta.nodes[id] || null; },
    pathOf(id)   { return pathOfNode(id); },

    async mkdir(path) {
      const parts = normPath(path);
      let cur = meta.nodes[meta.rootId];
      for (const part of parts) {
        let next = Object.values(meta.nodes).find(n => n.parentId === cur.id && n.name === part);
        if (!next) {
          const id = uid();
          next = { id, parentId: cur.id, name: part, type: 'dir', created: Date.now(), modified: Date.now() };
          meta.nodes[id] = next;
        }
        if (next.type !== 'dir') throw new Error('Path component is not a directory: ' + part);
        cur = next;
      }
      persist();
      emit();
      return cur;
    },

    async writeFile(path, content, mime = 'text/plain') {
      const parts = normPath(path);
      if (!parts.length) throw new Error('Invalid path');
      const name = parts.pop();
      const parent = await fs.mkdir('/' + parts.join('/'));

      let blob;
      if (content instanceof Blob)       blob = content;
      else if (content instanceof ArrayBuffer) blob = new Blob([content], { type: mime });
      else if (typeof content === 'string')    blob = new Blob([content], { type: mime });
      else                               blob = new Blob([String(content)], { type: mime });

      const size = blob.size;

      const existing = Object.values(meta.nodes).find(n => n.parentId === parent.id && n.name === name);
      if (existing && existing.type === 'dir') throw new Error('A folder with that name already exists');

      // capacity check
      const usedExcludingThis = fs._usedBytes() - (existing ? (existing.size || 0) : 0);
      if (usedExcludingThis + size > CAPACITY) throw new Error('Not enough free space');

      if (existing) {
        await blobPut(existing.id, blob);
        existing.size = size;
        existing.mime = mime || existing.mime;
        existing.modified = Date.now();
        persist(); emit();
        return existing;
      }

      const id = uid();
      await blobPut(id, blob);
      meta.nodes[id] = {
        id, parentId: parent.id, name, type: 'file',
        size, mime, created: Date.now(), modified: Date.now()
      };
      persist(); emit();
      return meta.nodes[id];
    },

    async readFile(path) {
      const n = resolveNode(path);
      if (!n || n.type !== 'file') throw new Error('Not a file: ' + path);
      const b = await blobGet(n.id);
      return b ? await b.text() : '';
    },

    async readBlob(path) {
      const n = typeof path === 'string' ? resolveNode(path) : meta.nodes[path];
      if (!n || n.type !== 'file') return null;
      return blobGet(n.id);
    },

    async readBlobById(id) {
      return blobGet(id);
    },

    async delete(path) {
      const n = resolveNode(path);
      if (!n) return false;
      if (n.id === meta.rootId) throw new Error('Cannot delete root');
      await fs._removeRecursive(n.id);
      persist(); emit();
      return true;
    },

    async _removeRecursive(id) {
      const kids = childrenOf(id);
      for (const k of kids) await fs._removeRecursive(k.id);
      const n = meta.nodes[id];
      if (!n) return;
      if (n.type === 'file') await blobDel(id);
      delete meta.nodes[id];
    },

    _usedBytes() {
      let t = 0;
      for (const k in meta.nodes) {
        const n = meta.nodes[k];
        if (n.type === 'file') t += n.size || 0;
      }
      return t;
    },

    getSpaceDetails() {
      const used = fs._usedBytes();
      const free = Math.max(0, CAPACITY - used);
      return { capacity: CAPACITY, used, free, percent: CAPACITY ? used / CAPACITY : 0 };
    },

    formatBytes,

    on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };

  global.fs = fs;
})(window);
