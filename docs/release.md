# Releasing

What to do to put the `c3-build` release live, in order, and who does each
step. Everything here is done by a person; nothing releases itself.

- **Biraag** runs the checks and checks the plan on the test link (steps 1 and 2),
  makes the two checks in step 10 that only work on the live address, and
  re-uploads August on or after 1 October 2026 (see "After the release, with
  dates").
- **The app author** does everything else (steps 3 to 14).

Nothing merges until Biraag says his check on the test link has passed.

## The live address is moving

The live app is moving to **`https://rac-tools-kappa.vercel.app`**, on the
Enhance Vercel account. The old address, `https://rac-tools.vercel.app`, is on
a personal account and is being retired.

During the move both addresses can save: the app keeps a list of live
addresses (`SAVE_HOSTS` in `index.html`), and every other address, including
every test link, reads the live data but never writes. Both addresses use the
same database, so plans saved on one appear on the other. Once the old address
is retired (step 13), it is taken off the list.

If the old project on the personal account does not build from this
repository's `main`, the old address keeps serving the previous version after
the merge, which saves from anywhere and has none of this release's
calculations. That is another reason to move the team to the new link straight
after the merge (step 11).

## The archive, in short

Plans made before this release keep working exactly as they do today, in a
read-only copy of today's app: the **archive**. It lives on the same address as
the app, at `https://rac-tools-kappa.vercel.app/archive/`. There is no second
Vercel project, no second link to share and no second sign-in set-up. The file
is `archive/index.html` and it goes live with the merge like everything else.

The archive reads its own copy of the saved plans and data, stored in the
database under `archive:workspace`, `archive:benchmarks` and
`archive:hire_rates`. The new release takes that copy by itself the first time
it opens on a live address (step 7), before it writes anything of its own.

The archive is the app as it was at commit 46aaae2, with one fix to how it
behaves: the header SMR and Patrol buttons now switch role (they called
`setExportRole`, which did not exist, so they did nothing). It is the same fix
as the author's commit aa01c14 on main. It lets Patrol plans be opened and
exported from the header; no calculation changed. Everything else in the
archive is frozen.

## Checks (Biraag, before the merge)

1. **Run the checks** from the repo folder:

       node tests/run.mjs
       python tests/browser/save_guard.py
       python tests/browser/app_checks.py
       python tests/browser/export_checks.py
       python tests/browser/issued_checks.py
       python tests/browser/archive_checks.py

   Every line must read PASS or SKIP. A SKIP names what is missing; it is not a
   pass. Two checks need a file that is never committed, so set these first:

       RAC_EPLOY_WORKBOOK   the Eploy application report (candidate-level data)
       RAC_PACING_DIR       a folder holding the pacing exports to compare

   `save_guard.py` confirms that both live addresses save and that a test link
   does not.

2. **Check one plan on the test link**, using `docs/check_list.md`, which walks
   through every screen and export the release changed and takes about an hour
   and a half. The test link cannot save: it shows "Not saved" and a banner
   saying so.

## Settings to confirm (app author, once, before the merge)

3. **Supabase sign-in.** In Supabase, Authentication, URL Configuration:
   - **Site URL:** `https://rac-tools-kappa.vercel.app`, so sign-in emails send
     people to the new address by default.
   - **Redirect URLs** must include `https://rac-tools-kappa.vercel.app/**`
     (with the `/**`). The app's sign-in link returns to the page it was sent
     from, so the archive's returns to
     `https://rac-tools-kappa.vercel.app/archive/`, and only the `/**` form
     allows that. Keep `https://rac-tools.vercel.app/**` in the list until the
     old address is retired (step 13), and the test link entries
     (`https://rac-tools-*-enhance-media-rac.vercel.app/**` and
     `https://rac-tools-git-*-enhance-media-rac.vercel.app/**`) as they are.

   Nothing else is needed for the archive: someone already signed in to the app
   in the same browser is already signed in to the archive.

4. **The new project's settings.** In the Enhance Vercel project behind
   `rac-tools-kappa.vercel.app`:
   - The environment variables the spend pull needs (Windsor and Supabase) are
     set for Production, the same as on the old project.
   - "Enable access to System Environment Variables" is already ticked, so the
     version stamp can read the deployed code version. Nothing to change; step 9
     checks it.

## Release (app author, after Biraag's check has passed)

5. **Keep the exports the archive will be compared against.** Before merging,
   from the live app the team uses today, export the PDF and the workings for
   each saved plan that matters (at least the September SMR and Patrol plans).
   Keep them with the date. These are the copies the archive is checked against
   in step 8.

6. **Back up the shared state.** Sign in to the live app and use "Back up" in
   the header, which downloads the whole workspace as a file. Keep it somewhere
   safe until the release has settled.

7. **Merge `c3-build` into `main`** (open a pull request on GitHub from
   `c3-build` to `main` and merge it). Vercel builds it and
   `rac-tools-kappa.vercel.app` follows in a minute or two. **Straight after,
   sign in to `https://rac-tools-kappa.vercel.app` once, before anyone starts
   editing.** That first load takes the archive copy. To confirm it happened,
   open the `rac_state` table in Supabase and check that rows
   `archive:workspace`, `archive:benchmarks` and `archive:hire_rates` are there,
   with today's date in `updated_at`.

   If they are not there, take the copy by hand in the Supabase SQL editor. It
   never writes over an archive row that already exists:

       insert into rac_state (k, v, updated_at)
       select 'archive:' || k, v, now() from rac_state
       where k in ('workspace', 'benchmarks', 'hire_rates')
       on conflict (k) do nothing;

   Do this before anyone changes a plan in the new release, because the copy is
   meant to be the plans as they were on release day.

8. **Check the archive.**
   - Open `https://rac-tools-kappa.vercel.app/archive/`. It should show the
     amber banner "Archive: pre-release plans, read-only".
   - Open each saved plan from step 5 and export its PDF and workings.
   - Compare them with the copies from step 5. The text and the figures should
     match, with one known exception below. If they do not, say so before
     anyone relies on the archive; do not change the archive to make them
     match.
   - **A small difference is expected and is not a failure.** The previous
     calculations (the live app today, and so the archive) can give slightly
     different figures depending on the order in which the data arrives when a
     plan opens. In testing, the same SMR plan opened in the archive showed
     1,400 applications on 17 of 20 loads and 1,402 on the other 3 (about
     0.1%), with 28.0 hires both times. On the loads that showed 1,402, the
     workings differed in 17 cells: the plan total and some location and
     platform spends, a few of them by a few hundred pounds. Patrol did not
     vary. So treat a difference of a few applications in the totals, and
     the rows that go with it, as this known fault. Reopening the plan may
     bring the other figure. Report it as a failure if the totals differ by
     more than about 0.5%, if hires differ, if Patrol differs, or if any
     wording differs. This fault is on the phase 2 list, not fixed in this
     release.

9. **Check the version stamp.**
   - Open `https://rac-tools-kappa.vercel.app/api/windsor-spend?version=1`. It
     should show a `commit` that is not null, and its first seven characters
     should match the merge commit on `main` in GitHub.
   - In the app, open the Method tab: the stamp at the foot reads "Code" and
     the same seven characters, not "Code unknown". Export any PDF and check the
     stamp at the foot of its last page ("Reference: code ...") says the same.
   - If it reads "Code unknown", check the setting in step 4 and redeploy.

10. **Check the new release** on `https://rac-tools-kappa.vercel.app`: the
    "Test version" banner is gone, the header says "Saved", and "Get spend from
    Windsor" on the pacing screen still works (it relies on the project's
    environment variables from step 4).
    - **Biraag, two checks that only work on the live address**, the same day,
      once steps 7 to 9 are done (check list section 13; items 8.4 and 9.4 in
      the feedback list):
      - **The record of changes (8.4).** Change three settings, one at a time:
        the budget, a cost limit on Setup, and the data window on Benchmarks.
        Open the Changelog screen: each change is listed with your name, the
        time, the setting, and what it was and became. Cost limits and the
        data window are recorded since the 22 September changes (X5), so all
        three must appear. Set each one back afterwards.
      - **Patrol in the archive (9.4).** In the archive, open a saved Patrol
        plan and repeat check list section 12, step 3 on it: the header and
        the Plan tab switch to Patrol, and the Workings and PDF are named for
        Patrol.

