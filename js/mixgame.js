/*
 * mixgame.js - the mixing engine behind the Sound station.
 *
 * One desk, one round. People in the room react (a wave, a wince, a hand over
 * an ear) and people watching online type in the chat; each card is tagged
 * ROOM or ONLINE via `src`, points at one channel, and that channel lights up
 * gold until its fader sits in the band. `type:'feedback'` cards are the
 * RINGING drill: short patience, pull it down fast, bonus for catching it.
 *
 * History: built as the Stream Sound game, then skinned twice (House Sound and
 * Stream Sound), then merged into one Sound station on 12 Sept 2026 after the
 * team play-test found two identical games redundant.
 *
 * The page supplies a CONFIG (channels, complaints, copy) and the markup with
 * the ids listed below. The engine does everything else.
 *
 *   MixGame.init({
 *     gameId, channels:[{id,name}], complaints:[{ch,who,text,lo,hi,start,
 *     patience?, type?, bonus?}], copy:{ readyGoal, howToSteps, howToControls,
 *     good, bad, listening, waiting, grades:{A,B,C,D}, pitch }
 *   })
 *
 * Required element ids: menu game results panels startBtn againBtn timeLeft
 * score fixed nowFixing msgs strips verdict grade resultLine breakdown hiscore pitch
 *
 * BOOTH NOTES: no server, no network. Auto-returns to the menu after 45s idle.
 */
