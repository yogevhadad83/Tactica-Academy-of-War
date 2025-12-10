# Build and Lint Verification Guide

This guide shows you how to verify the TypeScript build and linting locally to catch issues before pushing to Render.

## Prerequisites

Make sure you have Node.js installed and dependencies are up to date:

```bash
npm install
```

## Verifying the Build

To check if your code will build successfully (this is what Render runs):

```bash
npm run build
```

This command will:
1. Extract animation metadata
2. Run TypeScript type checking (`tsc -b`)
3. Build the production bundle with Vite

If there are TypeScript errors, they will be displayed here.

## Running the Linter

To check code quality and catch common issues:

```bash
npm run lint
```

This will run ESLint on your codebase and report any issues.

## Running Tests

To ensure your changes don't break existing functionality:

```bash
npm test
```

Or to run specific test files:

```bash
npx tsx --test tests/*.test.ts
```

## Quick Type Check Only

If you only want to verify TypeScript types without building:

```bash
npx tsc -b
```

This is faster than a full build and will catch type errors like the `refreshArmy` issue.

## Development Workflow

For the best development experience:

1. **During development**: Run `npm run dev` to start the dev server with hot reload
2. **Before committing**: Run `npm run build` and `npm test` to catch issues early
3. **For code quality**: Run `npm run lint` periodically

## Issue Fixed

The build was failing with:
```
error TS2353: Object literal may only specify known properties, and 'refreshArmy' does not exist in type 'UsePlayerArmyResult'.
```

This has been fixed by adding `refreshArmy: () => void;` to the `UsePlayerArmyResult` type definition in `src/hooks/usePlayerArmy.ts`.

You can now verify locally by running `npm run build` or `npx tsc -b`.
