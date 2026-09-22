# Checking the release on the test link

About two hours. Work through it in order and write down anything that looks
wrong; nothing here changes the live app, because a test link cannot save.

Open the branch's test link,
`https://rac-tools-git-c3-build-enhance-media-rac.vercel.app`, and sign in. You
should see the amber banner "Test version. Nothing you change here is saved"
and "Not saved" where the live app says "Saved". If you do not, stop: you are
on a live address. The live app is moving to `https://rac-tools-kappa.vercel.app`;
the old `https://rac-tools.vercel.app` also saves until it is retired. Neither is
the test link.

Figures quoted below come from the October 2026 plans built on the September
settings (SMR: plan 2a's settings; Patrol: its September settings), at a
spending cap multiple of x1 unless stated. The plans on the test link may use
other settings, so expect the same kind of result rather than the same pounds.

## 1. Does it open, and does it follow the role switch (10 minutes)

1. Go to the Plan tab for SMR, October 2026. There is no Platforms tab any more:
   the Plan tab now carries the platform tables.
2. At the top are six boxes in two rows of three: predicted applications,
   predicted hires, the target for applications; total VAFs, **Current budget** (with the
   deployable budget and the amount placed beneath it), and budget to hit
   target.
3. Switch to Patrol with the buttons at the top right, beside the export
   buttons, then back to SMR. The figures should follow the role and come back
   the same.
4. Go to Setup and press Patrol, then SMR, at the top. Setup now shows one role
   at a time and follows the same switch. Settings shared by both roles (cap
   multiple, efficiency, include months still settling) say "Applies to both
   roles".

## 2. The Plan tab tables (20 minutes)

The Plan tab shows the same tables as the PDF, built by the same code, so what
you check here holds for the PDF too.

1. Find the tables below "Where the budget goes": **By location**, **By
   platform**, then one per platform (**Indeed by location** and so on).
2. Check the columns, in this order: Total spend, Fee, Media, Plan CPA (media),
   Predicted applies, Quality rate, Hire rate from quality applies, Hire
   adjustment, Plan CPH (media), Predicted hires. The location table adds Notes
   and VAFs at the end. The platform tables add Base CPA and CPA adjustments
   before Plan CPA. There is no spending cap column: the caps are a point in
   the PDF summary instead.
3. Follow one row of the Indeed table with a calculator:
   - Total spend = media + fee.
   - Base CPA x CPA adjustments = Plan CPA. The small line under CPA
     adjustments shows its three parts (thin-data x diminishing returns x
     real-world CPA outcome), which multiply to it.
   - Media / Plan CPA = Predicted applies.
   - Predicted applies x quality rate x hire rate x hire adjustment = Predicted
     hires (to rounding: hires are shown to two decimals).
   - Media / Predicted hires = Plan CPH. A row with fewer than 0.1 hires shows
     no cost per hire.
   For South East Indeed (plan 2a settings, x1): £99.71 x 1.057 = £105.36;
   £7,193 / £105.36 = 68.3 applies.
4. Check the totals: in the location and platform tables, total spend, fee,
   media, applies and hires are the sums of the rows, and the rates and costs on
   the total row are totals divided by totals.
5. The small lines under Plan CPA, Predicted applies, Plan CPH and Predicted
   hires are the ranges. "or more" appears where the hire range starts at 0.
6. Read the Notes column. Each location says what held it, in these words:
   "Every platform at its spending cap", "At the most this location has spent
   in a month", "At the maximum set for this plan", "Held by caps and cost
   limits", "At the cost per hire limit set for this plan", "Hires held to its
   VAFs", "Spend set by the cost limit for this plan", "No spend in this plan",
   "Minimum £A not met: £X short, held by caps", "Low confidence: little
   evidence behind the hires", or "Full share of budget placed" where nothing
   held it.
7. "Where the budget goes" shows the budget, the hold-backs, the deployable
   budget, then **Placed in the plan** (of which media, of which platform
   fees) and **Not placed**.

## 3. Does it match what you expect (20 minutes)

This is the part only you can do.

1. Pick two locations you know well, one big and one thin.
2. On the Plan tab, look at their spend, applications, hires and cost per hire.
3. Ask: would you have planned roughly that? If not, write down which figure
   looks wrong and by how much.
4. Do the same for one platform across locations, using its platform table.

What changed the figures since the method walk-through (the numbers are in
BUILD_PROGRESS.md in the data folder):

- **Costs are on media.** Cost per application, cost per hire and cost limits
  now leave the fee out; fees are shown in their own column and lines. The
  split between platforms still treats a platform with a fee as dearer.
- **SMR's real-world CPA outcome adjustment is now 1.00** (it was 1.096). The
  tested values were worked out again after the two changes below, and under
  the rules already set the adjustment no longer held with every test month
  left out. This added about a hire to SMR.
- **Quality blend 35** for Indeed and Appcast, both roles (it was 200): about
  0.3 fewer hires for each role.
- **Role benchmark cost per application** is each role's average over the
  months the caps use (SMR £74.97, Patrol £81.28): under 0.1 hires either way.
- **The VAF rule:** a location's predicted paid-media hires can no longer
  exceed its VAFs. It did not bind on the October plans.
- **Expected hires from other sources count towards the target** (as before),
  and every output now says they are not modelled on the budget.

The October figures after these changes:

| | Hires (paid + other) | Applications | Placed | Not placed |
|---|---|---|---|---|
| SMR x1 | 21.9 (11.8 + 10.1) | 601 | £46,595 | £46,191 |
| SMR x2 | 26.4 | 833 | £73,136 | £19,650 |
| SMR x3 | 29.1 | 958 | £91,941 | £845 |
| Patrol x1 | 24.8 (10.9 + 13.9) | 786 | £67,215 | £6,985 |
| Patrol x2 | 25.6 | 857 | £71,735 | £2,465 |

Budget not placed is a real result: it says the plan would be spending more in a
place than it has ever absorbed in a month. Ask: for the locations you know,
does the amount left over look like more than they could really take?

## 4. The budget for the target, and money that cannot be placed (10 minutes)

1. Under the six boxes, the budget for the target is set out in steps: the
   target, less the hires expected from other sources, gives the paid-media
   hires needed; then the hold-backs plus what is placed for them gives the
   budget.
2. For SMR (30 hires, out of reach) the box reads "Most 21.9 hires", "needing a
   total budget of £55,800 (£46,595 placed plus £9,164 held back)", and the line
   below it reads "Spend above £55,800 has not successfully driven results:
   every location and platform would be above the largest month that worked
   for it, so the plan does not place it." The out-of-reach panel shows the same
   figures at x1, x2 and x3.
3. For Patrol on its September settings (16 hires), the budget is £18,350: the
   location minimums alone need that much, and at it paid media is predicted to
   deliver 3.3 hires against the 2.1 needed. It used to show £5,000, which the
   minimums overspent. Check the line under the boxes says the minimums set the
   budget.
4. Where money cannot be placed, the orange notice says so, points at the Notes
   column, and offers "Use £X": the budget less what cannot be placed, rounded
   up to £50. Press it. The Current budget box changes to £X and the notice
   goes, or leaves a few hundred pounds where a platform maximum holds (the
   Appcast maximum, at a higher cap multiple). The test link saves nothing, so
   set the budget back afterwards.

## 5. Setup (15 minutes)

1. **No real-world CPA outcome adjustment field.** It now comes from the
   assumptions file only, and shows on the Assumptions tab.
2. **Location limits.** Near the bottom, one heading holds both limit tables:
   "Platform coverage & budget limits by region" (where platforms run, and the
   least and most a location may spend), then "Cost limits".
3. **Cost limits** are on media. Each cost per hire box has "now £x a hire"
   under it, and each cost per application box "now £x".
   - Set a cost per application limit **above** today's figure on one location
     and platform (for example 25% above). The row can now spend beyond its
     spending cap: spend continues until the predicted cost per application
     reaches the limit. Under the box: "limit applied: spend £X (cap without it
     £Y)", with X above Y. On the Plan tab the location's note reads "Spend set
     by the cost limit for this plan", and in the PDF summary the spending caps
     point names the row and says whether it is above past spending levels.
   - Set it **below** today's figure. Spend falls, and the plan cost per
     application for that row equals the limit.
   - Set a cost per hire limit on a location; its spend falls until its cost
     per hire (media) is at the limit.
   - Clear them all.
