import { Application, Assets } from 'pixi.js';
import { PlayScene }    from './scenes/Play';
import { SceneManager } from './scenes/SceneManager';

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

  // Load assets
  await Assets.load([
  ]);

  const sceneManager = new SceneManager(app);

  function showPlay() {
    const play = new PlayScene(
      app,
      () => {}
    );
    sceneManager.changeScene(play);
  }

  showPlay();
}

bootstrap();
