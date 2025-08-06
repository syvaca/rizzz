import "./firebase"; 
import { Application, Assets } from 'pixi.js';
import { MapMenuScene } from './scenes/MapMenuScene';
import { SceneManager } from './scenes/SceneManager';
import { initAnonymousUser } from "./firebase"; 
import { getGameById } from './data/games';

async function bootstrap() {
  const container = document.getElementById('game-container');
  if (!container) {
    throw new Error('Game container element not found');
  }

  const app = new Application();
  await app.init({
    resizeTo: container,
    backgroundColor: 0x0,
    antialias: true,
    autoDensity: true,
  });

  container.appendChild(app.view);

  // get the user ID, or create a new anonymous user
  const user_id = await initAnonymousUser();
  console.log("Logged in as:", user_id);

  // Load assets
  await Assets.load([
    '/assets/sprites/map.png',
    '/assets/sprites/ruby.png',

    // Animal Finder
    { alias: 'animals', src: '/assets/sprites/animalFinderSprites/animals.json' },
    { alias: 'background', src: '/assets/sprites/animalFinderSprites/animalFinderBackground.png' },

    // Cosmo Climb
    { alias: 'cosmoClimbBackground', src: '/assets/sprites/cosmoClimbSprites/cosmoClimbBackground.png' },
    { alias: 'cosmoClimbVisuals', src: '/assets/sprites/cosmoClimbSprites/cosmoClimbVisuals.json' },

    // Float Frenzy
    { alias: 'floatFrenzyVisuals', src: '/assets/sprites/floatFrenzySprites/floatFrenzyVisuals.json' },
    { alias: 'floatFrenzyBackground', src: '/assets/sprites/floatFrenzySprites/floatFrenzyBackground.png' },

    // Quick Tap Poker
    { alias: 'quickTapPokerVisuals', src: '/assets/sprites/quickTapPokerSprites/quickTapPoker.json' },
    { alias: 'quickTapPokerBackground', src: '/assets/sprites/quickTapPokerSprites/quickTapPokerBackground.png' },

  ]);

  const sceneManager = new SceneManager(app);

  function showMapMenu() {
    const mapMenu = new MapMenuScene(
      app,
      (gameId) => {
        const gameData = getGameById(gameId);
        if (gameData && gameData.sceneClass) {
          // Create and show the game scene
          const gameScene = new gameData.sceneClass(app, user_id, showMapMenu);
          sceneManager.changeScene(gameScene);
        } else {
          console.warn('Game not implemented yet:', gameId);
        }
      },
      user_id
    );
    sceneManager.changeScene(mapMenu);
  }

  showMapMenu();
}

bootstrap();
