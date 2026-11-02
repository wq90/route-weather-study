// The route weather study, participant side: consent, one background question, five view blocks (key, practice, six
// timed questions), a ranking of the views, and the data sent to the study's Google Apps Script after every block and
// at the end. Progress is kept in this browser (localStorage), so a reload continues where the participant was.
(function () {
  "use strict";
  var C = window.STUDY_CONFIG;
  var STORE = "rws_state_v1", QUEUE = "rws_queue_v1";
  var VIEWS = ["strap", "weather", "strokes", "symbols", "rose"];
  var LETTERS = ["A", "B", "C", "D", "E"];
  var params = new URLSearchParams(location.search);
  var TEST = !C.scriptUrl || params.has("test");
  var PILOT = params.has("pilot");

  // Williams design for five views: each view appears in each block position, and right after each other view,
  // equally often across the ten orders
  var ORDERS = (function () {
    var base = [0, 1, 4, 2, 3], rows = [];
    for (var r = 0; r < 5; r++) rows.push(base.map(function (x) { return (x + r) % 5; }));
    return rows.concat(rows.map(function (row) { return row.slice().reverse(); }));
  })();

  var ROLES = [
    ["none", "No maritime background"],
    ["student", "Nautical or maritime student"],
    ["seafarer", "Seafarer or ship's officer"],
    ["other", "Other maritime role (for example pilot, route planner, port staff)"],
  ];

  var LINE = "The line follows the route and is coloured by the current along it: red against the ship, blue with it.";
  var INTRO = {
    strap: [LINE,
      "The waves are a band on the left of the line and the wind a band on its right, as seen on the map, whichever way the ship sails; a wider band means stronger.",
      "A band's colour shows where that weather comes from, relative to the ship: red from ahead, white from the side, blue from behind."],
    weather: [LINE,
      "Beside the route, green arrows show the current, orange arrows the wind and purple arrows the waves; a longer arrow means stronger.",
      "Each arrow points where the water or air is going, with a dot at its head."],
    strokes: [LINE,
      "Beside the route, green strokes show the current, orange strokes the wind and purple strokes the waves; a longer stroke means stronger.",
      "Each stroke points where the water or air is going: its thick, round end leads."],
    symbols: [LINE,
      "Orange wind barbs show the wind: the shaft points to where the wind comes from, and the barbs add up its speed in knots.",
      "Purple arcs show the waves, bulging the way they travel and longer for higher waves; green chart arrows show where the current flows, longer for faster."],
    rose: [LINE,
      "A small rose on the route shows the current, wind and waves at that place as green, orange and purple spokes.",
      "Each spoke points where the water or air is going; its length shows strength, and the ring marks the full scale."],
  };

  var QUESTIONS = {
    dir: { text: "On the bright stretch, where do the waves come from, relative to the ship?",
           options: [["ahead", "Ahead"], ["side", "Side"], ["behind", "Behind"]] },
    eff: { text: "On the bright stretch, does the weather slow the ship down or help it along?",
           options: [["slows", "Slows it"], ["little", "Little effect"], ["helps", "Helps it"]] },
    hgt: { text: "How high are the waves at the bright spot?" },
    side: { text: "On the bright stretch, from which side of the ship do the waves come?",
            hint: "Port is the ship\u2019s left and starboard its right, facing the way the ship travels.",
            options: [["port", "Port (ship\u2019s left)"], ["starboard", "Starboard (ship\u2019s right)"]] },
  };
  var ATTENTION_TEXT = "This question checks that instructions are being read. Please choose “Side”.";
  var LABEL = { ahead: "Ahead", side: "Side", behind: "Behind", slows: "Slows it", little: "Little effect", helps: "Helps it",
                port: "Port", starboard: "Starboard" };
  var PRACTICE_WHY = {
    P1: "On this stretch the waves come from ahead of the ship.",
    P2: "Waves and wind come from ahead and the current runs against the ship, so the weather slows it down.",
    P3: "The waves at the bright spot are 1.2 m high.",
    P4: "On this stretch the waves come from behind the ship.",
    P5: "The current runs with the ship and the waves come from behind, so the weather helps it along.",
  };

  var app = document.getElementById("app");
  var manifest = null;
  var S = null; // the session state, kept in localStorage

  // --- storage, ids ---------------------------------------------------------------------------------------------------
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* the session still runs */ } }
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; } }
  function newId() {
    var a = new Uint8Array(6);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(36)).slice(-2); }).join("").slice(0, 10);
  }
  function now() { return new Date().toISOString(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function view(p) { return VIEWS[ORDERS[S.order][p]]; }

  // --- sending: a queue kept in localStorage, so nothing is lost when the network or the page drops --------------------
  function queue() { try { return JSON.parse(localStorage.getItem(QUEUE) || "[]"); } catch (e) { return []; } }
  function setQueue(q) { try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch (e) { /* kept in memory only */ } }
  var memQueue = [];
  function send(payload) {
    payload.sent_at = now();
    if (TEST) { S.testLog = (S.testLog || []).concat([payload]); save(); return Promise.resolve(true); }
    var q = queue(); q.push(payload); setQueue(q); memQueue.push(payload);
    return flush();
  }
  function post(payload) {
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 15000);
    // a plain-text body keeps this a "simple" request, which an Apps Script web app accepts from any site
    return fetch(C.scriptUrl, { method: "POST", body: JSON.stringify(payload), signal: ctrl.signal })
      .then(function (r) { return r.json(); })
      .then(function (d) { clearTimeout(timer); if (!d || !d.ok) throw new Error((d && d.error) || "not stored"); return true; });
  }
  var flushing = null;
  function flush(attempt) {
    if (flushing && !attempt) return flushing;
    attempt = attempt || 1;
    var q = queue();
    if (!q.length) q = memQueue.slice();
    if (!q.length) { flushing = null; return Promise.resolve(true); }
    flushing = post(q[0]).then(function () {
      var rest = queue().slice(1); setQueue(rest); memQueue.shift();
      return flush(1);
    }).catch(function () {
      if (attempt >= 4) { flushing = null; return false; }
      return new Promise(function (res) { setTimeout(res, [0, 1000, 3000, 7000][attempt]); }).then(function () { return flush(attempt + 1); });
    });
    return flushing;
  }
  function session() {
    return {
      pid: S.pid, group: S.group, role: S.role, pilot: PILOT, test: TEST, order: S.order, order_source: S.orderSource,
      sequence: ORDERS[S.order].map(function (i) { return VIEWS[i]; }).join(" "),
      started_at: S.startedAt, finished_at: S.finishedAt || "", blocks_done: S.blocksDone, finished: !!S.finishedAt,
      ranking: S.ranking ? JSON.stringify(S.ranking) : "", comment: S.comment || "",
      window_w: window.innerWidth, window_h: window.innerHeight, version: C.studyVersion,
    };
  }

  // --- the view order: the script hands out the next one per group, or a random one if it can't be reached -----------
  function assignOrder(group) {
    var random = function () { return { order: Math.floor(Math.random() * ORDERS.length), source: "random" }; };
    if (TEST) return Promise.resolve(random());
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 8000);
    return fetch(C.scriptUrl + "?action=assign&group=" + encodeURIComponent(group) + (PILOT ? "&pilot=1" : ""), { signal: ctrl.signal })
      .then(function (r) { return r.json(); })
      .then(function (d) { clearTimeout(timer); return typeof d.order === "number" ? { order: d.order % ORDERS.length, source: "script" } : random(); })
      .catch(function () { return random(); });
  }

  // --- the window must fit the trials ----------------------------------------------------------------------------------
  var tooSmall = document.getElementById("too-small");
  document.getElementById("min-size").textContent = C.minWidth + " × " + C.minHeight;
  var interrupted = false, hiddenSince = null, hiddenMs = 0;
  function checkSize() {
    var small = window.innerWidth < C.minWidth || window.innerHeight < C.minHeight;
    tooSmall.hidden = !small;
    if (small) interrupted = true;
  }
  window.addEventListener("resize", checkSize);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) hiddenSince = performance.now();
    else if (hiddenSince != null) { hiddenMs += performance.now() - hiddenSince; hiddenSince = null; }
  });

  // --- screens ---------------------------------------------------------------------------------------------------------
  function render(html) { app.innerHTML = html + '<footer class="credits">Map tiles © OpenStreetMap contributors © CARTO.</footer>'; window.scrollTo(0, 0); }
  function go(screen) { S.screen = screen; save(); route(); }

  function route() {
    checkSize();
    var s = S.screen;
    if (s === "consent") return consent();
    if (s === "background") return background();
    if (s === "howto") return howto();
    if (s === "intro") return intro();
    if (s === "practice") return trialScreen("practice");
    if (s === "trial") return trialScreen("trial");
    if (s === "blockdone") return blockDone();
    if (s === "rank") return rank();
    if (s === "done") return done();
    consent();
  }

  function consent() {
    render(
      '<section class="screen"><h1>' + esc(C.studyTitle) + '</h1>' +
      '<p>We are studying how people read weather drawn along a ship’s planned route. You will see maps of routes in the Red Sea, drawn in five different ways, and answer short questions about the waves and the weather’s effect on the ship.</p>' +
      '<ul><li>It takes about 15 minutes, on a computer.</li>' +
      '<li>Each answer is timed. Please answer as accurately and as quickly as you can.</li>' +
      '<li>We ask one question about you: whether you have a maritime background. We do not collect your name, email or IP address.</li>' +
      '<li>Your answers are stored in a Google Sheet that only the research team can open, and are used for research and its publication.</li>' +
      '<li>Taking part is voluntary. You can stop at any time by closing the page; the parts you have finished may already have been saved.</li></ul>' +
      '<p class="small muted">' + esc(C.institution) + ' · Contact: ' + esc(C.contactEmail) + '</p>' +
      '<label class="check"><input type="checkbox" id="c-age"><span>I am 18 or older.</span></label>' +
      '<label class="check"><input type="checkbox" id="c-agree"><span>I have read the above and agree to take part.</span></label>' +
      (TEST ? '<p class="note">Test mode: nothing will be sent.</p>' : "") +
      '<div class="actions"><button id="go" disabled>Start</button></div></section>');
    var a = document.getElementById("c-age"), b = document.getElementById("c-agree"), btn = document.getElementById("go");
    var upd = function () { btn.disabled = !(a.checked && b.checked); };
    a.onchange = upd; b.onchange = upd;
    btn.onclick = function () { S.consentAt = now(); go("background"); };
  }

  function background() {
    render(
      '<section class="screen"><h1>About you</h1><fieldset class="options"><legend>Do you have a maritime background?</legend>' +
      ROLES.map(function (r) { return '<label><input type="radio" name="role" value="' + r[0] + '"' + (S.role === r[0] ? " checked" : "") + "> " + esc(r[1]) + "</label>"; }).join("") +
      '</fieldset><div class="actions"><button id="go" disabled>Continue</button><span class="muted small" id="wait"></span></div></section>');
    var btn = document.getElementById("go");
    app.querySelectorAll('input[name=role]').forEach(function (r) { r.onchange = function () { btn.disabled = false; }; });
    if (S.role) btn.disabled = false;
    btn.onclick = function () {
      var r = app.querySelector('input[name=role]:checked');
      if (!r) return;
      btn.disabled = true;
      document.getElementById("wait").textContent = "Preparing the study…";
      S.role = r.value;
      S.group = r.value === "none" ? "novice" : "mariner";
      assignOrder(S.group).then(function (a) {
        S.order = a.order; S.orderSource = a.source;
        go("howto");
      });
    };
  }

  function howto() {
    render(
      '<section class="screen"><h1>How the questions work</h1>' +
      '<p>Each question shows part of a route on a map, with the weather drawn along it. The route’s colours and symbols are explained in a key beside the map.</p>' +
      '<ul><li>The <strong>bright</strong> part of the map is what the question is about: a stretch of the route, or one spot on it. The rest is dimmed.</li>' +
      '<li>A small <strong>ship</strong> on the route shows which way the ship travels.</li>' +
      '<li>There are four kinds of question: where the waves come from relative to the ship (ahead, side or behind); from which side of the ship they come (port, the ship\u2019s left, or starboard, its right); whether the weather slows the ship down, helps it along, or has little effect; and how high the waves are, in metres.</li></ul>' +
      '<p>You will see the weather drawn in five ways, called A to E, one after another. Each starts with its key and one practice question, then seven timed questions.</p>' +
      '<div class="actions"><button id="go">Start with view A</button></div></section>');
    document.getElementById("go").onclick = function () { S.block = 0; S.trialIdx = 0; go("intro"); };
  }

  function keyBox(v) { return '<div class="key"><div class="key-title">Key</div><img src="keys/' + v + '.webp" alt="Key for view ' + LETTERS[S.block] + '"></div>'; }

  function intro() {
    var v = view(S.block);
    render(
      '<section class="intro"><div><h1>View ' + LETTERS[S.block] + '</h1><p class="muted">View ' + (S.block + 1) + ' of 5</p><ol>' +
      INTRO[v].map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") +
      '</ol><p class="small muted">The key stays beside the map in every question.</p>' +
      '<div class="actions"><button id="go">Try a practice question</button></div></div>' + keyBox(v) + '</section>');
    document.getElementById("go").onclick = function () { go("practice"); };
  }

  // this block's questions: two of each kind, with the attention check slipped into one block
  function blockTrials(p) {
    var list = manifest.sets[p].map(function (id) { return { item: id, kind: "trial" }; });
    var ac = manifest.attentionCheck;
    if (p === ac.block) list.splice(ac.after, 0, { item: ac.item, kind: "attention" });
    return list;
  }
  function taskOf(item) { return { D: "dir", E: "eff", H: "hgt", S: "side" }[item.charAt(0)] || null; }

  function trialScreen(kind) {
    var p = S.block, v = view(p);
    var spec;
    if (kind === "practice") {
      var pr = manifest.practice[p];
      spec = { item: pr.id, kind: "practice", task: pr.task, answer: pr.answers[v] };
    } else {
      var t = blockTrials(p)[S.trialIdx];
      spec = { item: t.item, kind: t.kind, task: t.kind === "attention" ? "dir" : taskOf(t.item) };
    }
    var total = blockTrials(p).length;
    var head = kind === "practice"
      ? '<div class="trial-head"><span><strong>View ' + LETTERS[p] + "</strong> · practice</span><span>Not timed for the results</span></div>"
      : '<div class="trial-head"><span><strong>View ' + LETTERS[p] + "</strong> · question " + (S.trialIdx + 1) + " of " + total + "</span><span>View " + (p + 1) + " of 5</span></div>";
    var q = QUESTIONS[spec.task];
    var qtext = spec.kind === "attention" ? ATTENTION_TEXT : q.text;
    var controls = spec.task === "hgt"
      ? '<input type="number" id="h" inputmode="decimal" step="0.1" min="0" max="6" aria-label="Wave height in metres" disabled><span class="unit">m</span>' +
        '<button id="next" disabled>Next</button><span class="hint" id="hint"></span>'
      : q.options.map(function (o) { return '<button class="ans" data-a="' + o[0] + '" disabled>' + esc(o[1]) + "</button>"; }).join("");
    var src = "stimuli/" + spec.item + "_" + v + ".webp";
    var img = new Image();
    img.alt = "Map of a route with the weather drawn along it";
    img.width = 720; img.height = 480;
    img.src = src;
    var start = function () {
      render(head + '<div class="trial"><div class="map" id="map"></div>' + keyBox(v) +
        '<div class="question"><div class="q">' + esc(qtext) + "</div>" + (q.hint && spec.kind !== "attention" ? '<p class="small muted">' + esc(q.hint) + "</p>" : "") +
        '<div class="answers">' + controls + "</div><div id=\"fb\"></div></div></div>");
      document.getElementById("map").appendChild(img);
      // the clock starts once the map is on screen: two frames after it is placed
      requestAnimationFrame(function () { requestAnimationFrame(function () { begin(spec, v); }); });
    };
    (img.decode ? img.decode() : Promise.resolve()).then(start, start);
    preloadNext();
  }

  function begin(spec, v) {
    interrupted = false; hiddenMs = 0; hiddenSince = document.hidden ? performance.now() : null;
    checkSize();
    var t0 = performance.now(), shownAt = now(), firstInput = null, edits = 0;
    var finish = function (answer) {
      var rt = performance.now() - t0;
      if (hiddenSince != null) { hiddenMs += performance.now() - hiddenSince; hiddenSince = performance.now(); }
      var rec = {
        pid: S.pid, group: S.group, role: S.role, block: S.block, view: v, letter: LETTERS[S.block], kind: spec.kind,
        seq: S.records.length + 1, item: spec.item, task: spec.task, answer: answer, rt_ms: Math.round(rt),
        first_input_ms: firstInput == null ? "" : Math.round(firstInput), edits: spec.task === "hgt" ? edits : "",
        hidden_ms: Math.round(hiddenMs), interrupted: interrupted, shown_at: shownAt, answered_at: now(),
        window_w: window.innerWidth, window_h: window.innerHeight, pilot: PILOT, version: C.studyVersion,
      };
      S.records.push(rec);
      save();
      if (spec.kind === "practice") return feedback(spec, answer);
      nextTrial();
    };
    if (spec.task === "hgt") {
      var h = document.getElementById("h"), next = document.getElementById("next"), hint = document.getElementById("hint");
      h.disabled = false; next.disabled = false; h.focus();
      h.addEventListener("input", function () { edits++; if (firstInput == null) firstInput = performance.now() - t0; hint.textContent = ""; });
      var submit = function () {
        var val = parseFloat(String(h.value).replace(",", "."));
        if (!isFinite(val) || val < 0 || val > 6) { hint.textContent = "Type the height in metres, for example 1.5"; h.focus(); return; }
        h.disabled = true; next.disabled = true;
        finish(Math.round(val * 100) / 100);
      };
      next.onclick = submit;
      h.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    } else {
      var btns = app.querySelectorAll("button.ans");
      btns.forEach(function (b) {
        b.disabled = false;
        b.onclick = function () { btns.forEach(function (x) { x.disabled = true; }); finish(b.getAttribute("data-a")); };
      });
    }
  }

  function feedback(spec, answer) {
    var ok, shown;
    if (spec.task === "hgt") { ok = Math.abs(answer - spec.answer) <= 0.2; shown = spec.answer.toFixed(1) + " m (you typed " + answer + " m)"; }
    else { ok = answer === spec.answer; shown = LABEL[spec.answer]; }
    var fb = document.getElementById("fb");
    fb.innerHTML = '<div class="feedback ' + (ok ? "ok" : "no") + '"><strong>' + (ok ? "Correct." : "Not quite.") + "</strong> The answer is " + esc(shown) + ". " +
      esc(PRACTICE_WHY[spec.item] || "") + '<div class="actions"><button id="go">Start the timed questions</button></div></div>';
    document.getElementById("go").onclick = function () { S.trialIdx = 0; go("trial"); };
  }

  function nextTrial() {
    S.trialIdx++;
    if (S.trialIdx >= blockTrials(S.block).length) {
      S.blocksDone = S.block + 1;
      var p = S.block;
      var recs = S.records.filter(function (r) { return r.block === p; });
      send({ type: "block", session: session(), trials: recs });
      return go("blockdone");
    }
    save();
    route();
  }

  function preloadNext() {
    // the next map, so it is ready when its question starts
    var p = S.block, list = blockTrials(p), next = null;
    if (S.screen === "practice") next = list[0];
    else if (S.trialIdx + 1 < list.length) next = list[S.trialIdx + 1];
    if (next) { var im = new Image(); im.src = "stimuli/" + next.item + "_" + view(p) + ".webp"; }
  }

  function blockDone() {
    var last = S.block === 4;
    render('<section class="screen"><h1>View ' + LETTERS[S.block] + " done</h1><p>" + (S.block + 1) + " of 5 views finished." +
      (last ? " One last step: tell us which views were easiest to read." : " Take a short break if you like; the next view starts when you are ready.") +
      '</p><div class="actions"><button id="go">' + (last ? "Continue" : "Start view " + LETTERS[S.block + 1]) + "</button></div></section>");
    document.getElementById("go").onclick = function () {
      if (last) return go("rank");
      S.block++; S.trialIdx = 0; go("intro");
    };
  }

  function rank() {
    var cards = LETTERS.map(function (L, p) {
      var v = view(p);
      return '<div class="rank-card"><span class="letter">View ' + L + '</span><img src="thumbs/' + v + '.webp" alt="View ' + L + '">' +
        '<select data-view="' + v + '" aria-label="Rank of view ' + L + '"><option value="">Rank…</option>' +
        [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '">' + n + (n === 1 ? " (easiest)" : n === 5 ? " (hardest)" : "") + "</option>"; }).join("") +
        "</select></div>";
    }).join("");
    render('<section class="screen" style="max-width:none"><h1>Which views were easiest to read?</h1>' +
      '<p>Give each view a different rank, from 1 (easiest) to 5 (hardest).</p><div class="rank-grid">' + cards + "</div>" +
      '<p class="hint" id="rhint" style="color:var(--no)"></p>' +
      '<label for="cm"><strong>Any comments?</strong> <span class="muted">(optional)</span></label><textarea id="cm" maxlength="2000"></textarea>' +
      '<div class="actions"><button id="go">Finish</button><span class="muted small" id="wait"></span></div></section>');
    document.getElementById("go").onclick = function () {
      var sel = app.querySelectorAll("select[data-view]"), ranks = {}, used = {};
      for (var i = 0; i < sel.length; i++) {
        var n = sel[i].value;
        if (!n || used[n]) { document.getElementById("rhint").textContent = "Please give each view a different rank from 1 to 5."; return; }
        used[n] = true; ranks[sel[i].getAttribute("data-view")] = +n;
      }
      S.ranking = ranks; S.comment = document.getElementById("cm").value.trim(); S.finishedAt = now();
      var btn = document.getElementById("go"); btn.disabled = true;
      document.getElementById("wait").textContent = "Saving your answers…";
      save();
      send({ type: "final", session: session(), trials: [] }).then(function (ok) { S.sendFailed = !ok; go("done"); });
    };
  }

  function done() {
    var failed = S.sendFailed && !TEST;
    var data = JSON.stringify(TEST ? S.testLog : { session: session(), trials: S.records });
    render('<section class="screen"><h1>Thank you!</h1>' +
      '<p>You have finished the study. It compares five ways of drawing the weather along a planned route: bands beside the route whose colour shows where the weather comes from relative to the ship, and four kinds of symbols beside or on the route. Your answers show which drawing lets people read the conditions, and their effect on a ship, most quickly and accurately.</p>' +
      (failed ? '<p class="note">Your answers could not be sent. Please copy the text below and email it to <strong>' + esc(C.contactEmail) + '</strong>. Thank you.</p><pre class="data" id="data">' + esc(data) + '</pre><div class="actions"><button id="copy" class="secondary">Copy the text</button><button id="retry">Try sending again</button></div>' : "") +
      (TEST ? '<p class="note">Test mode: this is what would have been sent.</p><pre class="data">' + esc(data) + "</pre>" : "") +
      '<p class="muted small">Questions about the study: ' + esc(C.contactEmail) + "</p></section>");
    if (failed) {
      document.getElementById("copy").onclick = function () {
        var t = document.getElementById("data");
        (navigator.clipboard ? navigator.clipboard.writeText(t.textContent) : Promise.reject()).catch(function () {
          var r = document.createRange(); r.selectNodeContents(t); var s = getSelection(); s.removeAllRanges(); s.addRange(r);
        });
      };
      document.getElementById("retry").onclick = function () { flush().then(function (ok) { S.sendFailed = !ok; save(); route(); }); };
    }
  }

  function resume() {
    render('<section class="screen"><h1>Welcome back</h1><p>You have an unfinished session in this browser. Continue where you left off, or start again from the beginning?</p>' +
      '<div class="actions"><button id="cont">Continue</button><button id="restart" class="secondary">Start again</button></div></section>');
    document.getElementById("cont").onclick = function () { if (S.screen === "trial" || S.screen === "practice") S.screen = S.screen; route(); flush(); };
    document.getElementById("restart").onclick = function () { S = fresh(); save(); route(); };
  }

  function fresh() { return { pid: newId(), startedAt: now(), screen: "consent", records: [], blocksDone: 0, block: 0, trialIdx: 0 }; }

  // --- start -------------------------------------------------------------------------------------------------------------
  fetch("data/manifest.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (m) {
    manifest = m;
    var old = load();
    if (old && old.pid && !old.finishedAt && old.screen && old.screen !== "consent") { S = old; resume(); }
    else if (old && old.finishedAt && !params.has("new")) { S = old; route(); }
    else { S = fresh(); save(); route(); }
  }).catch(function () {
    app.innerHTML = '<p class="loading">The study could not load. Please reload the page.</p>';
  });
})();
