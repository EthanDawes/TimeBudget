# Time Budget Tracker

A time tracking application that helps you manage your weekly time budget across categories and subcategories.

## Developing

```sh
pnpm i
pnpm dev

# To create a production version
npm run build
```

## Analisys
Use the export button on the bottom of the page.
Some computed fields that may be useful are provided:
- Duration is in days for convienent formatting as durations
- Excel hates ISO dates and uses funky epoch in 1900. Use `=DATEVALUE(LEFT(A1,10))` to convert to Excel dates
- Get the first day of the week: `=A1-WEEKDAY(A1,2)+1`
- Get the day of the week name: `=TEXT(A1,"dddd")`
- Get day of the week index (monday is 1): `=WEEKDAY(A1,2)`