4. **The market guide** is at the bottom, closed. Open "What the market was
   doing". Cost per click and per thousand impressions are in pounds, with each
   platform's average beside them. Below, a table of Indeed's monthly figures
   for Automotive Technician, Mechanic and Vehicle Technician: competition
   score, jobs and jobseekers per job, for 13 months. Check five of the 20
   figures listed in BUILD_PROGRESS.md against the reports in the data folder.
   Switch to Patrol: the guide is there too.

## 6. The PDF (20 minutes)

1. Press PDF in the header.
2. The summary fits on one page. Read it as if you were RAC. Does it answer
   "what will this buy, and how sure are you?"
3. The Budget block shows the budget, the hold-backs, the deployable budget,
   **Placed in the plan** with its media and platform fees lines beneath, and
   the budget not placed. Fees are never folded into another figure.
4. Predicted results: hires (from paid media, and expected from other sources,
   "not modelled on the budget"), applications, quality applications, **Cost
   per application (media)**, **Cost per hire, paid media (media)**, and the
   budget for the target. Under them, the budget for the target in steps.
5. Assumptions and risks, one point each: spend above past levels; the
   **spending caps** (how many rows and locations were at their caps, and any
   row whose spend a cost limit set); "Spending cap multiple: x1." with nothing
   after it; the **real-world CPA outcome adjustment** with what testing found
   in plain words; expected hires from other sources, counted towards the
   target and not modelled on the budget; Months used; platform fees (shown
   separately; costs on media, because past costs were recorded without
   fees); attribution; any minimums not met; low-confidence rows; rows with no
   successful month.
