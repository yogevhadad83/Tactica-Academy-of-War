# Tactica: Academy of War

A browser-based PvP strategy game where players assemble an army, set behavior rules (no coding required), and send their forces into automatic battles on a 12×12 board.

## Development Setup

### Running the UI

The UI connects to a remote production server by default, so you don't need to run the server locally for frontend development.

```bash
npm install
npm run dev
```

### Using a Local Server (Optional)

If you need to test with a local backend server (located in the `./server` directory):

1. Create a `.env` file in the project root directory:
   ```bash
   VITE_USE_LOCAL_SERVER=true
   ```

2. Start the local server in a separate terminal:
   ```bash
   cd server
   npm install
   npm run dev
   ```
   The server will start on `http://localhost:4000`.

3. Start the UI:
   ```bash
   npm run dev
   ```

### Environment Variables

- `VITE_PRODUCTION_API_URL=<url>` - Override the default production server URL
- `VITE_USE_LOCAL_SERVER=true` - Connect to `http://localhost:4000` instead of production
- `VITE_API_URL=<url>` - Override with a custom API URL (takes precedence over all other settings)

See `.env.example` for more details.

## Vite + React

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## PVP Orientation & Mirroring

This project uses a deterministic, server-driven perspective for multiplayer battles.

- Coordinate system: `row 0` is top, `row BOARD_SIZE-1` is bottom; `col 0` is left.
- Canonical orientation in the engine: Team `player` is always south (bottom), Team `enemy` is always north (top).

Server responsibilities (authoritative):
- Pre-battle normalization: in `server/src/runBattle.ts`, Player A (challenger) stays as-is and is assigned team `player`. Player B (responder) is vertically mirrored using `BOARD_SIZE` and assigned team `enemy`.
- Post-battle per-player timelines: in `server/src/index.ts`, Player A receives the canonical timeline. Player B receives a vertically mirrored copy with team labels swapped. Implemented via `mirrorTimelineForPlayerB` in `server/src/runBattle.ts`.

Client responsibilities:
- No mirroring is applied on the client. `src/utils/transformTimelineForPerspective.ts` is a no-op now, and `src/pages/BoardView.tsx` consumes the timeline from the server as-is.

Concrete validation case (BOARD_SIZE=12 → MAX_ROW=11):
- Input: A places a knight at `(11,0)`; B places a beast at `(11,0)`.
- Engine sees: knight at `(11,0)` team `player`; beast at `(0,0)` team `enemy`.
- Player A sees: knight `(11,0)`, beast `(0,0)`.
- Player B sees: beast `(11,0)`, knight `(0,0)`.

Files of interest:
- `server/src/runBattle.ts`: pre-battle normalization and `mirrorTimelineForPlayerB`.
- `server/src/index.ts`: sends canonical timeline to A and mirrored to B.
- `src/pages/BoardView.tsx`: uses server timeline as-is, no transforms.

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
