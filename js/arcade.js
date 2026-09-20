/*
 * arcade.js - shared booth furniture for every Media Team training game.
 *
 * Gives each game three things it needs at a ministry fair:
 *   1. A HOW TO PLAY card. Three steps, plain language, no jargon. Shown BEFORE
 *      play, because nobody at a booth reads instructions after they have lost.
 *   2. An arcade high-score board with three-letter initials, stored per game.
 *   3. PRIZE ROUNDS. The team hands a $25 gift card to the top Camera score
 *      every hour (60 minutes by default; everyone who signs up gets a gift box,
 *      which is a different thing). Rounds are cut on the wall clock, so every
 *      device in the booth is on the same round with no server and no host
 *      action: 10:00-10:30, 10:30-11:00, and so on. The board shows THIS ROUND,
 *      a countdown, the LAST ROUND winner (so the host can collect it at their
 *      own pace) and the all-time best.
 *
 * Scores live in localStorage on each device. That is deliberate: no server,
 * no network, and the board resets if you clear site data. Wrapped in try/catch
 * because a locked-down browser can throw on storage access, and a dead
 * leaderboard must never take the game down with it.
 *
 * Usage:
 *   Arcade.howTo({ title, steps: [], controls: '' })  -> HTML string
 *   Arcade.boardHTML('camera')                        -> HTML string (self-updating)
 *   Arcade.qualifies('camera', 820)                   -> bool (this round OR all-time)
 *   Arcade.submit('camera', 'MAT', 820)
 *   Arcade.initialsHTML()                             -> HTML for the entry row
 *   Arcade.wireInitials(rootEl, onDone)               -> makes that row work
 *   Arcade.round()                                    -> { id, start, end, len }
 *   Arcade.roundMinutes() / Arcade.setRoundMinutes(n) -> host setting, 60 by default
 *   Arcade.lastRoundWinner('camera')                  -> { name, score } or null
 *   Arcade.clearBoards()                              -> wipes every board on this device
 *   Arcade.PRIZE_GAME                                 -> 'camera'
 */
