# Tactica Game Server

WebSocket server for multiplayer Tactica battles.

## Development

```bash
npm install      # Install dependencies
npm run dev      # Run development server with auto-reload
npm run build    # Build for production
npm start        # Start production server
```

## TypeScript Configuration

The server imports shared code from multiple locations in the monorepo:
- `../shared/*` - Shared code and definitions (e.g., unit definitions)
- `../dist/engine/battleEngine.cjs` - Generated battle engine bundle (falls back to TS source in dev)

The `tsconfig.json` is configured with:
- `rootDir: ".."` - Allows importing from parent directories
- `include: ["src/**/*", "../shared/**/*", "../src/engine/**/*.ts"]` - Includes all necessary source files
- `outDir: "dist"` - Output maintains the directory structure

**Important**: Do NOT change `rootDir` back to `"src"` as this will cause build failures when importing from `../shared` or `../src`.

## Deployment

The entry point is `dist/server/src/index.js` after building.
