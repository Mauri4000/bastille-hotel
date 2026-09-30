# Bastille Hotel – E2E Automation Framework

BDD framework using **Playwright + Cucumber (Gherkin)** and **TypeScript**.

## Stack

| Tool | Purpose |
|------|---------|
| [Playwright](https://playwright.dev/) | Browser automation |
| [@cucumber/cucumber](https://cucumber.io/) | BDD / Gherkin runner |
| TypeScript | Type-safe step definitions |
| ts-node | Run TypeScript without compiling |

## Folder structure

```
e2e/
├── features/         # Gherkin feature files (.feature)
│   ├── auth/         # Login scenarios
│   ├── calendar/     # Calendar page scenarios
│   └── shift/        # Shift handover scenarios
├── steps/            # Step definitions (1 file per feature)
│   ├── auth/
│   ├── calendar/
│   └── shift/
├── pages/            # Page Object Model classes
│   ├── BasePage.ts   # Abstract base – all pages extend this
│   ├── LoginPage.ts
│   ├── CalendarPage.ts
│   └── ShiftPage.ts
├── hooks/
│   └── hooks.ts      # Before/After – browser init + screenshot on fail
├── world/
│   └── CustomWorld.ts # Cucumber World – holds page, browser, context
├── utils/
│   ├── Config.ts     # Reads .env – single source of truth for config
│   └── Helpers.ts    # waitForUrl, takeScreenshot, etc.
├── reports/          # Generated after each run (ignored by git)
├── .env.example      # Copy to .env and fill in real values
├── cucumber.json     # Profiles: default, smoke, e2e, regression
├── tsconfig.json
└── package.json
```

## Setup (first time)

```bash
# 1. Go into the e2e folder
cd e2e

# 2. Install dependencies
npm install

# 3. Install Chromium browser
npm run install:browsers

# 4. Create your .env file
cp .env.example .env
# Edit .env with the real BASE_URL, TEST_EMAIL, TEST_PASSWORD
```

## Running tests

```bash
# All tests (default profile)
npm test

# Only smoke tests (fast, critical path)
npm run test:smoke

# Full E2E suite
npm run test:e2e

# Smoke + E2E (regression)
npm run test:regression

# TypeScript check (no tests run)
npm run ts:check
```

## Tags

| Tag | When to use |
|-----|-------------|
| `@smoke` | Critical path – runs on every deploy |
| `@e2e` | Full user flows |
| `@negative` | Error/validation scenarios |

## Design patterns

- **Page Object Model (POM)** – each page = one class in `pages/`
- **Inheritance** – all pages extend `BasePage`
- **Thin steps** – steps only call Page Object methods, no raw Playwright in steps
- **World** – `CustomWorld` holds `page` and `browser` accessible from every step via `this`
- **Config singleton** – `Config.ts` reads `.env` once at startup

## Reports

After each run, HTML reports are saved in `reports/`:
- `smoke-report.html`
- `e2e-report.html`
- `cucumber-report.html`

Failed scenarios automatically attach a full-page PNG screenshot.
