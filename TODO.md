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
   - [ ] **T1:** select S001, enter code `ENROLL-S001-8492`, click Register. Capture the success message and the credential in the WebAuthn panel.
   - [ ] **T2:** sign in as S001. Capture the signed-in state and the terminal line `LOGIN_SUCCESS`.
   - [ ] **T6:** while signed in as S001, open `http://localhost:3000/students/S002` directly in the address bar. Capture the 403 JSON.
   - [ ] **T8 (optional):** register L001 (`ENROLL-L001-6059`), sign in, and update the S001 grade.
   - [ ] **Terminal:** one screenshot of the `[AUDIT]` lines showing `AUTHZ_DENIED`.
4. Name the files `T1-register.png`, `T2-login.png` and so on, save them in `evidence/screenshots/`, and send them to the group.

## 2. Close the two routes that are open without a login
The brief says a visitor who isn't logged in should see only the login and registration page.
- [ ] `POST /api/dev/reset` (`src/server.js`, around line 531) wipes the database, grades included, and anyone can call it. Delete the route, or wrap it in `if (process.env.NODE_ENV !== 'production')` **and** `requireAuth`. Nothing else depends on it, because the tests call `resetDatabase()` directly.
- [ ] `GET /api/accounts-overview` (around line 103) lists every user's name, email and role. The UI calls it at `public/app.js` line 52 to fill the account dropdown, so either hard-code the three IDs (S001, S002, L001) in `public/index.html` and remove that fetch, or keep the route but return only `id` and `role`.
- Note: the redesigned UI (`public/js/`) no longer calls `/api/accounts-overview` or `/api/dev/reset`, so both routes can be removed without touching the frontend.
- [ ] Rerun `npm test`. It must still show 8x PASS.

## 3. Fix the evidence report (`EVIDENCE_REPORT.md`)
- [ ] Add the **group names and student IDs** at the top. Add them to `README.md` and `AI_TOOLS_DECLARATION.md` too.
- [ ] **T1 credential ID:** the report says `tTSL95…`, but the log changes on every `npm test` run. Run the tests one last time, copy `credentialId` from `evidence/test-run-log.json` into the T1 row, and don't rerun after that. Alternatively, write "random per run".
- [ ] **Section 2.2 wording:** it says the grade endpoint is "not offered to students", but the UI shows the grade form and a "Request S002 Record" button to everyone. Change it to say the T6/T7 evidence comes from **direct curl requests that bypass the UI**. Those still meet the "request the UI did not offer" rule.
- [ ] Add the browser screenshots from step 1, with labels.
- [ ] **Length: 2–3 pages maximum.** Trim section 2.4 to just the two `if` checks. Move section 4 (Part B) into a separate `PART_B_ADDENDUM` file, since it's submitted as an addendum and isn't counted.
- [ ] Keep section 3 (the analysis) between 250 and 350 words. It's 336 now, so don't add to it.
- [ ] Export the report to PDF.

## 4. Package and submit (one person submits for the whole group; Canvas allows 2 attempts)
- [ ] `git add -A && git commit -m "ICS570 passkey portal submission"`. The repo has no commits yet.
- [ ] Push to a repo the marker can access, **or** zip the folder **without `node_modules/`** and `data/db.json`.
- [ ] Upload: the code (zip or link), `README.md`, the evidence report PDF, `AI_TOOLS_DECLARATION.md`, and the optional Part B addendum.
- [ ] Before uploading, check that the README still fits on one page.
