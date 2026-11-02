# Storing the answers: Google Sheet + Apps Script

GitHub Pages only serves files, so the study sends its answers to a small Google Apps Script attached to a Google
Sheet. Do this once, signed in as **multi.vis.w@gmail.com**.

1. Open [sheets.google.com](https://sheets.google.com) and create a blank spreadsheet, e.g. "Route weather study data".
2. In the spreadsheet: **Extensions → Apps Script**.
3. Replace the editor's `Code.gs` with this folder's `Code.gs`.
4. Add a second script file (**+ → Script**) named `AnswerKey` and paste the contents of
   `generator/out/AnswerKey.gs`. It holds the correct answers, so it stays on the study owner's computer, excluded
   from git and not in this public repository. Without it the answers are still stored, just not scored.
5. Choose the function `setup` in the toolbar and click **Run**. Google asks you to authorise the script for this
   spreadsheet: allow it. The sheets `sessions` and `trials` appear with their header rows.
6. **Deploy → New deployment**. Type: **Web app**. Execute as: **Me**. Who has access: **Anyone**. Click **Deploy**
   and copy the **Web app URL** (it ends in `/exec`).
7. Paste that URL into `config.js` as `scriptUrl`, commit and push.

To check it: open the study with `?pilot=1` at the end of its address, answer a few questions, finish one view, and
look for the rows in the sheet.

If you change `Code.gs` later, use **Deploy → Manage deployments → Edit → Version: New version**, so the URL stays
the same.

## What lands in the sheet

- `sessions`: one row per participant, updated after each view and at the end: their maritime role and group (novice
  or mariner), the view order they got, start and finish times, how many views they finished, their ranking of the
  views and their comment.
- `trials`: one row per answered question, practice and the attention check included: the view and its letter, the
  item, the answer, the correct answer, whether it was correct (or, for wave height, the absolute error in metres),
  the answer time in milliseconds, for heights the time to the first keystroke and the number of edits, and how long
  the page was hidden or too small during the question.

The view order counter is kept per group in the script's properties (`next_order_novice`, `next_order_mariner`;
pilot runs use their own counters). To start the counts again for the real study after a pilot, delete those
properties in **Project Settings → Script properties**.
