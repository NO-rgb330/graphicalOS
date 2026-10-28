(function () {
  'use strict';
  window.OSApps = window.OSApps || {};

  const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="4" y="3" width="16" height="18" rx="2"/>' +
    '<path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>' +
    '</svg>';

  window.OSApps.calculator = {
    id: 'calculator',
    name: 'Calculator',
    icon: ICON,
    defaultSize: { width: 320, height: 460 },
    mount(root, ctx) {
      root.classList.add('app-calculator');
      root.tabIndex = 0;
      root.innerHTML =
        '<div class="calc-display" id="disp">0</div>' +
        '<div class="calc-keys">' +
          '<button class="fn" data-k="C">C</button>' +
          '<button class="fn" data-k="+/-">+/−</button>' +
          '<button class="fn" data-k="%">%</button>' +
          '<button class="op" data-k="/">÷</button>' +
          '<button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button>' +
          '<button class="op" data-k="*">×</button>' +
          '<button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button>' +
          '<button class="op" data-k="-">−</button>' +
          '<button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button>' +
          '<button class="op" data-k="+">+</button>' +
          '<button data-k="0">0</button>' +
          '<button data-k=".">.</button>' +
          '<button class="eq" data-k="=">=</button>' +
        '</div>';

      const disp = root.querySelector('#disp');
      let acc = 0, current = '0', op = null, waiting = false;

      const update = () => { disp.textContent = current; };

      const applyOp = () => {
        const b = parseFloat(current);
        if (op === '+') return acc + b;
        if (op === '-') return acc - b;
        if (op === '*') return acc * b;
        if (op === '/') return b === 0 ? NaN : acc / b;
        return b;
      };

      const press = k => {
        if (/^[0-9]$/.test(k)) {
          if (waiting) { current = k; waiting = false; }
          else current = current === '0' ? k : current + k;
        } else if (k === '.') {
          if (waiting) { current = '0.'; waiting = false; }
          else if (!current.includes('.')) current += '.';
        } else if (k === 'C') {
          acc = 0; current = '0'; op = null; waiting = false;
        } else if (k === '+/-') {
          current = current.startsWith('-') ? current.slice(1) : '-' + current;
        } else if (k === '%') {
          current = String(parseFloat(current) / 100);
        } else if (k === '=') {
          const r = applyOp();
          current = isFinite(r) ? String(+r.toFixed(10)) : 'Error';
          acc = 0; op = null; waiting = true;
        } else { // operator
          const r = applyOp();
          acc = isFinite(r) ? r : acc;
          current = String(+acc.toFixed(10));
          op = k; waiting = true;
        }
        update();
      };

      root.querySelectorAll('.calc-keys button').forEach(b => {
        b.onclick = () => press(b.dataset.k);
      });

      root.addEventListener('keydown', e => {
        const m = { Enter: '=', Escape: 'C' };
        if (/^[0-9.+\-*/]$/.test(e.key)) { press(e.key); e.preventDefault(); }
        else if (m[e.key]) { press(m[e.key]); e.preventDefault(); }
        else if (e.key === 'Backspace') {
          if (!waiting) {
            current = current.length > 1 ? current.slice(0, -1) : '0';
            update();
          }
          e.preventDefault();
        }
      });

      setTimeout(() => root.focus(), 40);
    }
  };
})();
