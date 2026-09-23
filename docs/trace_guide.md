# Following one figure from the raw data to the plan

This traces one location and platform, **South East Indeed**, from the monthly
figures the app holds to the hires the PDF prints, naming the sheet and column
of the workings export at every step. Anyone can do the same for any other row.

The figures below come from an October 2026 SMR plan built on 22 September 2026
with the September plan's settings (budget £101,950, 30 hires, spending cap
multiple 2, window "year to date, last three months x2"). Your own plan will
show different numbers; the steps are the same. The workings export is the
place to check a live plan, because almost every figure there is a live
formula.

## 1. The monthly figures. Sheet: **Data sources**

Every monthly figure the plan read, with the date the data was taken, whether
it counts, and what it counts for.

South East Indeed:

| Month | Spend | Applications | Counts | Weight |
|---|---|---|---|---|
| Oct 2025 | £3,370.99 | 53 | yes | 0 |
| Nov 2025 | £1,453.53 | 26 | yes | 0 |
| Dec 2025 | £2,905.64 | 22 | yes | 0 |
| Jan 2026 | £2,172.31 | 31 | yes | 1 |
| Feb 2026 | £1,093.94 | 37 | yes | 1 |
| Mar 2026 | £7,128.69 | 38 | yes | 1 |
| Apr 2026 | £6,711.49 | 67 | yes | 1 |
| May 2026 | £6,097.71 | 74 | yes | 2 |
| Jun 2026 | £7,192.78 | 86 | yes | 2 |
| Jul 2026 | £7,122.23 | 44 | yes | 2 |
| Aug 2026 | £5,331.52 | 45 | **no: still settling** | 0 |

Two things decide the weight. A month counts at all only once it is settled: 31
days must have passed between its last day and the date the data was taken, so
applications recorded late are in. August was not, so it counts for nothing.
Then the window decides the rest: this plan used year to date with the last
three months counted twice, so 2025 is out and May, June and July count double.

## 2. The window figures. Sheet: **Blend inputs**

The weighted totals, then scaled back to the number of months in the window, so
a month counted twice does not look like extra evidence:

| | Figure | How |
|---|---|---|
| Weighted spend | £57,931.87 | each month's spend x its weight |
| Weighted applications | 581 | the same for applications |
| Weight added up | 10 | 1+1+1+1+2+2+2 |
| Months in window | 7 | January to July |
| Spend in the window | £40,552.31 | £57,931.87 x 7 / 10 |
| Applications in the window | 406.7 | 581 x 7 / 10 |
| **Base cost per application** | **£99.71** | £40,552.31 / 406.7 |
| Average monthly spend | £5,793.19 | the weighted average of the months it ran |

The same sheet, lower down, does this for every location on the platform
together, which gives **Indeed's figure for the role**: 2,440.9 applications on
£180,620.27, or £74.00, pulled towards the role's average cost per application
over the months the spending caps use (£74.97) by 35 applications of evidence,
giving **£74.01**.

## 3. From the base cost to the plan cost per application. Sheet: **Workings**

Reading the South East Indeed row left to right:

| Column | Figure | How |
|---|---|---|
| Base cost per application | £99.71 | from Blend inputs, step 2 |
| Platform figure for the role | £74.01 | from Blend inputs, step 2 |
| Cost per application after the thin-data pull | £97.67 | (406.7 x £99.71 + 35 x £74.01) / (406.7 + 35) |
| Thin-data adjustment | 0.9796 | £97.67 / £99.71: this row has plenty of evidence, so it barely moved |
| Average monthly spend | £5,793.19 | from Blend inputs |
| Cost rises with spend (rate) | 0.65 | the rate set by Enhance, shared across platforms |
| Total spend | £5,597.07 | what the split gave this row, fee included |
| Media | £5,500.80 | £5,597.07 / 1.0175, the Indeed fee taken off |
| Fee | £96.26 | shown in its own column |
| Diminishing returns adjustment | 0.9820 | (£5,500.80 / £5,793.19) ^ (1 − 0.65): planned spend sits below average, so cost comes down a little |
| Real-world CPA outcome adjustment | 1.0769 | testing on past months found SMR costs about 8% higher than predicted, in the same direction with any one test month left out, so planned costs are raised by that much |
| CPA adjustments | 1.0360 | 0.9796 x 0.9820 x 1.0769. The tables show all four to four decimals, so the three parts multiply to the figure beside them |
| **Plan CPA (media)** | **£103.30** | £99.71 x 1.0360 |
| **Predicted applies** | **53.3** | £5,500.80 / £103.30 |