11. **Tell the team the link has changed.** Send the new link,
    `https://rac-tools-kappa.vercel.app`, and ask everyone to update their
    bookmarks and sign in there from now on. Say that the old link will stop
    working on a set date (step 13), and that nothing needs moving: plans and
    data are the same on both, because both use the same database.

12. **Tell the team about the archive.** Plans made before the release are in
    the archive at `https://rac-tools-kappa.vercel.app/archive/`, and plans made
    from now on are in the live app. Reopening a pre-release plan in the live
    app will show different figures, because the calculations changed; that is
    what the archive is for.

13. **Retire the old address**, on the date given in step 11, once nobody is
    using it:
    - On the personal Vercel account, remove the `rac-tools.vercel.app` project
      (or at least its production deployment), so the old link no longer opens
      the app.
    - In Supabase, Authentication, URL Configuration, remove
      `https://rac-tools.vercel.app/**` (and the bare address) from the
      redirect URLs.
    - In `index.html`, take `'rac-tools.vercel.app'` out of `SAVE_HOSTS`. Update
      the check "Only the live addresses can write to the database" in
      `tests/run.mjs` to expect the new address alone, and in
      `tests/browser/save_guard.py` change the old live address from a page
      that must save to one that must not. Make the change on a branch, run the
      checks, check it on its test link and merge, like any other change.
    - Check that the old link no longer opens the app and that the new one
      still saves.