(function (global) {
  'use strict';

  var KEY = 'nccMediaArcade';
  // 20 Sept: ONE $25 card for the whole event, not one an hour. The default round
  // is a whole day, so the board never flips mid-fair. The key was renamed so an
  // hourly setting saved on an iPad the night before is ignored. Host can still
  // pick a short round. To go back to hourly for everyone: DEFAULT_ROUND_MIN = 60.
  var ROUND_KEY = 'nccMediaArcadeRoundMin2';
  var KEEP = 5;
  var PRIZE_GAME = 'camera';
  var DEFAULT_ROUND_MIN = 1440;
  var MAX_ROUND_MIN = 1440;
  var VERSION = '20 Sept b';

  // ---------------------------------------------------------------- storage
  // v2 shape: { __v:2, all:{ gameId:[entries] }, rounds:{ gameId:{ roundId:[entries] } } }
  // v1 was the flat { gameId:[entries] } map; it is migrated on first read so
  // nobody loses a score they already entered.
  function migrate(obj) {
    if (obj && obj.__v === 2) {
      obj.all = obj.all || {};
      obj.rounds = obj.rounds || {};
      return obj;
    }
    var all = {};
    Object.keys(obj || {}).forEach(function (k) {
      if (Array.isArray(obj[k])) all[k] = obj[k];
    });
    return { __v: 2, all: all, rounds: {} };
  }

  function readAll() {
    var obj = {};
    try {
      var raw = localStorage.getItem(KEY);
      obj = raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) { obj = {}; }
    return migrate(obj);
  }

  function writeAll(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }

  function sortTop(list, n) {
    list = (list || []).slice();
    list.sort(function (a, b) { return b.score - a.score; });
    return list.slice(0, n || KEEP);
  }

  // ---------------------------------------------------------------- rounds
  function roundMinutes() {
    try {
      var n = parseInt(localStorage.getItem(ROUND_KEY), 10);
      if (n >= 5 && n <= MAX_ROUND_MIN) return n;
    } catch (e) { /* ignore */ }
    return DEFAULT_ROUND_MIN;
  }

  function setRoundMinutes(n) {
    n = parseInt(n, 10);
    if (!(n >= 5 && n <= MAX_ROUND_MIN)) return;
    try { localStorage.setItem(ROUND_KEY, String(n)); } catch (e) { /* ignore */ }
    refreshBoards(true);
  }

  // Rounds are aligned to the clock: round id = how many whole rounds have
  // passed since midnight UTC. Every device agrees without talking.
  function roundInfo() {
    var len = roundMinutes() * 60000;
    var now = Date.now();
    var id = Math.floor(now / len);
    return { id: id, start: id * len, end: (id + 1) * len, len: len, now: now };
  }

  function top(gameId, n) {
    return sortTop(readAll().all[gameId], n);
  }

  function topRound(gameId, n, roundId) {
    var d = readAll();
    var rid = String(roundId == null ? roundInfo().id : roundId);
    return sortTop((d.rounds[gameId] || {})[rid], n);
  }

  function fits(list, score) {
    if (list.length < KEEP) return true;
    return score > list[list.length - 1].score;
  }

  function qualifies(gameId, score) {
    if (!score || score <= 0) return false;
    return fits(top(gameId, KEEP), score) || fits(topRound(gameId, KEEP), score);
  }

  function submit(gameId, name, score) {
    var d = readAll();
    var e = {
      name: String(name || '???').toUpperCase().slice(0, 3),
      score: Math.round(score) || 0,
      t: Date.now()
    };
    d.all[gameId] = sortTop((d.all[gameId] || []).concat([e]), KEEP);

    var ri = roundInfo();
    var rg = d.rounds[gameId] || {};
    var cur = String(ri.id);
    rg[cur] = sortTop((rg[cur] || []).concat([e]), KEEP);
    // Keep only this round and the previous one. The previous one is what the
    // host reads when they come round with the prize box.
    Object.keys(rg).forEach(function (k) { if (Number(k) < ri.id - 1) delete rg[k]; });
    d.rounds[gameId] = rg;
    writeAll(d);
  }

  function lastRoundWinner(gameId) {
    var ri = roundInfo();
    return topRound(gameId, 1, ri.id - 1)[0] || null;
  }

  function clearBoards() {
    writeAll({ __v: 2, all: {}, rounds: {} });
    refreshBoards(true);
  }

  // ---------------------------------------------------------------- markup
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmtClock(ms) {
    var d = new Date(ms);
    var h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }

  function fmtLeft(ms) {
    ms = Math.max(0, ms);
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function boardHTML(gameId, heading) {
    var ri = roundInfo();
    var list = topRound(gameId, KEEP);
    var rows = '';
    for (var i = 0; i < KEEP; i++) {
      var e = list[i];
      rows += '<div class="arc-row' + (e ? '' : ' arc-empty') + '">' +
                '<span class="arc-rank">' + (i + 1) + '</span>' +
                '<span class="arc-name">' + (e ? esc(e.name) : '---') + '</span>' +
                '<span class="arc-score">' + (e ? e.score : '&mdash;') + '</span>' +
              '</div>';
    }
    var all = top(gameId, 1)[0];
    var last = lastRoundWinner(gameId);
    // A round of half a day or more is "the whole event": no clock, no LAST ROUND.
    var dayLong = ri.len >= 12 * 3600000;
    var prize = (gameId === PRIZE_GAME)
      ? '<div class="arc-prize">&#127942; PRIZE GAME &middot; TOP SCORE ' + (dayLong ? 'TODAY' : 'THIS ROUND') + ' WINS A $25 GIFT CARD</div>'
      : '';
    var title = dayLong
      ? 'TODAY&#39;S TOP SCORES'
      : 'THIS ROUND &middot; ENDS ' + fmtClock(ri.end) +
        ' &middot; <span class="arc-cd" data-end="' + ri.end + '">' + fmtLeft(ri.end - ri.now) + '</span> LEFT';
    var foot = (dayLong ? '' :
               'LAST ROUND: ' + (last ? '<b>' + esc(last.name) + ' ' + last.score + '</b>' : 'nobody yet') + ' &middot; ') +
               'ALL-TIME: ' + (all ? '<b>' + esc(all.name) + ' ' + all.score + '</b>' : '&mdash;');
    return '<div class="arc-board" data-game="' + esc(gameId) + '" data-round="' + ri.id + '"' +
             ' data-heading="' + esc(heading || '') + '">' +
             '<div class="arc-title">' + title + '</div>' +
             prize + rows +
             '<div class="arc-foot">' + foot + '</div>' +
           '</div>';
  }

  // Keeps every board on the page honest: ticks the countdown each second and
  // re-renders a board the moment its round rolls over.
  function refreshBoards(force) {
    var ri = roundInfo();
    var boards = document.querySelectorAll('.arc-board[data-game]');
    for (var i = 0; i < boards.length; i++) {
      var b = boards[i];
      if (force || Number(b.getAttribute('data-round')) !== ri.id) {
        var tmp = document.createElement('div');
        tmp.innerHTML = boardHTML(b.getAttribute('data-game'), b.getAttribute('data-heading'));
        if (b.parentNode) b.parentNode.replaceChild(tmp.firstChild, b);
      } else {
        var cd = b.querySelector('.arc-cd');
        if (cd) cd.textContent = fmtLeft(Number(cd.getAttribute('data-end')) - Date.now());
      }
    }
  }
  setInterval(function () { refreshBoards(false); }, 1000);

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
      '.arc-cd{color:var(--gold,#d29922);font-variant-numeric:tabular-nums}',
      '.arc-prize{font-size:11px;letter-spacing:1.5px;font-weight:800;color:var(--gold,#d29922);',
      'text-align:center;margin:-4px 0 10px}',
      '.arc-row{display:flex;align-items:center;gap:12px;padding:5px 0;font-variant-numeric:tabular-nums;',
      'border-bottom:1px solid rgba(255,255,255,.05)}',
      '.arc-row:last-child{border-bottom:none}',
      '.arc-rank{width:20px;color:var(--text-dim,#8b949e);font-size:13px;font-weight:700}',
      '.arc-name{flex:1;font-weight:800;letter-spacing:3px;font-size:17px}',
      '.arc-score{font-weight:800;font-size:17px;color:var(--gold,#d29922)}',
      '.arc-empty{opacity:.35}',
      '.arc-foot{margin-top:10px;padding-top:9px;border-top:1px solid var(--border,#30363d);font-size:11px;',
      'letter-spacing:1px;color:var(--text-dim,#8b949e);text-align:center;line-height:1.6}',
      '.arc-foot b{color:var(--text,#e6edf3);letter-spacing:1.5px}',
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
      'cursor:pointer;background:var(--gold,#d29922);color:#1a1200;border:none;border-radius:8px}',
      '.arc-ready{position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;',
      'background:rgba(13,17,23,.80);cursor:pointer;padding:22px;touch-action:manipulation}',
      '.arc-ready-box{max-width:520px;text-align:center;background:var(--panel,#161b22);border:1px solid var(--border,#30363d);',
      'border-radius:14px;padding:26px 28px;box-shadow:0 20px 60px rgba(0,0,0,.6)}',
      '.arc-ready-goal{font-size:clamp(17px,2.4vw,23px);line-height:1.45;margin:6px 0 20px}',
      '.arc-ready-goal b{color:var(--gold,#d29922)}',
      '.arc-ready-tap{font-size:14px;letter-spacing:2.5px;font-weight:900;color:#04121f;background:var(--accent,#58a6ff);',
      'padding:14px 22px;border-radius:999px;display:inline-block;animation:arcPulse 1.6s ease-in-out infinite}',
      '@keyframes arcPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}',
      '#arc-fs{position:fixed;left:10px;bottom:10px;z-index:60;font:700 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      'letter-spacing:.5px;padding:9px 12px;border-radius:999px;border:1px solid var(--border,#30363d);',
      'background:rgba(22,27,34,.85);color:var(--text-dim,#8b949e);cursor:pointer;opacity:.75}',
      '#arc-fs:hover{opacity:1;color:var(--text,#e6edf3)}',
      '.arc-flow{position:sticky;bottom:0;margin-top:auto;width:100%;box-sizing:border-box;padding:12px 14px 10px;',
      'background:rgba(13,17,23,.94);border-top:1px solid var(--border,#30363d);z-index:40;flex:none}',
      '.arc-flow-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}',
      '.arc-flow-btn{flex:1 1 240px;max-width:420px;display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'gap:3px;min-height:64px;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:900;font-size:18px;',
      'letter-spacing:1.5px;font-family:inherit;text-align:center}',
      '.arc-flow-btn small{font-weight:600;font-size:12px;letter-spacing:.3px;opacity:.85}',
      '.arc-flow-signup{background:var(--gold,#d29922);color:#1a1200}',
      '.arc-flow-hub{background:var(--accent,#58a6ff);color:#04121f}',
      '.arc-flow-cd{margin-top:9px;text-align:center;font-size:13px;color:var(--text-dim,#8b949e);letter-spacing:.5px}',
      '.arc-flow-cd b{color:var(--gold,#d29922);font-variant-numeric:tabular-nums}',
      '.arc-flow-capmsg{text-align:center;font-size:15px;letter-spacing:.5px;margin-bottom:9px;color:var(--text,#e6edf3)}',
      '.arc-flow-capmsg b{color:var(--gold,#d29922)}',
      '.arc-capped #againBtn{display:none!important}',
      // the iPad status bar (clock, battery) sits on top of the page in home-screen mode; keep the top bar clear of it
      // tighter padding so the bar with the big button is the same 57px the pages were built around
      '.arc-has-exit .topbar{border-top:env(safe-area-inset-top,0px) solid transparent;padding-top:6px;padding-bottom:6px}',
      // A centred screen that is taller than the iPad cuts its own top off, out of reach of scrolling.
      // Auto margins centre it the same way but let the top stay reachable.
      '.arc-has-exit #attract.screen.active,.arc-has-exit #menu.screen.active,.arc-has-exit #results.screen.active{justify-content:flex-start}',
      '.arc-has-exit #attract.screen.active>:first-child,.arc-has-exit #menu.screen.active>:first-child,.arc-has-exit #results.screen.active>:first-child{margin-top:auto}',
      '.arc-has-exit #attract.screen.active>:last-child:not(.arc-flow),.arc-has-exit #menu.screen.active>:last-child:not(.arc-flow),.arc-has-exit #results.screen.active>:last-child:not(.arc-flow){margin-bottom:auto}',
      '#arc-exit{font:900 15px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:1.2px;cursor:pointer;',
      'min-height:44px;padding:0 18px;border-radius:10px;border:2px solid #f85149;background:rgba(248,81,73,.14);',
      'color:#fff;white-space:nowrap;touch-action:manipulation}',
      '#arc-exit:active{background:rgba(248,81,73,.4)}',
      '#arc-leave{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,.74);padding:20px;touch-action:manipulation}',
      '.arc-leave-box{width:100%;max-width:440px;text-align:center;background:var(--panel,#161b22);',
      'border:1px solid var(--border,#30363d);border-radius:16px;padding:26px 24px;box-shadow:0 20px 60px rgba(0,0,0,.6)}',
      '.arc-leave-box h3{font-size:26px;margin:0 0 6px;color:var(--text,#e6edf3)}',
      '.arc-leave-box p{font-size:15px;margin:0 0 20px;color:var(--text-dim,#8b949e)}',
      '.arc-leave-btns{display:flex;gap:12px}',
      '.arc-leave-btns button{flex:1;min-height:60px;border-radius:12px;border:none;cursor:pointer;',
      'font:900 16px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:1px}',
      '.arc-leave-stay{background:var(--accent,#58a6ff);color:#04121f}',
      '.arc-leave-go{background:#f85149;color:#fff}'
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

  // ---------------------------------------------------------------- get ready
  // A pause on the REAL game screen before the clock starts. The menu how-to is
  // abstract; this shows the actual desk, frozen, with one sentence of goal, and
  // waits for a tap. Direct response to "the round was over before I understood
  // what I was doing". The whole screen is the button, so it cannot be missed.
  function ready(host, goal, onStart) {
    if (!host) { onStart(); return; }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var ov = document.createElement('div');
    ov.className = 'arc-ready';
    ov.innerHTML =
      '<div class="arc-ready-box">' +
        '<div class="arc-title">GET READY</div>' +
        '<div class="arc-ready-goal">' + goal + '</div>' +
        '<div class="arc-ready-tap">TAP ANYWHERE TO START</div>' +
      '</div>';
    host.appendChild(ov);
    var done = false;
    function go(e) {
      if (done) return;
      done = true;
      if (e && e.preventDefault) e.preventDefault();
      document.removeEventListener('keydown', go);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      onStart();
    }
    ov.addEventListener('pointerdown', go);
    document.addEventListener('keydown', go);
  }

  // ---------------------------------------------------------------- full screen
  // iPads: Safari shows its address bar unless the page is either added to the
  // home screen (best) or put into full screen with a tap. Fullscreen only lasts
  // until the next page, so the button lives on every page that loads this file.
  // Hidden when running from a home-screen icon, or when the browser cannot.
  function fullscreenButton() {
    if (document.getElementById('arc-fs')) return;
    var standalone = false;
    try {
      standalone = (window.navigator.standalone === true) ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) { /* ignore */ }
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (standalone || !req) return;
    var b = document.createElement('button');
    b.id = 'arc-fs';
    b.type = 'button';
    b.title = 'Full screen';
    b.innerHTML = '&#x26F6; Full screen';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      try { req.call(el); } catch (err) { /* ignore */ }
    });
    function sync() {
      var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      b.style.display = on ? 'none' : '';
    }
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    document.body.appendChild(b);
    sync();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fullscreenButton);
  } else { fullscreenButton(); }

  // ---------------------------------------------------------------- flow
  // What happens AFTER a game, so a station never sits on a dead results
  // screen. A bar on the results screen: SIGN UP (30 seconds) or PLAY ANOTHER
  // GAME, with a countdown back to the games hub. Anywhere else in a game, two
  // minutes with nobody touching sends the iPad back to the hub as well.
  //
  // ROLLBACK: the Host panel on booth.html switches it off per device
  // (localStorage nccMediaFlow=off), or set FLOW.enabled=false here for all.
  // The results countdown is shorter than each game's own 45 s idle-to-menu,
  // so the hub wins. ?flowsec=N on a game URL shortens the countdown for tests.
  var FLOW = { enabled: true, resultsSec: 40, idleSec: 120, hub: 'booth.html', signup: 'signup.html?back=1' };
  var FLOW_KEY = 'nccMediaFlow';
  function flowEnabled() {
    if (!FLOW.enabled) return false;
    try { return localStorage.getItem(FLOW_KEY) !== 'off'; } catch (e) { return true; }
  }
  function setFlowEnabled(on) {
    try { localStorage.setItem(FLOW_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  }
  function flowSeconds() {
    try {
      var n = parseInt(new URLSearchParams(location.search).get('flowsec'), 10);
      if (n >= 3 && n <= 600) return n;
    } catch (e) { /* ignore */ }
    return FLOW.resultsSec;
  }
  // ---- game maximum (20 Sept). After CAP games in a row the results bar offers
  // only SIGN UP and then goes to the sign-up page by itself. The iPad cannot
  // tell people apart, so "in a row" means: no gap longer than CAP_GAP_MS since
  // the last game ended. The count also clears when someone signs up or when the
  // results screen times out back to the hub.
  // ROLLBACK: Host panel > Game maximum > OFF (localStorage nccMediaGameCap=off),
  // or CAP_DEFAULT = 0 here for everyone. Any error in here falls back to the
  // normal two buttons.
  var CAP_KEY = 'nccMediaGameCap', CAP_STATE_KEY = 'nccMediaCapState';
  var CAP_DEFAULT = 2, CAP_GAP_MS = 180000, CAP_SEC = 20;
  function gameCap() {
    try {
      var v = localStorage.getItem(CAP_KEY);
      if (v === 'off') return 0;
      if (v === '2' || v === '3') return Number(v);
    } catch (e) { /* ignore */ }
    return CAP_DEFAULT;
  }
  function setGameCap(v) {
    v = String(v);
    if (v !== 'off' && v !== '2' && v !== '3') return;
    try { localStorage.setItem(CAP_KEY, v); localStorage.removeItem(CAP_STATE_KEY); } catch (e) { /* ignore */ }
  }
  function capCount() {
    try {
      var s = JSON.parse(localStorage.getItem(CAP_STATE_KEY) || 'null');
      if (s && s.n > 0 && (Date.now() - s.t) < CAP_GAP_MS) return s.n;
    } catch (e) { /* ignore */ }
    return 0;
  }
  function capReset() {
    try { localStorage.removeItem(CAP_STATE_KEY); } catch (e) { /* ignore */ }
  }
  var capLastBump = 0, capLastN = 0;
  function capBump() {
    // a game that re-draws its results screen must not count twice
    if (Date.now() - capLastBump < 8000) return capLastN;
    var n = capCount() + 1;
    try { localStorage.setItem(CAP_STATE_KEY, JSON.stringify({ n: n, t: Date.now() })); } catch (e) { /* ignore */ }
    capLastBump = Date.now(); capLastN = n;
    return n;
  }

  var flowTimer = null, flowLeft = 0;
  var FLOW_EVENTS = ['pointerdown', 'keydown', 'touchstart'];
  function flowResults(root, gameId) {
    if (!root || !flowEnabled()) return;
    var old = root.querySelector('.arc-flow');
    if (old) old.parentNode.removeChild(old);
    clearInterval(flowTimer);
    var cap = 0, played = 0, capped = false;
    try { cap = gameCap(); if (cap > 0) { played = capBump(); capped = played >= cap; } } catch (e) { capped = false; }
    var secs = capped ? Math.min(CAP_SEC, flowSeconds()) : flowSeconds();
    var dest = capped ? FLOW.signup : FLOW.hub;
    var bar = document.createElement('div');
    bar.className = 'arc-flow';
    bar.innerHTML = capped
      ? '<div class="arc-flow-capmsg">That was game ' + played + ' of ' + cap + '. <b>Next stop: sign up and grab your gift box.</b></div>' +
        '<div class="arc-flow-btns">' +
          '<a class="arc-flow-btn arc-flow-signup" href="' + FLOW.signup + '">SIGN UP NOW<small>30 seconds. Gift box at the exit table.</small></a>' +
        '</div>' +
        '<div class="arc-flow-cd">Going to the sign-up in <b>' + secs + '</b> s.</div>'
      : '<div class="arc-flow-btns">' +
          '<a class="arc-flow-btn arc-flow-signup" href="' + FLOW.signup + '">SIGN UP<small>30 seconds. Gift box at the exit.</small></a>' +
          '<a class="arc-flow-btn arc-flow-hub" href="' + FLOW.hub + '">PLAY ANOTHER GAME<small>Sound, Camera, ProPresenter, Lower Thirds</small></a>' +
        '</div>' +
        '<div class="arc-flow-cd">Back to the games in <b>' + secs + '</b> s. Tap anything to stay.</div>';
    root.appendChild(bar);
    if (capped) root.classList.add('arc-capped');
    var su = bar.querySelector('.arc-flow-signup');
    if (su) su.addEventListener('click', capReset);   // signing up ends this visitor's run
    flowLeft = secs;
    var b = bar.querySelector('.arc-flow-cd b');
    function bump() { flowLeft = secs; if (b) b.textContent = flowLeft; }
    FLOW_EVENTS.forEach(function (e) { document.addEventListener(e, bump, true); });
    function stop() {
      clearInterval(flowTimer);
      FLOW_EVENTS.forEach(function (e) { document.removeEventListener(e, bump, true); });
      root.classList.remove('arc-capped');
    }
    flowTimer = setInterval(function () {
      if (!root.classList.contains('active')) {   // Run It Again, or the game moved on
        stop();
        if (bar.parentNode) bar.parentNode.removeChild(bar);
        return;
      }
      flowLeft--;
      if (b) b.textContent = Math.max(0, flowLeft);
      if (flowLeft <= 0) { stop(); capReset(); location.href = dest; }   // timed out: whoever was here has gone
    }, 1000);
  }

  // ---- EXIT GAME (20 Sept). The small "Booth" link in the top bar was easy to
  // miss and, from a home-screen icon, partly under the iPad's clock strip. This
  // swaps the top-bar links for one big button. Mid-round it asks first.
  // ROLLBACK: Host panel > Exit button > OFF (localStorage nccMediaExitBtn=off).
  var EXIT_KEY = 'nccMediaExitBtn';
  function exitEnabled() {
    try { return localStorage.getItem(EXIT_KEY) !== 'off'; } catch (e) { return true; }
  }
  function setExitEnabled(on) {
    try { localStorage.setItem(EXIT_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  }
  function askLeave(onLeave) {
    if (document.getElementById('arc-leave')) return;
    var ov = document.createElement('div');
    ov.id = 'arc-leave';
    ov.innerHTML =
      '<div class="arc-leave-box">' +
        '<h3>Leave this game?</h3><p>This round will not count.</p>' +
        '<div class="arc-leave-btns">' +
          '<button type="button" class="arc-leave-stay">KEEP PLAYING</button>' +
          '<button type="button" class="arc-leave-go">LEAVE</button>' +
        '</div>' +
      '</div>';
    var t = null;
    function close() { clearTimeout(t); if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('.arc-leave-stay').addEventListener('click', function (e) { e.stopPropagation(); close(); });
    ov.querySelector('.arc-leave-go').addEventListener('click', function (e) { e.stopPropagation(); close(); onLeave(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    t = setTimeout(close, 8000);   // nobody answered: keep playing
    document.body.appendChild(ov);
  }
  function exitButton() {
    try {
      if (!exitEnabled() || document.getElementById('arc-exit')) return;
      var game = document.getElementById('game'), tb = document.querySelector('.topbar');
      if (!game || !document.getElementById('results') || !tb) return;
      injectCSS();   // the button must be styled before the top bar is measured
      var b = document.createElement('button');
      b.id = 'arc-exit'; b.type = 'button';
      b.innerHTML = '&#10005; EXIT GAME';
      var nav = tb.querySelector('.nav');
      if (nav) {
        var kids = nav.children;
        for (var i = 0; i < kids.length; i++) kids[i].style.display = 'none';
        nav.appendChild(b);
      } else { tb.appendChild(b); }
      document.documentElement.classList.add('arc-has-exit');
      function leave() { location.href = FLOW.hub; }
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (game.classList.contains('active')) askLeave(leave); else leave();
      });
      // The pages size their screens as "100dvh minus a 57px top bar". The bar is
      // taller now (bigger button, plus the iPad status-bar strip), so measure it.
      var fit = document.createElement('style');
      fit.id = 'arc-fit';
      document.head.appendChild(fit);
      function fitScreens() {
        var h = Math.ceil(tb.getBoundingClientRect().height);
        if (h > 0) fit.textContent = '.screen{height:calc(100vh - ' + h + 'px)!important;height:calc(100dvh - ' + h + 'px)!important}';
      }
      fitScreens();
      window.addEventListener('resize', fitScreens);
      window.addEventListener('orientationchange', function () { setTimeout(fitScreens, 300); });
      window.addEventListener('load', fitScreens);
      setTimeout(fitScreens, 600);
    } catch (e) { /* the old top-bar links stay; nothing else depends on this */ }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', exitButton);
  }
  if (document.querySelector && document.querySelector('.topbar')) exitButton();
  // Nobody touching a game for idleSec -> hub. Never in the middle of a round.
  var flowIdleT = null;
  function flowIdle() {
    if (!flowEnabled()) return;
    function arm() {
      clearTimeout(flowIdleT);
      flowIdleT = setTimeout(function () {
        var g = document.getElementById('game');
        if (g && g.classList.contains('active')) { arm(); return; }
        location.href = FLOW.hub;
      }, FLOW.idleSec * 1000);
    }
    FLOW_EVENTS.forEach(function (e) { document.addEventListener(e, arm, true); });
    arm();
  }
  // Every game page has #game and #results; the hub and the sign-up page do not.
  function flowAuto() {
    if (document.getElementById('game') && document.getElementById('results')) flowIdle();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', flowAuto);
  } else { flowAuto(); }

  global.Arcade = {
    fullscreenButton: fullscreenButton,
    flowResults: flowResults, flowIdle: flowIdle, flowEnabled: flowEnabled, setFlowEnabled: setFlowEnabled, FLOW: FLOW,
    gameCap: gameCap, setGameCap: setGameCap, capCount: capCount, capReset: capReset,
    exitEnabled: exitEnabled, setExitEnabled: setExitEnabled, VERSION: VERSION,
    top: top, topRound: topRound, qualifies: qualifies, submit: submit,
    boardHTML: boardHTML, howTo: howTo,
    initialsHTML: initialsHTML, wireInitials: wireInitials,
    backdrop: backdrop, ready: ready,
    round: roundInfo, roundMinutes: roundMinutes, setRoundMinutes: setRoundMinutes,
    lastRoundWinner: lastRoundWinner, clearBoards: clearBoards, refreshBoards: refreshBoards,
    PRIZE_GAME: PRIZE_GAME
  };
})(window);
