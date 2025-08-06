import { Application, Container, Sprite, Graphics, Assets, Text } from 'pixi.js';
import { GAMES, GameData } from '../data/games';
import { GamePopup } from '../components/GamePopup';
import { getUserCoins, subscribeToUser } from "../firebase";

export class MapMenuScene extends Container {
  private mapContainer!: Container;
  private mapSprite!: Sprite;
  private gameDots: Map<string, Graphics> = new Map();
  private gameLabels: Map<string, Text> = new Map();
  private currentPopup: GamePopup | null = null;
  private outsideClickHandler: (event: any) => void;
  
  // Coin display variables
  private coinContainer!: Container;
  private rubySprite!: Sprite;
  private coinText!: Text;
  
  // Scrolling variables
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private mapStart = { x: 0, y: 0 };
  
  // Zoom variables
  private zoomLevel = 1.5; // zoom level on map

  constructor(
    private readonly app: Application,
    private readonly onGameStart: (gameId: string) => void,
    private readonly userId: string
  ) {
    super();
    this.outsideClickHandler = this.handleOutsideClick.bind(this);
    this.createMap();
    this.setupScrolling();
    this.createCoinDisplay();
  }

  private async createMap() {
    try {
      const mapTexture = await Assets.load('/assets/sprites/map.png');
      this.mapSprite = new Sprite(mapTexture);
      
      // Create a container for the map and dots
      this.mapContainer = new Container();
      this.addChild(this.mapContainer);
      
      // Apply zoom to the map container
      this.mapContainer.scale.set(this.zoomLevel);
      
      // Add map to container
      this.mapContainer.addChild(this.mapSprite);
      
      // Create game dots after map is loaded
      this.createGameDots();
      
      // Center the map initially
      this.centerMap();
      
    } catch (error) {
      console.error('Could not load map texture:', error);
    }
  }

  private async createCoinDisplay() {
    try {
      // Create container for coin display
      this.coinContainer = new Container();
      
      // Load ruby sprite
      const rubyTexture = await Assets.load('/assets/sprites/ruby.png');
      this.rubySprite = new Sprite(rubyTexture);
      this.rubySprite.width = 32;
      this.rubySprite.height = 32;
      this.rubySprite.x = 0;
      this.rubySprite.y = 0;
      this.coinContainer.addChild(this.rubySprite);
      
      // Create coin text
      const coins = await getUserCoins(this.userId);
      this.coinText = new Text(`${coins}`, {
        fontFamily: 'Montserrat',
        fontSize: 24,
        fill: 0xffffff,
        fontWeight: 'bold'
      });
      this.coinText.x = 40; // Position after ruby sprite
      this.coinText.y = 5;
      this.coinContainer.addChild(this.coinText);
      
      // Position dynamically based on text width
      this.updateCoinDisplayPosition();
      
      this.addChild(this.coinContainer);
      
    } catch (error) {
      console.error('Could not create coin display:', error);
    }
  }

  private updateCoinDisplayPosition() {
    if (this.coinContainer && this.coinText) {
      // Calculate total width of the display (ruby + spacing + text)
      const totalWidth = 40 + this.coinText.width; // 40px for ruby + spacing
      const padding = 20; // Padding from screen edge
      
      // Position from right edge, ensuring it doesn't go off screen
      this.coinContainer.x = this.app.renderer.width - totalWidth - padding;
      this.coinContainer.y = 20;
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

      // Position dots at their map coordinates (not scaled)
      dot.x = game.mapPosition.x;
      dot.y = game.mapPosition.y;
      
      dot.eventMode = 'static';
      dot.cursor = 'pointer';
      dot.on('pointerdown', () => {
        console.log('Game dot clicked:', game.name);
        // Convert dot position to screen coordinates for popup
        const globalPos = this.mapContainer.toGlobal({ x: dot.x, y: dot.y });
        this.showGamePopup(game, globalPos.x, globalPos.y);
      });

      this.gameDots.set(game.id, dot);
      this.mapContainer.addChild(dot);

      // Add game name label
      const label = new Text(game.name, {
        fontSize: 12,
        fill: 0xffffff,
        fontWeight: 'bold'
      });
      label.x = dot.x + 15;
      label.y = dot.y - 8;
      this.mapContainer.addChild(label);
      this.gameLabels.set(game.id, label);
    });
  }

  private setupScrolling() {
    // Make the scene interactive for dragging
    this.eventMode = 'static';
    
    // Mouse/touch events for dragging
    this.on('pointerdown', this.onPointerDown.bind(this));
    this.on('pointermove', this.onPointerMove.bind(this));
    this.on('pointerup', this.onPointerUp.bind(this));
    this.on('pointerupoutside', this.onPointerUp.bind(this));
  }

  private onPointerDown(event: any) {
    this.isDragging = true;
    this.dragStart.x = event.global.x;
    this.dragStart.y = event.global.y;
    this.mapStart.x = this.mapContainer.x;
    this.mapStart.y = this.mapContainer.y;
  }

  private onPointerMove(event: any) {
    if (!this.isDragging) return;
    
    const deltaX = event.global.x - this.dragStart.x;
    const deltaY = event.global.y - this.dragStart.y;
    
    let newX = this.mapStart.x + deltaX;
    let newY = this.mapStart.y + deltaY;
    
    // Constrain the map to stay within bounds (accounting for zoom)
    const mapWidth = 1024 * this.zoomLevel;
    const mapHeight = 1024 * this.zoomLevel;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Left boundary - map left edge should not go beyond viewport left
    if (newX > 0) {
      newX = 0;
    }
    
    // Right boundary - map right edge should not go beyond viewport right
    if (newX < viewportWidth - mapWidth) {
      newX = viewportWidth - mapWidth;
    }
    
    // Top boundary - map top edge should not go beyond viewport top
    if (newY > 0) {
      newY = 0;
    }
    
    // Bottom boundary - map bottom edge should not go beyond viewport bottom
    if (newY < viewportHeight - mapHeight) {
      newY = viewportHeight - mapHeight;
    }
    
    this.mapContainer.x = newX;
    this.mapContainer.y = newY;
  }

  private onPointerUp() {
    this.isDragging = false;
  }

  private centerMap() {
    // Center the map in the viewport, but respect boundaries (accounting for zoom)
    const mapWidth = 1024 * this.zoomLevel;
    const mapHeight = 1024 * this.zoomLevel;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let centerX = (viewportWidth - mapWidth) / 2;
    let centerY = (viewportHeight - mapHeight) / 2;
    
    // Apply the same boundary constraints
    if (centerX > 0) {
      centerX = 0;
    }
    if (centerX < viewportWidth - mapWidth) {
      centerX = viewportWidth - mapWidth;
    }
    if (centerY > 0) {
      centerY = 0;
    }
    if (centerY < viewportHeight - mapHeight) {
      centerY = viewportHeight - mapHeight;
    }
    
    this.mapContainer.x = centerX;
    this.mapContainer.y = centerY;
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
    
    // Reposition coin display in upper right corner
    if (this.coinContainer) {
      this.updateCoinDisplayPosition();
    }
  }
} 