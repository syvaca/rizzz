import { Application, Container } from 'pixi.js';

export class PlayScene extends Container {

  constructor(
    private readonly app: Application,
    private readonly onStart: () => void
  ) {
    super();
  }

  public resize() {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
  }
}