## 4. From applications to hires. Sheets: **Rate build-up**, then **Workings**

| | Figure | How |
|---|---|---|
| Indeed's own quality rate | 16.4% | 418 quality applications of 2,543, October 2025 to June 2026 |
| Role average, every source | 20.9% | 1,598 of 7,660, all sources together, same months |
| **Quality rate** | **16.5%** | (418 + 35 x 20.9%) / (2,543 + 35): blended with the role average by 35 applications |
| Location quality adjustment | 1.00 | location differences are not applied |
| **Hire rate from quality applications** | **11.7%** | the role average (187 hires from 1,598 quality applications): 41 hires from 311 quality applications in the South East is its own figure, but regional differences did not carry forward in testing |
| Hire adjustment | 0.980 | so past predictions match the hires Eploy credited to the four platforms |
| Quality applications | 8.79 | 53.3 x 16.5% |
| **Predicted hires** | **1.01** | 53.3 x 16.5% x 11.7% x 0.980 |
| Plan CPH (media) | £5,462 | £5,500.80 / 1.01 |

## 5. What limited the spend. Sheet: **Successful months**

Every month from January 2026 with at least £200 of spend and 5 applications is
tested, the same way whatever data window the plan uses. The Cost test,
Quality test and Counted columns, and the cap each month sets, are formulas
over the cells beside them.

- **Cost:** was its actual cost per application at or below the success-test
  benchmark at that month's spend? The benchmark is this row's own average cost
  per application over the settled months from January 2026, each counted once
  (£97.26 on £5,359.88 a month), adjusted for the month's spend at the rate of
  0.65, with no real-world CPA outcome adjustment. In June 2026, at £7,192.78,
  the benchmark was £107.80 and the month cost £83.64, so it passed. March
  (£187.60 against £107.46) and July (£161.87 against £107.43) did not.
- **Quality:** was the South East's quality rate that month no more than 25%
  below what was expected for it that month? The expected rate is its average
  rate scaled by how that month's rate across all locations compared with the
  average. In June it was 19.1% against 17.4% expected, so it passed; in
  January it was 15.0% against 21.7%, so January was set aside.

The success-test benchmark and the plan cost per application differ on purpose:
the benchmark ignores the plan's data window and the real-world CPA outcome
adjustment, so the caps stay the same whichever window a plan uses.

June 2026 was the largest month that passed, at £7,192.78. A cap may be based on
no more than 2 x the row's average monthly spend (2 x £5,359.88 = £10,719.76),
so June stands, and the cap on media is £7,192.78 x 2 (the spending cap
multiple): **£14,385.56**. Planned spend is capped at that plus the Indeed fee.
This row was funded at £5,500.80 of media, inside it.

The South East also has a location cap. Its biggest month across all platforms
was July 2026: £12,961.11 (Indeed £7,122.23, Meta £3,454.68, Google £2,264.20,
Appcast £120.00). x 2, that is £25,922.22 of media. The South East was planned
at £15,000.00, its location maximum for this plan, so neither cap held it. The
table under the rows on the same sheet shows this for every location.

## 6. The range. Sheet: **Back-test**

The plan's own range comes from how far it missed on past months, each
predicted from the months before it: for SMR, −18.5% to +19.2%. A row's range
starts there and widens where fewer applications sit behind its cost per
application, and where planned spend sits further from past spend. South East
Indeed, with 406.7 applications behind it, came out at **38 to 72
applications**, and **0 to 2 hires** once the uncertainty in the rates and the
chance variation in a small number of hires are added.

## 7. Where it appears

- **Plan tab and PDF:** the same tables, with the same columns. On the Indeed
  table ("Indeed by location"), one row per location: total spend, fee, media,
  base CPA, CPA adjustments (with the three parts under them), plan CPA,
  predicted applies, the rates, the hire adjustment, plan CPH and predicted
  hires, with the ranges under their figures. The location and platform tables
  add it into their totals.
- **Workings export:** the Workings sheet row above, with every figure a live
  formula pointing at the sheets in steps 1 to 6, so the arithmetic can be
  followed in the spreadsheet itself.

## Checking it yourself

1. Export the workings for the plan you are looking at.
2. Open the Workings sheet and find the row.
3. Click any figure: the formula bar shows where it comes from. Follow it back
   through Blend inputs to Data sources, and through Rate build-up to the
   applicant tracking counts.
4. The few figures written as values (total spend from the split, the settings
   and the ranges) are listed at the top of the Workings sheet. Every formula
   is worked out when the file opens, and an automatic check recalculates the
   whole workbook and compares all of them with the plan.
