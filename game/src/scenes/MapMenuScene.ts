import { Application, Container, Sprite, Graphics, Assets, Text } from 'pixi.js';
import { GAMES, GameData } from '../data/games';
import { GamePopup } from '../components/GamePopup';

export class MapMenuScene extends Container {
  private mapSprite!: Sprite;
  private gameDots: Map<string, Graphics> = new Map();
  private currentPopup: GamePopup | null = null;
  private outsideClickHandler: (event: any) => void;

  constructor(
    private readonly app: Application,
    private readonly onGameStart: (gameId: string) => void
  ) {
    super();
    this.outsideClickHandler = this.handleOutsideClick.bind(this);
    this.createMap();
  }

  private async createMap() {
    try {
      const mapTexture = await Assets.load('/assets/sprites/map.png');
      this.mapSprite = new Sprite(mapTexture);
      
      // Scale map to fill the entire viewport
      const scaleX = window.innerWidth / this.mapSprite.width;
      const scaleY = window.innerHeight / this.mapSprite.height;
      const scale = Math.max(scaleX, scaleY); // Use the larger scale to fill entirely
      
      this.mapSprite.scale.set(scale);
      this.addChild(this.mapSprite);
      
      // Create game dots after map is loaded
      this.createGameDots();
      
    } catch (error) {
      console.error('Could not load map texture:', error);
    }
  }

  private createGameDots() {
    GAMES.forEach(game => {
      const dot = new Graphics()
        .beginFill(0xe74c3c)
        .drawCircle(0, 0, 8)
        .endFill()
        .lineStyle(2, 0xffffff)
        .drawCircle(0, 0, 8);

      // Position dots relative to the scaled and positioned map
      const mapScale = this.mapSprite.scale.x;
      dot.x = this.mapSprite.x + (game.mapPosition.x * mapScale);
      dot.y = this.mapSprite.y + (game.mapPosition.y * mapScale);
      
      dot.eventMode = 'static';
      dot.cursor = 'pointer';
      dot.on('pointerdown', () => {
        console.log('Game dot clicked:', game.name);
        this.showGamePopup(game, dot.x, dot.y);
      });

      this.gameDots.set(game.id, dot);
      this.addChild(dot);

      // Add game name label
      const label = new Text(game.name, {
        fontSize: 12,
        fill: 0xffffff,
        fontWeight: 'bold'
      });
      label.x = dot.x + 15;
      label.y = dot.y - 8;
      this.addChild(label);
    });
  }

  private async showGamePopup(gameData: GameData, dotX: number, dotY: number) {
    // Remove existing popup
    this.closePopup();

    // Create new popup
    this.currentPopup = new GamePopup(gameData, (gameId) => {
      console.log('Starting game:', gameId);
      this.onGameStart(gameId);
    }, () => {
      console.log('Closing popup');
      this.closePopup();
    }, dotX, dotY);
    
    // Wait a bit for the popup to be created
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.currentPopup.resize();
    this.addChild(this.currentPopup);
   
    // Add click listener to the app stage to handle outside clicks
    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointerdown', this.outsideClickHandler);
  }

  private handleOutsideClick(event: any) {
    if (this.currentPopup) {
      const popupBounds = this.currentPopup.getBounds();
      const globalX = event.global.x;
      const globalY = event.global.y;
      
      // Convert popup bounds to global coordinates
      const popupGlobalBounds = {
        left: this.currentPopup.x + popupBounds.left,
        right: this.currentPopup.x + popupBounds.right,
        top: this.currentPopup.y + popupBounds.top,
        bottom: this.currentPopup.y + popupBounds.bottom
      };
      
      if (globalX < popupGlobalBounds.left || globalX > popupGlobalBounds.right || 
          globalY < popupGlobalBounds.top || globalY > popupGlobalBounds.bottom) {
        this.closePopup();
      }
    }
  }

  private closePopup() {
    if (this.currentPopup) {
      this.removeChild(this.currentPopup);
      this.currentPopup.destroy();
      this.currentPopup = null;
      
      // Remove the stage click listener
      this.app.stage.off('pointerdown', this.outsideClickHandler);
    }
  }

  public resize() {
    // Reposition popup if it exists
    if (this.currentPopup) {
      this.currentPopup.resize();
    }
  }
} 