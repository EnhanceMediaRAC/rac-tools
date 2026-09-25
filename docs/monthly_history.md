# Monthly history workbook

A workbook for RAC with spend, applications, quality applications and hires by
month, for SMR, Patrol and both roles together, plus a sheet by location and
platform. Built each month by `tools/monthly_history.py` (monthly review, step 8
in `docs/release.md`).

## Running it

From the repository folder:

    python tools/monthly_history.py "PATH/TO/Dashboard + Eploy Blended Reporting Data - Master Sheet.xlsx"

It writes "RAC monthly history to <month>.xlsx" next to the master sheet, in the
data folder. The workbook holds RAC's figures, so it never goes in the
repository.

Options:
- `--check`: build and check everything, write nothing.
- `--out PATH`: write somewhere else.
- `--taken DATE`: the day the master sheet was exported, if the file's own date
  is wrong (for example after copying it). Months still inside the settle
  period (31 days) are marked "Recent: may still change".
- `--from MONTH`: the first month shown (default October 2025).

## What it reads

- **The master sheet**, tab "Raw Data Export", by column name: Date, Platform,
  Area, Campaign, Region, Ad Spend, Blended Apply Completes. Spend, and the
  applications the platforms recorded (Eploy's count for Indeed).
- **`data/eploy_rates.json`**: applications, quality applications and hires by
  application month, from the last Eploy import. Run the import first when a
  new Eploy file arrives (monthly review, step 2). The Eploy workbook itself is
  not read.

## How spend is grouped

Every master sheet row goes into one group (EM, 25 September 2026):

| Group | Rows |
|---|---|
| OneRAC | Any campaign naming OneRAC. Shown beside the combined total, not in it. |
| Indeed Premium | Indeed campaigns naming Premium, for SMR or Patrol |
| Combined Activity | Google Demand Gen, Acast, Dynamic Remarketing, Core Branded, Competitor Targeting, Meta awareness and remarketing for the UK, and the joint "Patrol & SMR Mechanics" search campaigns |
| Other platforms | LinkedIn and Placed |
| Indeed, Meta, Google, Appcast | The four planned platforms for SMR or Patrol, tagged to a location |
| Not tagged to a location | The same four platforms, where the row names no location ("UK", "No Region") |
| Left out | Recruitment for other roles. The script prints what it left out. |

Combined Activity or other-platform campaigns for one role go on that role's
sheet. Shared ones go on the "SMR and Patrol" sheet only, so the two role
sheets add up to less than it.

The script stops if the groups do not add back to the master sheet's total for
every month, and if any row is dated after the day the file was exported (a
year typed wrongly: on 25 September 2026, 29 to 31 December 2025 arrived dated
2026). A new kind of campaign lands in "Left out" or "Not tagged" until
the rules in `bucket()` are changed. Read the printed lines each month.

## Hires

Hires are counted against the month the candidate applied. A month is marked
"Hires still coming through" until `hire_maturity_months` (3) further months
have started by the Eploy file's date, the same rule the plans use.

## Checks

`node tests/run.mjs` runs `tests/tools/test_monthly_history.py` on a made-up
master sheet, and builds the real one in check mode when `RAC_PACING_DIR`
points at the data folder. The workbook's text is held to the same output
checks as the PDF (`exports/checks.js`); a workbook that fails is not saved.

Up to 2025, the app's data spread spend not tagged to a location across
locations, and counted Meta remarketing as Meta. The workbook keeps untagged
spend separate and counts Meta remarketing as Combined Activity, so its
location and Meta figures for those months differ from the app's while the
totals agree.

## Known gaps

- Any month in the range without spend in the master sheet shows hires only,
  and the Read me names those months.
- The master sheet dated 23 September 2026 held slightly less SMR Google spend
  for January and February 2026 than the app's data file (17 September); every
  other role and month matched it to the pound. The workbook follows the master
  sheet.