6. The table pages match the Plan tab (section 2).
7. Method and glossary: the terms are "diminishing returns adjustment",
   "real-world CPA outcome adjustment", "CPA adjustments", "Base cost per
   application", "Plan cost per application (media)", "Hire adjustment",
   "VAFs". Nothing should say "remaining-error", "spend-level" or "usual". The
   Cost limits section says a cost per application limit replaces the row's
   spending cap. The Spending caps section says that from plans for January
   2027 the caps use the last 12 settled months.
8. The stamp is on the last page only, bottom left, and starts "Reference:": a
   short code, the applicant tracking data date, the month the ad data runs to
   and the assumptions date. It names no file and holds no link.
9. Press "PDF, no notes" and confirm only the notes page is missing.

## 7. The workings (15 minutes)

1. Press Workings. Open the file.
2. **Summary:** the budget block has "of which media" and "of which platform
   fees" under Placed in the plan. Spend above past levels is in three rows:
   above the month each cap was based on; above the largest month the row ran
   since January 2026; and in rows with no spend of their own since January
   2026, named. Then the spending caps note, and the budget for the target as
   rows (target, less other-source hires, paid-media hires needed, then
   hold-backs and placed, or the most hires and the total budget where they
   stop rising). "Months used" says the same as the PDF.
3. **Workings sheet:** the note at the top lists the few figures written as
   values (total spend, the settings, the ranges); everything else is a
   formula. Click Plan CPA (media): it is Base cost per application x CPA
   adjustments. Click Spending cap (media): it reads the Successful months
   sheet.
4. Follow one row using `docs/trace_guide.md`, which does exactly that for
   South East Indeed, with this release's figures.
5. **Data sources:** one "Data taken on" column (the two columns "Where it came
   from" and "Date taken" have gone), with the settling rule in the note above
   the table.
6. **Successful months:** for each month, Actual cost that month, the
   Success-test benchmark at that spend, then Cost test, Quality rate that
   month, Expected quality rate, Quality test, Counted and Cap this month sets
   (media). Click Counted and the cap: they are formulas over the cells beside
   them, so the sheet shows the tests being applied. Each cap row shows the
   Planning cost per application (media); the note at the top says why it
   differs from the success-test benchmark.
7. **Assumptions:** the Source column reads "Set by Enhance", "Set by Enhance,
   informed by testing", "Set by Enhance, informed by RAC's data" (screening
   maturity) or "Measured from RAC's data". The quality blend reads 35. The
   role benchmark cost per application is measured from RAC's data.
8. **Back-test:** the note reads "Window: year to date, with the last three
   months counted x2", and the cost misses heading names the real-world CPA
   outcome adjustment. (It once printed "[object Object]".)

## 8. The data window and upweighting (15 minutes)

1. On the Plan tab for SMR, write down predicted applications, hires and cost
   per application.
2. Go to Benchmarks, SMR, and note which window it shows. Choose "Year to date,
   recent weighted" with "Last 3 months count" at 2x, note the Plan tab
   figures, then change it to 3x.
3. Back on the Plan tab, cost per application should rise and applications
   fall, because May to July 2026 cost more than January to April.
4. Press PDF. The "Months used" line and the method section should now say
   "May to July 2026 counted three times". Quality rates, hire rates, spending
   caps, other-source hires and testing should still name the same months:
   they follow fixed rules, not the window.
