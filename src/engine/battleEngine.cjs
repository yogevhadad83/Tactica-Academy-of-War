// Shim that points any legacy CommonJS consumers to the up-to-date bundled engine.
// This prevents stale logic (like outdated targeting rules) from being used when
// a build artifact accidentally imports this file instead of the compiled bundle.
let engine; // eslint-disable-line @typescript-eslint/init-declarations

try {
  engine = require('../../dist/engine/battleEngine.cjs');
} catch (distErr) {
  try {
    // Fallback to the TypeScript source when the bundle is missing during dev.
    engine = require('./battleEngine.ts');
  } catch (tsErr) {
    distErr.message = `Failed to load dist/engine/battleEngine.cjs and fallback to TS: ${distErr.message}`;
    throw distErr;
  }
}

module.exports = engine;