(function (global) {
  'use strict';

  function init(cfg) {
    // Defensive per-function shim: a missing or stale arcade.js must never take
    // the game down with it. The board and how-to just quietly disappear.
    var Arcade = global.Arcade || {};
    ['howTo', 'boardHTML', 'initialsHTML'].forEach(function (k) {
      if (typeof Arcade[k] !== 'function') Arcade[k] = function () { return ''; };
    });
    if (typeof Arcade.qualifies !== 'function') Arcade.qualifies = function () { return false; };
    if (typeof Arcade.submit !== 'function') Arcade.submit = function () {};
    if (typeof Arcade.wireInitials !== 'function') Arcade.wireInitials = function () {};
    if (typeof Arcade.ready !== 'function') Arcade.ready = function (h, g, cb) { cb(); };

    var GAME_ID    = cfg.gameId;
    var CHANNELS   = cfg.channels;
    var COMPLAINTS = cfg.complaints;
    var COPY       = cfg.copy;

    var ROUND_SECONDS = cfg.roundSeconds || 90;
    var HOLD_MS       = cfg.holdMs || 500;      // time inside the zone before it counts as fixed
    var COMPLAINT_MS  = cfg.patienceMs || 15000; // before the person gives up on you

    var st = null, raf = null, idle = null;

    function $(id) { return document.getElementById(id); }
    function show(id) {
      ['menu', 'game', 'results'].forEach(function (s) {
        $(s).classList.toggle('active', s === id);
      });
    }
    function armIdle() {
      clearTimeout(idle);
      idle = setTimeout(function () {
        if (!$('game').classList.contains('active')) show('menu');
      }, 45000);
    }
    ['pointerdown', 'keydown'].forEach(function (e) {
      document.addEventListener(e, armIdle, true);
    });

    // -------------------------------------------------------------- desk
    function buildStrips() {
      var wrap = $('strips');
      wrap.innerHTML = '';
      CHANNELS.forEach(function (c) {
        var d = document.createElement('div');
        d.className = 'strip';
        d.id = 'strip-' + c.id;
        d.innerHTML =
          '<div class="nm">' + c.name + '</div>' +
          '<div class="meter"><div class="zone" id="zone-' + c.id + '"></div>' +
          '<div class="fill" id="fill-' + c.id + '"></div></div>' +
          '<input class="fader" type="range" min="0" max="100" value="70" id="fader-' + c.id + '">' +
          '<div class="db" id="db-' + c.id + '">-6.0</div>';
        wrap.appendChild(d);
        d.querySelector('input').addEventListener('input', function (e) {
          setLevel(c.id, parseInt(e.target.value, 10));
        });
      });
    }

    function setLevel(id, val) {
      st.levels[id] = val;
      $('fill-' + id).style.height = val + '%';
      // Rough dB readout so the numbers feel like a real desk.
      var db = (val === 0) ? '-inf' : ((val - 75) / 75 * 60).toFixed(1);
      $('db-' + id).textContent = db;
    }

    function paintAll() {
      CHANNELS.forEach(function (c) {
        $('fader-' + c.id).value = st.levels[c.id];
        setLevel(c.id, st.levels[c.id]);
      });
    }

    function flash(text, colour) {
      var v = $('verdict');
      v.textContent = text;
      v.style.background = colour;
      v.classList.add('show');
      clearTimeout(st.vTimer);
      st.vTimer = setTimeout(function () { v.classList.remove('show'); }, 1400);
    }

    function chName(id) {
      for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].id === id) return CHANNELS[i].name;
      return id;
    }

    // -------------------------------------------------------------- complaints
    function newComplaint() {
      var pool = COMPLAINTS.filter(function (c) { return c.text !== st.lastText; });
      var c = pool[Math.floor(Math.random() * pool.length)];
      st.lastText = c.text;
      st.active = c;
      st.holdFor = 0;
      st.complaintElapsed = 0;
      st.patience = c.patience || COMPLAINT_MS;

      // Knock that channel out of place so there is something to fix.
      st.levels[c.ch] = c.start;
      paintAll();

      CHANNELS.forEach(function (ch) {
        $('strip-' + ch.id).classList.remove('wanted', 'solved', 'ringing');
      });
      var strip = $('strip-' + c.ch);
      strip.classList.add('wanted');
      if (c.type === 'feedback') strip.classList.add('ringing');
      var z = $('zone-' + c.ch);
      z.style.bottom = c.lo + '%';
      z.style.height = (c.hi - c.lo) + '%';

      $('nowFixing').textContent = (c.type === 'feedback' ? 'RINGING: ' : 'Fix: ') + chName(c.ch);

      var m = document.createElement('div');
      m.className = 'msg active' + (c.type === 'feedback' ? ' ringing' : '') + (c.src ? ' src-' + c.src : '');
      var tag = c.src ? '<span class="tag">' + (c.type === 'feedback' ? 'RINGING' : c.src.toUpperCase()) + '</span>' : '';
      m.innerHTML = '<div class="u">' + tag + c.who + '</div>' + c.text;
      $('msgs').insertBefore(m, $('msgs').firstChild);
      while ($('msgs').children.length > 5) $('msgs').removeChild($('msgs').lastChild);
    }

    function resolve(good) {
      var c = st.active;
      st.active = null;
      var strip = $('strip-' + c.ch);
      strip.classList.remove('wanted', 'ringing');

      if (good) {
        st.fixed++;
        var speed = Math.max(0, 1 - st.complaintElapsed / st.patience);
        st.score += 80 + Math.round(70 * speed) + (c.bonus || 0);
        strip.classList.add('solved');
        $('fixed').textContent = st.fixed;
        $('score').textContent = st.score;
        flash(c.type === 'feedback' ? (COPY.caught || COPY.good) : COPY.good, 'var(--green)');
      } else {
        st.dropped++;
        flash(c.type === 'feedback' ? (COPY.howled || COPY.bad) : COPY.bad, 'var(--red)');
      }

      $('nowFixing').textContent = COPY.listening;
      setTimeout(function () {
        if (st && st.running) newComplaint();
      }, 1100);
    }

    // -------------------------------------------------------------- loop
    function tick(now) {
      if (!st || !st.running) return;

      // Real elapsed time, capped, never a hardcoded frame length. Assuming
      // 60fps breaks on a 144Hz screen and on a throttled tab. The cap means a
      // stall cannot bank a free fix, and the patience timer runs on the SAME
      // capped delta so a stall cannot run the player out of patience either.
      var dt = Math.min(100, now - st.lastFrame);
      st.lastFrame = now;

      if (st.active) {
        var c = st.active;
        var v = st.levels[c.ch];
        if (v >= c.lo && v <= c.hi) {
          st.holdFor += dt;
          if (st.holdFor >= HOLD_MS) resolve(true);
        } else {
          st.holdFor = 0;
        }
        st.complaintElapsed += dt;
        if (st.active && st.complaintElapsed > st.patience) resolve(false);
      }

      var left = ROUND_SECONDS - (now - st.roundStart) / 1000;
      if (left <= 0) { finish(); return; }
      $('timeLeft').textContent = Math.ceil(left);

      raf = requestAnimationFrame(tick);
    }

    // -------------------------------------------------------------- start/end
    function start() {
      st = {
        running: true, score: 0, fixed: 0, dropped: 0,
        levels: {}, active: null, lastText: null, holdFor: 0,
        roundStart: performance.now(), lastFrame: performance.now(),
        complaintElapsed: 0, patience: COMPLAINT_MS, vTimer: null
      };
      CHANNELS.forEach(function (c) { st.levels[c.id] = 70; });

      $('score').textContent = '0';
      $('fixed').textContent = '0';
      $('timeLeft').textContent = ROUND_SECONDS;
      $('nowFixing').textContent = COPY.waiting;
      $('msgs').innerHTML = '';
      buildStrips();
      paintAll();
      show('game');
      Arcade.ready($('game'), COPY.readyGoal, function () {
        st.roundStart = performance.now();
        st.lastFrame = performance.now();
        newComplaint();
        raf = requestAnimationFrame(tick);
      });
    }

    function finish() {
      st.running = false;
      cancelAnimationFrame(raf);

      var total = st.fixed + st.dropped;
      var rate = st.fixed / Math.max(1, total);

      var g;
      if (rate > 0.8 && st.fixed >= 4) g = { grade: 'A', colour: 'var(--green)',  line: COPY.grades.A };
      else if (rate > 0.6)             g = { grade: 'B', colour: 'var(--accent)', line: COPY.grades.B };
      else if (rate > 0.35)            g = { grade: 'C', colour: 'var(--gold)',   line: COPY.grades.C };
      else                             g = { grade: 'D', colour: 'var(--red)',    line: COPY.grades.D };

      $('grade').textContent = g.grade;
      $('grade').style.color = g.colour;
      $('resultLine').textContent = g.line;

      $('breakdown').innerHTML =
        row(COPY.fixedLabel || 'Complaints fixed', st.fixed) +
        row(COPY.droppedLabel || 'Gave up on you', st.dropped) +
        row('Score', st.score);

      $('pitch').innerHTML = COPY.pitch;

      var hs = $('hiscore');
      if (Arcade.qualifies(GAME_ID, st.score)) {
        hs.innerHTML = Arcade.initialsHTML();
        Arcade.wireInitials(hs, function (initials) {
          Arcade.submit(GAME_ID, initials, st.score);
          hs.innerHTML = Arcade.boardHTML(GAME_ID, 'HIGH SCORES');
          paintPanels();
        });
      } else {
        hs.innerHTML = Arcade.boardHTML(GAME_ID, 'HIGH SCORES');
      }

      show('results');
      if (Arcade.flowResults) Arcade.flowResults($('results'), GAME_ID);
      armIdle();
    }

    function row(l, v) { return '<div><span>' + l + '</span><b>' + v + '</b></div>'; }

    function paintPanels() {
      $('panels').innerHTML =
        Arcade.howTo({
          title: 'HOW TO PLAY',
          steps: COPY.howToSteps,
          controls: COPY.howToControls
        }) +
        Arcade.boardHTML(GAME_ID, 'HIGH SCORES');
    }

    $('startBtn').addEventListener('click', start);
    $('againBtn').addEventListener('click', function () { paintPanels(); show('menu'); });

    paintPanels();
    armIdle();

    return { start: start, finish: finish, state: function () { return st; } };
  }

  global.MixGame = { init: init };
})(window);
