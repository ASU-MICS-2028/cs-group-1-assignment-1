# Hand-over TODO — ICS570 Passkey Portal (due Sat 17 Oct 2026, 23:59)

**Already done:** the T1–T8 tests pass (`npm test`), the AI declaration now lists Claude Code, and the seeded emails use `@example.edu`.

Work through the list in order and tick each box as you go.

## 0. Set up (about 5 min)
```bash
npm install
npm run reset
npm test          # expect 8x [PASS] plus the logout check
```

## 1. Take the real-browser screenshots (main gap, worth the 30 passkey marks)
All the evidence so far comes from the software authenticator in `scripts/run-tests.js`. The brief asks for a **real browser WebAuthn flow**, so we need screenshots from Chrome.

1. `npm run reset && npm start`, then open **http://localhost:3000** in Chrome. Use `localhost`, not `127.0.0.1`.
2. Open DevTools → ⋮ → More tools → **WebAuthn**. Tick *Enable virtual authenticator environment*, choose ctap2 / internal, tick *resident keys* and *user verification*, then click **Add**. (Touch ID also works.)
3. Take these screenshots, each one showing the UI result **and** the DevTools WebAuthn panel or the server terminal:
   - [x] **T1:** select S001, enter code `ENROLL-S001-8492`, click Register. Capture the success message and the credential in the WebAuthn panel.
   - [x] **T2:** sign in as S001. Capture the signed-in state and the terminal line `LOGIN_SUCCESS`.
   - [x] **T6:** while signed in as S001, open `http://localhost:3000/students/S002` directly in the address bar. Capture the 403 JSON.
   - [x] **T8 (optional):** register L001 (`ENROLL-L001-6059`), sign in, and update the S001 grade.
   - [x] **Terminal:** one screenshot of the `[AUDIT]` lines showing `AUTHZ_DENIED`.
4. Name the files `T1-register.png`, `T2-login.png` and so on, save them in `evidence/screenshots/`, and send them to the group.

> **Status (16 Oct):** `node scripts/browser-evidence.mjs` now produces `evidence/screenshots/T1-register.png` … `T8-lecturer-grade-update.png` and `server-audit-log.png` from a real Chromium run with a virtual authenticator, plus `evidence/browser-run-audit.log`. These cover T1, T2, T6, T8 and the terminal shot. **Still to do by hand (optional):** one screenshot that shows the Chrome DevTools WebAuthn panel next to the UI, if the group wants that extra proof.

## 2. Close the two routes that are open without a login
The brief says a visitor who isn't logged in should see only the login and registration page.
- [x] ~~`POST /api/dev/reset` (`src/server.js`, around line 531) wipes the database, grades included, and anyone can call it. Delete the route, or wrap it in `if (process.env.NODE_ENV !== 'production')` **and** `requireAuth`. Nothing else depends on it, because the tests call `resetDatabase()` directly.~~ **Removed.** Use `npm run reset` locally.
- [x] ~~`GET /api/accounts-overview` (around line 103) lists every user's name, email and role. The UI calls it at `public/app.js` line 52 to fill the account dropdown, so either hard-code the three IDs (S001, S002, L001) in `public/index.html` and remove that fetch, or keep the route but return only `id` and `role`.~~ **Removed.** The UI hard-codes the three IDs in `public/js/core.js`.
- Note: the redesigned UI (`public/js/`) no longer calls `/api/accounts-overview` or `/api/dev/reset`, so both routes can be removed without touching the frontend.
- [x] Rerun `npm test`. It must still show 8x PASS. (Done: 8x PASS plus the logout check.)

## 3. Fix the evidence report (`EVIDENCE_REPORT.md`)
- [x] Add the **group names and student IDs** at the top. Add them to `README.md` and `AI_TOOLS_DECLARATION.md` too.
- [x] **T1 credential ID:** the report says `tTSL95…`, but the log changes on every `npm test` run. Run the tests one last time, copy `credentialId` from `evidence/test-run-log.json` into the T1 row, and don't rerun after that. Alternatively, write "random per run".
- [x] **Section 2.2 wording:** it says the grade endpoint is "not offered to students", but the UI shows the grade form and a "Request S002 Record" button to everyone. Change it to say the T6/T7 evidence comes from **direct curl requests that bypass the UI**. Those still meet the "request the UI did not offer" rule.
- [x] Add the browser screenshots from step 1, with labels.
- [x] **Length: 2–3 pages maximum.** Done: the PDF is 3 pages. ~~Trim section 2.4 to just the two `if` checks.~~ Done. ~~Move Part B into `PART_B_ADDENDUM`.~~ Done (`PART_B_ADDENDUM.md`). Check the page count when exporting to PDF; if it runs over, drop Fig. 5 or the 2.3 log excerpt.
- [x] Keep section 3 (the analysis) between 250 and 350 words. It's about 333 now, so don't add to it.
- [x] Export the report to PDF. Done: `submission/ICS570-Lab2-Group1-Evidence-Report.pdf`.

## 4. Package and submit (one person submits for the whole group; Canvas allows 2 attempts)
- [x] ~~`git add -A && git commit`~~ Done: the repo now has commits on `main` and on the `claude/blissful-galileo-k256pg` branch (UI redesign + evidence). Merge that branch before submitting.
- [ ] Push to a repo the marker can access, **or** zip the folder **without `node_modules/`** and `data/db.json`.
- [ ] Upload: the code (zip or link), `README.md`, the evidence report PDF, `AI_TOOLS_DECLARATION.md`, and the optional Part B addendum.
- [x] Before uploading, check that the README still fits on one page. Done: `submission/ICS570-Lab2-Group1-README.pdf` is 1 page. It now includes a 2×2 screenshot grid; if it runs over, remove the grid (the screenshots are also in the evidence report).