14. **If something goes wrong after the merge**, revert the merge on `main`
    (GitHub, the merged pull request, "Revert"). The previous version only reads
    `workspace`, `benchmarks`, `hire_rates` and the presence rows, so the
    `archive:`, `issued:` and change-record rows can stay where they are. The
    back-up from step 6 restores the workspace if it was damaged. The previous
    version has no list of live addresses and saves from any address, so after
    a revert, test links would write to the live data again: avoid using them
    until the release is put back. Do not retire the old address until the
    release has settled.

## After the release, with dates

Everything that has to happen once the merge is done, who does it and when.

| What | Who | When |
|---|---|---|
| Sign in once so the archive copy is taken, and confirm the three `archive:` rows (step 7) | App author | Straight after the merge, before anyone edits a plan |
| Check the archive against the kept exports (step 8) and the version stamp (step 9) | App author | The same day |
| The record of changes, including cost limits and the data window (step 10, 8.4) | Biraag | The same day, after steps 7 to 9 |
| Patrol in the archive (step 10, 9.4) | Biraag | The same day, after steps 7 to 9 |
| Tell the team the new link and the archive (steps 11 and 12) | App author | The same day |
| Re-upload August so it counts in the October plans (below) | Biraag | On or after 1 October 2026, before the October plans are issued |
| Run the monthly review after that upload (steps 2 and 3 of "Each month, before the plan") | App author | After the August upload, before any October plan is issued |
| Retire the old address (step 13) | App author | On the date given in step 11 |

**Re-upload August on or after 1 October 2026.** August is already in the
data, but it does not count yet: the data was taken on 17 September, and a month
counts only once 31 days have passed since it ended. An upload is stamped with
the day it is made, so uploading August again on or after 1 October makes it
count.

- **Where:** the Data tab on `https://rac-tools-kappa.vercel.app`. A test link
  cannot save, so the upload must be made on the live address.