5. Export the workings under 2x and 3x and compare two rows' Spending cap
   (media) on the Workings sheet: the caps are the same whatever the window.
6. Set the window back to what it showed in step 2.

## 9. The OneRAC plan and its PDF (10 minutes)

1. Open the OneRAC tab. Its cards now have the same spacing as the other tabs.
   Tick a location, set a month, a budget and a hire target. Check the plan
   appears, that the SMR and Patrol plans lose that location, and that each
   shows a OneRAC hold-back.
2. Press PDF on the OneRAC tab and open the OneRAC PDF. Its summary and tables
   follow sections 6 and 2. The title names OneRAC and the hire target; its
   method pages include "The OneRAC plan".
3. Press Workings on the OneRAC tab. Keep this file and the OneRAC PDF open for
   section 10.
4. Untick the location.

## 10. Nothing that tells RAC the tool exists (10 minutes)

RAC should see a plan from Enhance, not a tool. Open the SMR PDF, the "PDF, no
notes" version, the SMR workings, the OneRAC PDF and the OneRAC workings. In
each, use Find (Ctrl+F; in Excel, Find All with "Within: Workbook" and "Look
in: Values") for:

- app, tool, website, Setup, screen, button, saved, upload
- .csv, .js, json, rac_data
- repository, GitHub, Vercel, Supabase, public, database, branch
- remaining-error, spend-level, usual
- Indeed's report names, and the name of Indeed's research arm
- [object

Find also matches inside longer words, so ignore any match that is part of a
longer word: "applicant", "application", "apply", "applies", "Appcast",
"capped" and "happened" (for app), "screening" (for screen) and "unusual" (for
usual). On the workings Assumptions sheet, the Key column holds setting names
such as "cpa_prior_apps", "screen_blend_n", "cap_row_usual_limit" and
"remaining_error_factor"; ignore those too. Apart from those, nothing should be
found. The Eploy dataset's own file name appears in the stamp and notes, which
is expected: it is RAC's own file. The exports run a whole-word version of this
search themselves and refuse to save a document that fails it, so a find here
means something slipped past that check.

## 11. The other screens (10 minutes)

1. **Assumptions tab.** Every value, what this plan used, what testing gave,
   where it came from and when it was set. The quality blend is 35, the SMR
   real-world CPA outcome adjustment 1.00 with its tested figure beside it, and
   the two rolling-cap rows (ceiling_rolling_from 2027-01,
   ceiling_rolling_months 12) are there. This tab is for the team, so it still
   uses the file's own source words.
2. **Changelog screen.** The 22 Sep release notes cover the tables, costs on
   media, the renames, cost limits, the VAF rule, the budget for the target,
   Setup following the role switch and the market guide. They should say
   nothing about where the app is kept or hosted. A test link cannot write, so
   the record of your own changes stays empty here (see section 13).

## 12. Issued plans and the archive (10 minutes)

1. Save a plan ("Save as new plan"), then press "Mark as issued". On the test
   link it will tell you nothing was stored, because a test link never writes.
   That is the right answer.
2. Add `/archive/` to the end of the test link's address. It should show the
   amber banner "Archive: pre-release plans, read-only". It has no saved plans
   yet: the archive's copy is taken when the release first opens on the live
   address, after the merge. It still shows a plan on its default settings.
3. In the archive, press **Patrol** in the header, beside the export buttons.
   The header and the Plan tab should both switch to Patrol and show Patrol
   figures. Press Workings and PDF: the files should be named for Patrol. Press
   **SMR** and the SMR figures come back. The archive is the previous version
   and is not changed by this release.

## 13. After the release, on the live address

These cannot be checked on a test link, because it never writes. They are in
`docs/release.md` step 10.

1. Change a plan setting (for example the budget, a cost limit, or the data
   window on Benchmarks), then open the Changelog screen: your name, the time,
   the setting, and what it was and became should be listed. Cost limits and
   the data window are now recorded too.
2. Open a saved Patrol plan in the archive and repeat section 12, step 3 on it.
   A difference of a few SMR applications between the archive and the live
   exports (1,400 against 1,402 in testing) is a known fault of the previous
   calculations, not of the archive.

## 14. What to say afterwards

- Anything that looked wrong, with the screen and the figure.
- Anything you would want RAC not to see in the PDF or the workings.
- Whether the plan's figures are close enough to your own judgement to send.

If something is wrong, it is better to say so than to merge. Nothing in this
release is urgent enough to send a plan you do not believe.
