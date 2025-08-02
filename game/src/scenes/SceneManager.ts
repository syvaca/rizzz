import { Application, Container } from 'pixi.js';

export interface ResizableScene extends Container {
  resize(): void;
}

export class SceneManager {
  private currentScene?: ResizableScene;
  private readonly resizeHandler = () => this.resizeCurrentScene();

  constructor(private readonly app: Application) {
    window.addEventListener('resize', this.resizeHandler);
  }

  changeScene(newScene: ResizableScene) {
    // Remove current scene
    if (this.currentScene) {
      this.app.stage.removeChild(this.currentScene);
      this.currentScene.destroy({ children: true });
    }

    // Set and add new scene
    this.currentScene = newScene;
    this.app.stage.addChild(newScene);

    // Resize immediately to fit current window size
    this.resizeCurrentScene();
  }

  private resizeCurrentScene() {
    if (!this.currentScene) return;

    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.currentScene.resize();
  }

  destroy() {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.currentScene) {
      this.currentScene.destroy({ children: true, texture: true });
      this.currentScene = undefined;
    }
    this.app.destroy(true, { children: true, texture: true });
  }
}