- **File:** the monthly Raw Data Export, as .xlsx (the sheet whose name contains
  "Raw Data", otherwise the first sheet) or .csv. It is read by header name:
  Date, Platform, Area, Region, Ad Spend, Blended Apply Completes, and Clicks
  where present. The latest date in the file must reach 31 August 2026.
- **Check afterwards:** open an October plan and read "Months used" on the
  Method tab: August must be listed as counted, with no "not yet settled"
  flag. On the September settings, SMR at x1 moved from 558 to 621
  applications and from 21.0 to 22.3 hires when August was counted in testing;
  Patrol barely moved (786 to 796 applications).

Counting August does not re-run the tests behind the measured values in
`assumptions.csv`. That is the monthly review below, which the app author runs
after the upload.

## Each month, before the plan

Some values in `assumptions.csv` are measured from RAC's data and move a little
each month; others were set by Enhance and switch to a tested figure only when
the switch rule is met (at least 12 test months, and leaving out any one month
does not change the result). This review keeps the file current.

**The app author carries out this review.** Biraag decides what changes;
the app author does the work, because every change is an edit to the
repository.

- **Biraag:** uploads the new month's data (step 1) and decides each change
  (steps 4 and 6). He does not edit the repository.
- **The app author:** runs the import comparison, runs the tests, reads the
  Assumptions tab against the file, then edits `assumptions.csv` on a branch,
  checks the branch's test link and merges (steps 2, 3, 5 and 7).

1. **Upload the new month's data** on the Data tab once it has settled (31 days
   after the month ended). **Biraag.**
2. **When a new applicant tracking (Eploy) file arrives,** run the import with
   the comparison against the previous one (`docs/eploy_import.md`) and review
   any shift above 10%. **App author**, who tells Biraag about any shift.
3. **Run the tests on past months, without writing:**

       node tools/calibrate.mjs

   and compare every tested figure with the file. **App author**, who sends
   Biraag the differences.
4. **Decide the changes.** The Assumptions tab on the live address lists any
   set value whose tested figure now meets the switch rule; the app author's
   step 3 gives the measured values that have moved. **Biraag** decides which
   to take, and says so in writing.
5. **Make the changes Biraag decided:** edit `assumptions.csv` on a branch (or
   run `node tools/calibrate.mjs --write` for the measured values and review the
   difference), check the branch's test link, then merge. Record the decision,
   who made it and its date in the row's notes. **App author, not Biraag.**
6. **Quarterly:** measure the settle period and the quality and hire maturity
   rules again, and review the values the Assumptions tab marks as quarterly
   (the cap multiple default, the cap rules, the thin-data blend). **Biraag**
   decides.
7. **Make any quarterly change** the same way as step 5. **App author.**

From plans for January 2027 the spending caps use the last 12 settled months
instead of every month since January 2026 (`ceiling_rolling_from`,
`ceiling_rolling_months`). Nothing needs doing then; check the first January
plan's "Months used" shows the new months.

## Issued plans

A plan that has been sent to RAC should be marked as issued, using the button
beside the plan picker. It is then stored exactly as it was, under its own
record, written once, and everything about it (the screens, the PDF, the
workings) comes from that record afterwards. An issued plan cannot be renamed,
deleted or written over from the app, and editing it starts a new plan instead.

Still on the app author's list, not needed for this release: a rule in the
database so that nobody with direct access can change an issued plan
(`issued:` rows) or the archive copy (`archive:` rows).

## Rebuilding the archive app

`archive/index.html` is generated, never edited by hand:

    python tools/build_archive.py

It reads `tests/legacy/index_46aaae2.html`, the app exactly as it was at commit
46aaae2, and makes the short list of changes its own comment sets out: the
archive title, heading and banner, the 46aaae2 data file, no writes, reads from
the archive copy, no presence, the month list worked out before the database
answers, and (since 18 September) the header role buttons calling
`setRoleView`. A check confirms the committed file is what the script builds,
and `tests/browser/archive_checks.py` clicks the header Patrol button and
exports the Patrol workings and PDF.
