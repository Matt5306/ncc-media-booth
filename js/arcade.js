/*
 * arcade.js - shared booth furniture for every Media Team training game.
 *
 * Gives each game two things it needs at a ministry fair:
 *   1. A HOW TO PLAY card. Three steps, plain language, no jargon. Shown BEFORE
 *      play, because nobody at a booth reads instructions after they have lost.
 *   2. An arcade high-score board with three-letter initials, stored per game.
 *
 * Scores live in localStorage on the booth laptop. That is deliberate: no server,
 * no network, and the board resets if you clear site data. Wrapped in try/catch
 * because a locked-down browser can throw on storage access, and a dead
 * leaderboard must never take the game down with it.
 *
 * Usage:
 *   Arcade.howTo({ title, steps: [], controls: '' })  -> HTML string
 *   Arcade.boardHTML('camera')                        -> HTML string
 *   Arcade.qualifies('camera', 820)                   -> bool
 *   Arcade.submit('camera', 'MAT', 820)
 *   Arcade.initialsHTML()                             -> HTML for the entry row
 *   Arcade.wireInitials(rootEl, onDone)               -> makes that row work
 */
(function (global) {
  'use strict';

  var KEY = 'nccMediaArcade';
  var KEEP = 5;

  // ---------------------------------------------------------------- storage
  function readAll() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) { return {}; }
  }

  function writeAll(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }

  function top(gameId, n) {
    var all = readAll();
    var list = (all[gameId] || []).slice();
    list.sort(function (a, b) { return b.score - a.score; });
    return list.slice(0, n || KEEP);
  }

  function qualifies(gameId, score) {
    if (!score || score <= 0) return false;
    var list = top(gameId, KEEP);
    if (list.length < KEEP) return true;
    return score > list[list.length - 1].score;
  }

  function submit(gameId, name, score) {
    var all = readAll();
    var list = all[gameId] || [];
    list.push({
      name: String(name || '???').toUpperCase().slice(0, 3),
      score: Math.round(score) || 0
    });
    list.sort(function (a, b) { return b.score - a.score; });
    all[gameId] = list.slice(0, KEEP);
    writeAll(all);
  }

  // ---------------------------------------------------------------- markup
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function boardHTML(gameId, heading) {
    var list = top(gameId, KEEP);
    var rows = '';
    for (var i = 0; i < KEEP; i++) {
      var e = list[i];
      rows += '<div class="arc-row' + (e ? '' : ' arc-empty') + '">' +
                '<span class="arc-rank">' + (i + 1) + '</span>' +
                '<span class="arc-name">' + (e ? esc(e.name) : '---') + '</span>' +
                '<span class="arc-score">' + (e ? e.score : '&mdash;') + '</span>' +
              '</div>';
    }
    return '<div class="arc-board">' +
             '<div class="arc-title">' + esc(heading || 'HIGH SCORES') + '</div>' +
             rows +
           '</div>';
  }

  function howTo(opts) {
    opts = opts || {};
    var steps = (opts.steps || []).map(function (s, i) {
      return '<li><span class="arc-num">' + (i + 1) + '</span><span>' + s + '</span></li>';
    }).join('');
    return '<div class="arc-how">' +
             '<div class="arc-title">' + esc(opts.title || 'HOW TO PLAY') + '</div>' +
             '<ol class="arc-steps">' + steps + '</ol>' +
             (opts.controls ? '<div class="arc-controls">' + opts.controls + '</div>' : '') +
           '</div>';
  }

  function initialsHTML() {
    return '<div class="arc-entry">' +
             '<div class="arc-title">NEW HIGH SCORE — ENTER YOUR INITIALS</div>' +
             '<div class="arc-letters">' +
               '<button class="arc-let" data-i="0">A</button>' +
               '<button class="arc-let" data-i="1">A</button>' +
               '<button class="arc-let" data-i="2">A</button>' +
             '</div>' +
             '<div class="arc-entry-hint">Tap a letter to change it, or just type</div>' +
             '<button class="arc-save">SAVE SCORE</button>' +
           '</div>';
  }

  // Makes the initials row interactive. Calls onDone(initials) when saved.
  function wireInitials(root, onDone) {
    if (!root) return;
    var letters = root.querySelectorAll('.arc-let');
    if (!letters.length) return;
    var vals = ['A', 'A', 'A'];
    var cur = 0;

    function paint() {
      for (var i = 0; i < letters.length; i++) {
        letters[i].textContent = vals[i];
        letters[i].classList.toggle('active', i === cur);
      }
    }

    for (var i = 0; i < letters.length; i++) {
      (function (idx) {
        letters[idx].addEventListener('click', function () {
          if (cur === idx) {
            // cycle the letter on a repeat tap
            var c = vals[idx].charCodeAt(0);
            c = c >= 90 ? 65 : c + 1;
            vals[idx] = String.fromCharCode(c);
          }
          cur = idx;
          paint();
        });
      })(i);
    }

    function onKey(e) {
      var k = (e.key || '').toUpperCase();
      if (/^[A-Z0-9]$/.test(k)) {
        vals[cur] = k;
        if (cur < 2) cur++;
        paint();
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        vals[cur] = 'A';
        if (cur > 0) cur--;
        paint();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        save();
        e.preventDefault();
      }
    }
    document.addEventListener('keydown', onKey);

    function save() {
      document.removeEventListener('keydown', onKey);
      if (onDone) onDone(vals.join(''));
    }

    var btn = root.querySelector('.arc-save');
    if (btn) btn.addEventListener('click', save);
    paint();
  }

  // ---------------------------------------------------------------- styles
  function injectCSS() {
    if (document.getElementById('arcade-css')) return;
    var css = document.createElement('style');
    css.id = 'arcade-css';
    css.textContent = [
      '.arc-board,.arc-how,.arc-entry{background:var(--panel,#161b22);border:1px solid var(--border,#30363d);',
      'border-radius:12px;padding:16px 20px;text-align:left;min-width:260px}',
      '.arc-title{font-size:11px;letter-spacing:2px;font-weight:800;color:var(--text-dim,#8b949e);',
      'margin-bottom:12px;text-align:center}',
      '.arc-row{display:flex;align-items:center;gap:12px;padding:5px 0;font-variant-numeric:tabular-nums;',
      'border-bottom:1px solid rgba(255,255,255,.05)}',
      '.arc-row:last-child{border-bottom:none}',
      '.arc-rank{width:20px;color:var(--text-dim,#8b949e);font-size:13px;font-weight:700}',
      '.arc-name{flex:1;font-weight:800;letter-spacing:3px;font-size:17px}',
      '.arc-score{font-weight:800;font-size:17px;color:var(--gold,#d29922)}',
      '.arc-empty{opacity:.35}',
      '.arc-steps{list-style:none;display:flex;flex-direction:column;gap:11px;padding:0;margin:0}',
      '.arc-steps li{display:flex;gap:11px;align-items:flex-start;font-size:15px;line-height:1.45}',
      '.arc-num{flex:none;width:23px;height:23px;border-radius:50%;background:var(--accent,#58a6ff);',
      'color:#04121f;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center}',
      '.arc-controls{margin-top:13px;padding-top:11px;border-top:1px solid var(--border,#30363d);',
      'font-size:13px;color:var(--text-dim,#8b949e);text-align:center;line-height:1.5}',
      '.arc-letters{display:flex;gap:10px;justify-content:center;margin-bottom:8px}',
      '.arc-let{width:58px;height:70px;font-size:34px;font-weight:900;font-family:inherit;cursor:pointer;',
      'background:var(--panel2,#21262d);color:var(--text,#e6edf3);border:2px solid var(--border,#30363d);border-radius:9px}',
      '.arc-let.active{border-color:var(--gold,#d29922);color:var(--gold,#d29922)}',
      '.arc-entry-hint{font-size:12px;color:var(--text-dim,#8b949e);text-align:center;margin-bottom:12px}',
      '.arc-save{display:block;margin:0 auto;padding:13px 30px;font-size:15px;font-weight:800;font-family:inherit;',
      'cursor:pointer;background:var(--gold,#d29922);color:#1a1200;border:none;border-radius:8px}'
    ].join('');
    document.head.appendChild(css);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  } else { injectCSS(); }

  // ---------------------------------------------------------------- backdrops
  // Games prefer a real photo of the sanctuary and fall back to a drawn scene.
  // Drop a file into docs/assets/ with the expected name and it is picked up on
  // the next load - no code change, and a missing file is not an error.
  //
  //   assets/sanctuary-wide.jpg   - whole room, used as the camera backdrop
  //   assets/sanctuary-stage.jpg  - stage/pulpit, used behind lower thirds
  //
  // Any ordinary photo works. Landscape, roughly 16:9, 1280px wide or better.
  function backdrop(url, cb) {
    var img = new Image();
    img.onload = function () { cb(img.naturalWidth ? url : null); };
    img.onerror = function () { cb(null); };
    img.src = url;
  }

  global.Arcade = {
    top: top, qualifies: qualifies, submit: submit,
    boardHTML: boardHTML, howTo: howTo,
    initialsHTML: initialsHTML, wireInitials: wireInitials,
    backdrop: backdrop
  };
})(window);
