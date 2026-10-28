(function () {
  'use strict';
  window.OSApps = window.OSApps || {};

  function buildHomePage() {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Search</title>' +
    '<style>' +
      '*{box-sizing:border-box}' +
      'body{margin:0;min-height:100vh;background:#0a0b0e;color:#e8eaef;' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
        'display:flex;flex-direction:column;align-items:center;padding:60px 24px}' +
      '.logo{font-size:44px;font-weight:200;letter-spacing:.2em;color:#fff;margin-bottom:8px}' +
      '.logo b{font-weight:700;color:#4f8cff}' +
      '.tagline{color:#5c6370;font-size:13px;margin-bottom:32px}' +
      'form{display:flex;gap:8px;width:100%;max-width:620px}' +
      'input[type=text]{flex:1;height:46px;padding:0 18px;border-radius:23px;' +
        'border:1px solid #2a2e38;background:#14161b;color:#e8eaef;font-size:14px;' +
        'outline:none;font-family:inherit}' +
      'input[type=text]:focus{border-color:#4f8cff}' +
      'button{height:46px;padding:0 22px;border-radius:23px;border:none;' +
        'background:#4f8cff;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}' +
      'button:hover{background:#6a9fff}' +
      '#results{width:100%;max-width:620px;margin-top:36px}' +
      '.res{padding:16px 18px;margin-bottom:12px;background:#14161b;' +
        'border:1px solid #23262f;border-radius:12px;cursor:pointer;transition:border-color .15s}' +
      '.res:hover{border-color:#3a3f4c}' +
      '.res-title{font-size:15px;color:#7aa7ff;margin-bottom:4px}' +
      '.res-url{font-size:11px;color:#5c6370;margin-bottom:6px;font-family:monospace}' +
      '.res-snippet{font-size:13px;color:#b8bcc6;line-height:1.5}' +
      '.empty{color:#5c6370;text-align:center;padding:30px;font-size:13px}' +
    '</style></head><body>' +
      '<div class="logo">SEARCH<b>.</b></div>' +
      '<div class="tagline">Discover the mock web</div>' +
      '<form id="f"><input type="text" id="q" placeholder="Search anything..." autocomplete="off"><button type="submit">Search</button></form>' +
      '<div id="results"></div>' +
      '<script>' +
        'var DB=[' +
          '{title:"Web OS Documentation",url:"docs.webos.local",snippet:"Learn how to use the virtual file system, manage windows, and customize your desktop."},' +
          '{title:"Getting Started with OPFS",url:"developer.local/opfs",snippet:"The Origin Private File System gives web applications fast, persistent storage directly in the browser."},' +
          '{title:"Modern UI Design Principles",url:"design.webos.local/principles",snippet:"Explore clean interfaces, thoughtful spacing, and accessible color systems."},' +
          '{title:"JavaScript Performance Tips",url:"perf.webos.local/tips",snippet:"Optimize with pointer events, requestAnimationFrame, and efficient DOM updates."},' +
          '{title:"CSS Grid Layout Guide",url:"css.webos.local/grid",snippet:"A complete guide to CSS Grid, from simple two-dimensional layouts to responsive designs."},' +
          '{title:"Virtual Machine Concepts",url:"systems.webos.local/vm",snippet:"An overview of virtual machines, emulation, and how browsers simulate complete operating systems."},' +
          '{title:"Web Platform Today",url:"platform.webos.local",snippet:"A look at modern web: Workers, File System Access, WASM, and beyond."},' +
          '{title:"Building a Calculator",url:"math.webos.local",snippet:"Simple techniques for building a working calculator with JavaScript and operator precedence."}' +
        '];' +
        'var q=document.getElementById("q");var results=document.getElementById("results");' +
        'function render(list){if(!list.length){results.innerHTML="<div class=\\"empty\\">No results. Try a different search.</div>";return;}' +
          'results.innerHTML=list.map(function(r){return "<div class=\\"res\\"><div class=\\"res-title\\">"+r.title+"</div><div class=\\"res-url\\">"+r.url+"</div><div class=\\"res-snippet\\">"+r.snippet+"</div></div>";}).join("");}' +
        'document.getElementById("f").addEventListener("submit",function(e){' +
          'e.preventDefault();var t=q.value.toLowerCase().trim();' +
          'if(!t){render(DB.slice(0,4));return;}' +
          'render(DB.filter(function(r){return (r.title+" "+r.snippet+" "+r.url).toLowerCase().indexOf(t)!==-1;}));' +
        '});' +
        'render(DB.slice(0,4));' +
      '<\/script>' +
    '</body></html>';
  }

  window.OSApps.browser = {
    id: 'browser',
    name: 'Browser',
    icon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18"/></svg>',
    defaultSize: { width: 900, height: 600 },
    mount(root, ctx) {
      root.classList.add('app-browser');
      root.innerHTML =
        '<div class="br-bar">' +
          '<button data-act="reload" title="Reload">&#x21bb;</button>' +
          '<button data-act="home" title="Home">&#8962;</button>' +
          '<input class="br-url" type="text" value="home" spellcheck="false">' +
          '<button data-act="go" title="Go">Go</button>' +
        '</div>' +
        '<iframe class="br-frame" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>';

      const frame = root.querySelector('.br-frame');
      const urlEl = root.querySelector('.br-url');
      const home = buildHomePage();

      function navigate(target) {
        const t = (target || '').trim();
        if (!t || t === 'home' || t === 'about:home') {
          frame.removeAttribute('src');
          frame.srcdoc = home;
          urlEl.value = 'home';
          return;
        }
        // treat as URL — try to load in iframe, may be blocked by X-Frame-Options
        let src = t;
        if (!/^https?:\/\//i.test(src)) src = 'https://' + src;
        frame.removeAttribute('srcdoc');
        frame.src = src;
        urlEl.value = t;
      }

      root.querySelector('[data-act="reload"]').onclick = () => navigate(urlEl.value);
      root.querySelector('[data-act="home"]').onclick   = () => navigate('home');
      root.querySelector('[data-act="go"]').onclick     = () => navigate(urlEl.value);
      urlEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') navigate(urlEl.value);
      });

      navigate('home');
    }
  };
})();
