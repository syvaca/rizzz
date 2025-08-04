# Mini Games App

A map-based menu system for multiple mini-games built with PixiJS and TypeScript.

## Project Structure

```
public/
├── assets/                     # all game assets
│   ├── games-thumbnails/       # Game logos for map
│   └── sprites/                # spritesheets for games
│       ├── animalFinderSprites/
│       └── cosmoClimbSprites/ 
src/
├── main.ts                     # Main entry point
├── data/
│   └── games.ts                # Game data and configuration
├── components/
│   └── GamePopup.ts            # Reusable popup component
├── scenes/
│   ├── SceneManager.ts         # Scene management system
│   ├── MapMenuScene.ts         # Interactive map menu
│   └── games/                  # Individual game scenes
│       ├── animalFinder/       # animal finder game directory
│       └── cosmoClimb/         # comso climb directory
```

## How It Works

1. **Map Menu**: Users can drag around a zoomed-in map to explore different areas
2. **Game Dots**: Red dots on the map represent different games
3. **Popups**: Clicking a dot shows a popup with game info and play button
4. **Game Scenes**: Each game is its own scene

## Adding New Games

### 1. Create the Game Scene
Create a new directory in `src/scenes/games/` with a file game play following the template:

```typescript
import { Application } from 'pixi.js';
import { GameScene } from './GameTemplate';

export class YourGameName extends GameScene {
  constructor(app: Application, private readonly userId: string, onBackToMenu: () => void) {
    super(app, onBackToMenu, 'Your Game Name');
    this.initializeGame();
  }

  protected initializeGame(): void {
    // Your game initialization code
  }

  protected updateGame(deltaTime: number): void {
    // Your game update logic
  }
}
```

### 2. Add your Sprites
Create a new directory in `public/assets/sprites/` with name YourGameNameSprites

In `src/main.ts` load in your sprites as is
```typescript
// Load assets
await Assets.load([
  // ... existing assets

  // Your Game
  { alias: 'yourGameSpritesheet', src: '/assets/sprites/yourGameSprites/yourGameSpriteSheet.json' },
]);
```

### 3. Add Thumbnail
Place a thumbnail image in `public/assets/game-thumbnails/` with the same name as specified in the game data.

### 4. Add Game Data
Update `src/data/games.ts` to include your game:

```typescript
import { YourGameName } from '../scenes/games/YourGameDiretory/YourGameName';

export const GAMES: GameData[] = [
  // ... existing games
  {
    id: 'your-game-id',
    name: 'Your Game Name',
    description: 'Description of your game',
    photo: '/assets/game-thumbnails/your-game.png',
    mapPosition: { x: 300, y: 200 }, // edit to be where you want it on the map
    sceneClass: YourGameName
  }
];
```


## Features

- **Interactive Dots**: Click red dots to see game information
- **Game Popups**: Shows game name, thumbnail, and play button
- **Scene Management**: Smooth transitions between menu and games
- **Responsive**: Adapts to different screen sizes
- **Back Navigation**: Easy return to menu from any game
- **Draggable Map**: Users can pan around the map to explore

## Running the Project
### Prerequisites
| Tool | Version | Notes |
|------|---------|-------|
| **Git** | ≥ 2.22.0 | clones repo into local environment |
| **Node.js** | ≥ 20 | installs both bot & game deps |
| **npm** | ≥ 10 | comes with modern Node |

### 1  Clone & Install
```bash
# clone
git clone https://github.com/syvaca/rizzz.git
cd rizzz

# install game deps
cd game && npm ci
```

### 2  Start Stack
```bash
# start game (vite hot-reload)
npm run dev -- --host 0.0.0.0 --port 5173
```
Open `http://localhost:5173` to play.

---

## Scripts
| Script | Location | Purpose |
|--------|----------|---------|
| `npm run dev` | `game/` | Vite dev server (Pixi client) |
| `npm run build` | `game/` | Production build → `./dist/` |
| `npm run test` | _coming soon_ | Vitest suite |
| `npm run lint` | _coming soon_ | ESLint strict mode |

---

## Customization

- **Map**: Replace `public/assets/sprites/map.png` with your own map
- **Game Positions**: Update `mapPosition` in `games.ts` to place dots where you want
- **Styling**: Modify colors and styles in `GamePopup.ts` and `MapMenuScene.ts`
- **Game Template**: Extend `GameTemplate.ts` for consistent game structure 