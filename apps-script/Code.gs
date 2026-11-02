/** @OnlyCurrentDoc */
// (the annotation above limits the script to the spreadsheet it belongs to: Google then asks for access to this one
// spreadsheet only, not to all of the account's spreadsheets)

// Google Apps Script for the route weather study: stores the answers in this spreadsheet, hands each new participant
// the next view order, and scores the answers against ANSWER_KEY (AnswerKey.gs, kept out of the public repository).
// Setup: apps-script/README.md.
//
//   GET  ?action=assign&group=novice|mariner   -> { order: 0-9 }   the next of the ten view orders for that group
//   POST { type: "block"|"final", session: {...}, trials: [...] } -> { ok: true }
//
// Sheets: "sessions" (one row per participant, updated after every block and at the end) and "trials" (one row per
// answered question, practice and attention check included, with its score and, for some questions, a value from the
// answer key used in the analysis).

var SESSION_COLS = ["pid", "group", "role", "pilot", "test", "order", "order_source", "sequence", "started_at", "finished_at",
  "blocks_done", "finished", "ranking", "comment", "window_w", "window_h", "version", "updated_at"];
var TRIAL_COLS = ["received_at", "pid", "group", "role", "pilot", "block", "view", "letter", "kind", "seq", "item", "task",
  "answer", "correct_answer", "correct", "abs_error_m", "band_side", "rt_ms", "first_input_ms", "edits", "hidden_ms", "interrupted",
  "shown_at", "answered_at", "window_w", "window_h", "version"];
var ORDERS = 10;

// Run once from the editor: creates the two sheets with their header rows
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [["sessions", SESSION_COLS], ["trials", TRIAL_COLS]].forEach(function (s) {
    var sh = ss.getSheetByName(s[0]) || ss.insertSheet(s[0]);
    sh.getRange(1, 1, 1, s[1].length).setValues([s[1]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action !== "assign") return json({ ok: true });
  var group = p.group === "mariner" ? "mariner" : "novice";
  var key = (p.pilot ? "pilot_" : "") + "next_order_" + group; // pilots don't use up the real study's orders
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var n = Number(props.getProperty(key) || 0);
    props.setProperty(key, String(n + 1));
    return json({ ok: true, order: n % ORDERS, n: n });
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var received = new Date().toISOString();
    var trials = (data.trials || []).map(function (t) { return trialRow(t, received); });
    if (trials.length) {
      var th = ss.getSheetByName("trials");
      th.getRange(th.getLastRow() + 1, 1, trials.length, TRIAL_COLS.length).setValues(trials);
    }
    if (data.session && data.session.pid) upsertSession(ss.getSheetByName("sessions"), data.session, received);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// one row per answer, scored: categorical answers right or wrong, wave heights by their absolute error in metres
function trialRow(t, received) {
  var key = typeof ANSWER_KEY !== "undefined" ? ANSWER_KEY : {};
  var truth = t.kind === "attention" ? "side" : key[t.item + "|" + t.view];
  var correct = "", err = "";
  if (truth !== undefined && truth !== null && truth !== "") {
    if (t.task === "hgt" && t.kind !== "attention") err = Math.round(Math.abs(Number(t.answer) - Number(truth)) * 100) / 100;
    else correct = String(t.answer) === String(truth) ? 1 : 0;
  }
  var row = {}; Object.keys(t).forEach(function (k) { row[k] = t[k]; });
  row.received_at = received; row.correct_answer = truth === undefined ? "" : truth; row.correct = correct; row.abs_error_m = err;
  // a value from the answer key used in the analysis, where it has one
  var band = key[t.item + "|" + t.view + "|band"];
  row.band_side = band === undefined ? "" : band;
  return TRIAL_COLS.map(function (c) { return row[c] === undefined ? "" : row[c]; });
}

// the participant's row, found by pid and replaced, or added
function upsertSession(sh, s, received) {
  var row = SESSION_COLS.map(function (c) { return c === "updated_at" ? received : (s[c] === undefined ? "" : s[c]); });
  var last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(s.pid)) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); return; }
    }
  }
  sh.getRange(last + 1, 1, 1, row.length).setValues([row]);
}
