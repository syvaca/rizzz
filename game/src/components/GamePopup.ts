import { Container, Graphics, Text, Sprite, Assets } from 'pixi.js';
import { GameData } from '../data/games';

export class GamePopup extends Container {
  private background!: Graphics;
  private titleText!: Text;
  private playButton!: Graphics;
  private playButtonText!: Text;
  private thumbnail!: Sprite;
  private closeButton!: Graphics;
  private closeButtonText!: Text;
  private onPlay: (gameId: string) => void;
  private onClose: () => void;

  constructor(gameData: GameData, onPlay: (gameId: string) => void, onClose: () => void, dotX: number, dotY: number) {
    super();
    this.onPlay = onPlay;
    this.onClose = onClose;
    
    this.createPopup(gameData, dotX, dotY);
  }

  private async createPopup(gameData: GameData, dotX: number, dotY: number) {
    console.log('Creating popup for:', gameData.name);
    
    // Create background - taller for vertical layout
    this.background = new Graphics()
      .beginFill(0x2c3e50, 0.95)
      .drawRoundedRect(0, 0, 150, 180, 10)
      .endFill();
    this.addChild(this.background);
    console.log('Background created');

    // Create close button
    this.closeButton = new Graphics()
      .beginFill(0xe74c3c)
      .drawCircle(0, 0, 12)
      .endFill();
    
    this.closeButton.x = 125;
    this.closeButton.y = 15;
    this.closeButton.eventMode = 'static';
    this.closeButton.cursor = 'pointer';
    this.closeButton.on('pointerdown', () => {
      console.log('Close button clicked');
      this.onClose();
    });
    this.addChild(this.closeButton);

    // Create close button text
    this.closeButtonText = new Text('×', {
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: 'bold'
    });
    this.closeButtonText.x = 120;
    this.closeButtonText.y = 8;
    this.closeButtonText.eventMode = 'static';
    this.closeButtonText.cursor = 'pointer';
    this.closeButtonText.on('pointerdown', () => {
      console.log('Close text clicked');
      this.onClose();
    });
    this.addChild(this.closeButtonText);

    // Create title - centered at top
    this.titleText = new Text(gameData.name, {
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: 'bold'
    });
    this.titleText.x = 75 - (this.titleText.width / 2); // Center horizontally
    this.titleText.y = 25;
    this.addChild(this.titleText);

    // Try to load thumbnail - centered in middle
    try {
      const texture = await Assets.load(gameData.photo);
      this.thumbnail = new Sprite(texture);
      this.thumbnail.width = 80;
      this.thumbnail.height = 80;
      this.thumbnail.x = 35; // Center horizontally (150 - 80) / 2
      this.thumbnail.y = 50;
      this.addChild(this.thumbnail);
    } catch (error) {
      console.warn('Could not load thumbnail:', gameData.photo);
    }

    // Create play button - centered at bottom
    this.playButton = new Graphics()
      .beginFill(0x27ae60)
      .drawRoundedRect(35, 140, 80, 30, 8)
      .endFill();
    
    this.playButton.eventMode = 'static';
    this.playButton.cursor = 'pointer';
    this.playButton.on('pointerdown', () => {
      console.log('Play button clicked for game:', gameData.id);
      this.onPlay(gameData.id);
    });
    this.addChild(this.playButton);

    // Create play button text
    this.playButtonText = new Text('PLAY', {
      fontSize: 14,
      fill: 0xffffff,
      fontWeight: 'bold'
    });
    this.playButtonText.x = 57;
    this.playButtonText.y = 148;
    this.playButtonText.eventMode = 'static';
    this.playButtonText.cursor = 'pointer';
    this.playButtonText.on('pointerdown', () => {
      console.log('Play text clicked for game:', gameData.id);
      this.onPlay(gameData.id);
    });
    this.addChild(this.playButtonText);

    // Position popup near the dot
    this.positionNearDot(dotX, dotY);
  }

  private positionNearDot(dotX: number, dotY: number) {
    // Position popup near the dot, but ensure it stays on screen
    let popupX = dotX + 20; // Offset from dot
    let popupY = dotY - 90; // Above the dot (half height)
    
    // Ensure popup stays on screen
    if (popupX + this.width > window.innerWidth) {
      popupX = dotX - this.width - 20;
    }
    if (popupY < 0) {
      popupY = dotY + 20;
    }
    if (popupY + this.height > window.innerHeight) {
      popupY = window.innerHeight - this.height - 20;
    }
    
    this.x = popupX;
    this.y = popupY;
  }

  public resize() {
  }
} 