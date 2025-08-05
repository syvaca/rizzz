import * as PIXI from 'pixi.js';
import { FallingItem } from './FallingItem';
import { PowerUp, type PowerUpType } from './PowerUp';
import { ResizableScene } from '../../SceneManager';
import { getUserCoins, updateUserCoins } from '../../../firebase';

export class FloatFrenzy extends PIXI.Container {
  private items: FallingItem[] = [];
  public gravity = 100;      // px per ms²
  private spawnTimer = 0;
  private spawnDelay = 3000 + Math.random() * 1000;  // ms; random between 3–4s
  private elapsed = 0;
  private app: PIXI.Application;
  private userId: string;
  private isMobile: boolean;
  private showMapMenu: () => void;

  // Powerup spawning system
  private powerupSpawnTimer = 0;
  private powerupSpawnDelay = 30000; // 60 seconds (1 minute)

  // Game state and screen containers
  private state: 'START' | 'PLAYING' | 'GAME_OVER' = 'START';
  private startContainer!: PIXI.Container;
  private endContainer!: PIXI.Container;

  // Score tracking
  private score = 0;
  private scoreText!: PIXI.Text;
  private rubySprite!: PIXI.Sprite;
  private endScoreText!: PIXI.Text;

  // Powerup items
  private powerupItems: FallingItem[] = [];

  // Safety net tracking
  public safetyNet: { sprite: PIXI.Sprite; active: boolean } | null = null;

  // Texture atlas
  private textureAtlas: PIXI.Spritesheet | null = null;

  constructor(app: PIXI.Application, userId: string, showMapMenu: () => void, isMobile: boolean = false) {
    super();
    this.app = app;
    this.userId = userId;
    this.showMapMenu = showMapMenu;
    this.isMobile = isMobile;
    this.interactive = true;
    this.on('pointerdown', this.handlePointerDown);

    // Set up basic scene structure immediately (synchronously)
    this.setupBackground();
    this.setupScoreDisplay();
    this.setupStartScreen();
    this.setupEndScreen();
    this.showStartScreen();

    // Load texture atlas and update sprites asynchronously
    this.loadTextureAtlas();

    // Add game loop to ticker
    this.app.ticker.add(this.gameLoop);
  }

  private gameLoop = (ticker: PIXI.Ticker) => {
    this.update(ticker.deltaMS);
  };

  private async loadTextureAtlas(): Promise<void> {
    try {
      // Load the texture atlas
      const atlasData = await PIXI.Assets.load('./assets/sprites/floatFrenzySprites/floatFrenzyVisuals.json');
      this.textureAtlas = atlasData;
      console.log('FloatFrenzy texture atlas loaded successfully');
      
      // Update existing sprites with atlas textures
      this.updateSpritesWithAtlas();
    } catch (error) {
      console.error('Failed to load FloatFrenzy texture atlas:', error);
      // Fallback to individual textures if atlas fails to load
      this.textureAtlas = null;
    }
  }

  private updateSpritesWithAtlas(): void {
    // Update background sprite if atlas is loaded
    const bgSprite = this.app.stage.getChildAt(0) as PIXI.Sprite;
    if (bgSprite && this.textureAtlas && this.textureAtlas.textures['floatFrenzyBackground.png']) {
      bgSprite.texture = this.textureAtlas.textures['floatFrenzyBackground.png'];
    }
  }

  private getTexture(textureName: string): PIXI.Texture {
    if (this.textureAtlas && this.textureAtlas.textures[textureName]) {
      return this.textureAtlas.textures[textureName];
    }
    // Fallback to loading individual texture
    return PIXI.Texture.from(textureName);
  }

  private setupBackground() {
    const bg = new PIXI.Sprite(this.getTexture('floatFrenzyBackground'));

    // Get the texture dimensions
    const { width: imgW, height: imgH } = bg.texture.frame;
    
    // Calculate aspect ratios
    const bgAspectRatio = imgW / imgH;
    const screenAspectRatio = this.app.screen.width / this.app.screen.height;
    
    if (bgAspectRatio > screenAspectRatio) {
      // Background is wider than screen - fit to height and crop width
      bg.height = this.app.screen.height;
      bg.width = bg.height * bgAspectRatio;
      bg.x = (this.app.screen.width - bg.width) / 2;
      bg.y = 0;
    } else {
      // Background is taller than screen - fit to width and crop height
      bg.width = this.app.screen.width;
      bg.height = bg.width / bgAspectRatio;
      bg.x = 0;
      bg.y = (this.app.screen.height - bg.height) / 2;
    }
    
    // Add to bottom of display list so other elements appear on top
    this.app.stage.addChildAt(bg, 0);
  }

  private async setupScoreDisplay() {
    // Load ruby texture
    const rubyTexture = await PIXI.Assets.load('/assets/sprites/ruby.png');
    this.rubySprite = new PIXI.Sprite(rubyTexture);
    this.rubySprite.width = 32;
    this.rubySprite.height = 32;
    
    // Scale font size based on screen width for better mobile responsiveness
    const baseFontSize = this.isMobile ? 28 : 28;
    const scaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
    const fontSize = Math.max(20, baseFontSize * scaleFactor);
    
    this.scoreText = new PIXI.Text('0', { 
      fontSize, 
      fill: 0xffffff, 
      fontFamily: 'SuperWater' 
    });
    
    // Position ruby and score in top-right with responsive margins
    const margin = this.isMobile ? 15 : 30;
    this.rubySprite.x = this.app.screen.width - 120 - margin;
    this.rubySprite.y = margin;
    this.scoreText.x = this.rubySprite.x + 40;
    this.scoreText.y = this.rubySprite.y - 5;
    
    this.addChild(this.rubySprite);
    this.addChild(this.scoreText);
  }

  update(deltaMS: number) {
    if (this.state !== 'PLAYING') return;

    this.elapsed    += deltaMS;
    this.spawnTimer += deltaMS;
    this.powerupSpawnTimer += deltaMS;

    if (this.spawnTimer > this.spawnDelay) {
      this.spawnTimer = 0;
      // schedule next spawn in 3–4 seconds
      this.spawnDelay = 3000 + Math.random() * 1000;
      this.addItem();
    }

    if (this.powerupSpawnTimer > this.powerupSpawnDelay) {
      this.powerupSpawnTimer = 0;
      // schedule next powerup spawn in 1 minute
      this.powerupSpawnDelay = 60000;
      this.addPowerupItem();
    }

    const dtSec = deltaMS / 1000;
    for (const item of [...this.items]) {
      item.update(dtSec, this.gravity);

      // Check collision with safety net first (but skip for bombs)
      if (
        this.safetyNet &&
        this.safetyNet.active &&
        item.itemType !== 'Bomb.png' &&
        !item.isCaught &&        
        item.velocityY > 0        // ← only catch if it’s moving downward
      ) {
        const itemBounds = item.getBounds();
        const netBounds = this.safetyNet.sprite.getBounds();
        if (
          itemBounds.x < netBounds.x + netBounds.width &&
          itemBounds.x + itemBounds.width > netBounds.x &&
          itemBounds.y < netBounds.y + netBounds.height &&
          itemBounds.y + itemBounds.height > netBounds.y
        ) {
          item.catch();
          item.y = netBounds.y - item.height/2 + 100;
          this.app.stage.setChildIndex(item, this.app.stage.children.length - 1);
          continue;
        }
      }

      // Off‑screen check (bottom edge) - only end game for non-bomb items
      if (item.y - item.height / 2 > this.app.screen.height) {
        if (item.itemType === 'Bomb.png') {
          // Bombs fall harmlessly off screen - just remove them
          this.app.stage.removeChild(item);
          this.items = this.items.filter(i => i !== item);
        } else {
          // Regular items falling off screen end the game
          this.endGame();
          return;
        }
      }

      // Check collision with static power-up icons (but skip for bombs)
      if (item.itemType !== 'Bomb.png') {
        for (const powerup of [...this.powerupItems]) {
          const itemBounds = item.getBounds();
          const powerupBounds = powerup.getBounds();
          if (
            itemBounds.x < powerupBounds.x + powerupBounds.width &&
            itemBounds.x + itemBounds.width > powerupBounds.x &&
            itemBounds.y < powerupBounds.y + powerupBounds.height &&
            itemBounds.y + itemBounds.height > powerupBounds.y
          ) {
            // Grant power-up and remove icon
            this.activatePowerUp(powerup.itemType);
            this.app.stage.removeChild(powerup);
            this.powerupItems = this.powerupItems.filter(i => i !== powerup);
            break;
          }
        }
      }
    }
  }

  private addItem() {
    const textures = ['Barrel_1.png', 'Barrel_2.png', 'Bomb.png', 'Anchor.png', 'Seaweed_2.png'];   // aliases
    const selectedTexture = textures[Math.floor(Math.random() * textures.length)];
    const tex = this.getTexture(selectedTexture);
    const sprite = new FallingItem(tex, selectedTexture);
    sprite.scale.set(0.5, 0.5); // Scale up 4x
    sprite.x = Math.random() * this.app.screen.width;
    sprite.y = -sprite.height / 2;
    this.app.stage.addChild(sprite);
    sprite.eventMode = 'static';
    sprite.on('pointerdown', (e: any) => {
      e.stopPropagation(); // Prevent global handler from also firing
      if (selectedTexture === 'Bomb.png') {
        // Bomb clicked - play explosion animation then end game
        this.playExplosionAnimation(sprite, () => {
          this.endGame();
        });
      } else {
        // Regular item clicked - kick and add score
        sprite.kick();
        this.addScore(10);
      }
    });
    this.items.push(sprite);
  }

  private addPowerupItem() {
    const textures = ['Shield.png', 'Pearl.png'];   // aliases
    const selectedTexture = textures[Math.floor(Math.random() * textures.length)];
    const tex = this.getTexture(selectedTexture);
    const sprite = new FallingItem(tex, selectedTexture);
    sprite.scale.set(0.3, 0.3); // Smaller scale for powerup icons
    
    // Position powerups as static icons on the screen (not above it)
    sprite.x = 50 + Math.random() * (this.app.screen.width - 100); // Keep away from edges
    sprite.y = 100 + Math.random() * (this.app.screen.height - 200); // Position in middle area
    
    // Stop powerups from falling by catching them immediately
    sprite.catch();
    
    this.app.stage.addChild(sprite);
    sprite.eventMode = 'static';
    sprite.on('pointerdown', (e: any) => {
      e.stopPropagation(); // Prevent global handler from also firing
      // Powerup clicked - activate powerup
      this.activatePowerUp(selectedTexture);
      this.app.stage.removeChild(sprite);
      this.powerupItems = this.powerupItems.filter(i => i !== sprite);
    });
    this.powerupItems.push(sprite);
  }

  private handlePointerDown = (e: PIXI.FederatedPointerEvent) => {
    // Stop event from bubbling up to MapMenuScene
    e.stopPropagation();
    
    if (this.state !== 'PLAYING') return;
    const pos = e.global;

    // 1) First: see if you clicked any *caught* item to collect it
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.isCaught && item.containsPoint(pos)) {
        item.kick();        // send it flying again
        this.addScore(10);  // award points
        return;
      }
    }

    // 2) Otherwise: see if you clicked any *falling* item to kick it
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item.isCaught && item.containsPoint(pos)) {
        item.kick();
        this.addScore(10);
        return;
      }
    }
  };

  private startGame() {
    // Reset game variables
    this.state = 'PLAYING';
    this.score = 0;
    this.scoreText.text = this.score.toString();
    this.gravity = 100;
    this.spawnTimer = 0;
    this.spawnDelay = 3000 + Math.random() * 1000;
    this.powerupSpawnTimer = 0;
    this.powerupSpawnDelay = 60000;
    this.items.forEach(i => i.destroy());
    this.items = [];
    this.powerupItems.forEach(i => i.destroy());
    this.powerupItems = [];

    // Hide screens
    this.startContainer.visible = false;
    this.endContainer.visible = false;
  }

  private async endGame() {
    this.state = 'GAME_OVER';
    
    // Add score to user's rubies if they scored points
    if (this.score > 0) {
      try {
        const currentCoins = await getUserCoins(this.userId);
        await updateUserCoins(this.userId, this.score);
        console.log(`Added ${this.score} points to user's rubies. New total: ${currentCoins + this.score}`);
      } catch (error) {
        console.error('Failed to update user coins:', error);
      }
    }
    
    // Clear items
    this.items.forEach(i => i.destroy());
    this.items = [];
    this.powerupItems.forEach(i => i.destroy());
    this.powerupItems = [];
    
    // Return to map instead of showing game over screen
    setTimeout(() => {
      this.showMapMenu();
    }, 1000); // Brief delay to let any animations finish
  }

  // === Power‑ups ===
  public activatePowerUp(type: string) {
    // Map texture names to powerup types
    let powerupType: PowerUpType;
    let displayName: string;
    if (type === 'Shield.png') {
      powerupType = 'SAFETY_NET';
      displayName = 'Safety Net';
    } else if (type === 'Pearl.png') {
      powerupType = 'SLOW_GRAVITY';
      displayName = 'Slow Gravity';
    } else {
      // Handle legacy string types
      powerupType = type as PowerUpType;
      displayName = type;
    }
    
    // Show popup notification
    this.showPowerUpNotification(displayName);
    
    new PowerUp(powerupType, this).apply();
  }

  private showPowerUpNotification(powerupName: string) {
    // Create notification text with larger, more visible styling
    const baseFontSize = this.isMobile ? 32 : 48;
    const scaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
    const fontSize = Math.max(24, baseFontSize * scaleFactor);
    
    const notification = new PIXI.Text(powerupName, {
      fontSize,
      fill: 0xFFFF00, // Bright yellow for better visibility
      fontFamily: 'SuperWater',
      stroke: 0x000000
    });
    
    notification.anchor.set(0.5);
    notification.x = this.app.screen.width / 2;
    notification.y = this.app.screen.height / 3; // Position higher up for better visibility
    notification.alpha = 1; // Start fully visible
    
    // Add to stage at the top level to ensure it's visible
    this.app.stage.addChild(notification);
    
    // Simple timeout to remove the notification after 2 seconds
    setTimeout(() => {
      if (notification.parent) {
        this.app.stage.removeChild(notification);
      }
    }, 2000);
  }

  // Increment score and update display
  private addScore(points: number) {
    this.score += points;
    this.scoreText.text = this.score.toString();
  }

  private setupStartScreen() {
    this.startContainer = new PIXI.Container();
    // semi-transparent bg
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.7);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    this.startContainer.addChild(bg);

    // Title with responsive font size based on screen dimensions
    const baseTitleSize = this.isMobile ? 36 : 72;
    const titleScaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
    const titleFontSize = Math.max(24, baseTitleSize * titleScaleFactor);
    
    const title = new PIXI.Text('Float Frenzy', { 
      fontSize: titleFontSize, 
      fill: 0xffffff, 
      fontFamily: 'SuperWater' 
    });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.app.screen.height / 2 - (this.isMobile ? 120 : 150);
    this.startContainer.addChild(title);

    // Game instructions with responsive font size
    const baseInstructionSize = this.isMobile ? 16 : 24;
    const instructionScaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
    const instructionFontSize = Math.max(12, baseInstructionSize * instructionScaleFactor);
    
    const instructions = new PIXI.Text('Tap falling objects to keep them afloat\nbut don\'t tap the bombs!', { 
      fontSize: instructionFontSize, 
      fill: 0xffffff, 
      fontFamily: 'SuperWater',
      align: 'center'
    });
    instructions.anchor.set(0.5);
    instructions.x = this.app.screen.width / 2;
    instructions.y = this.app.screen.height / 2 - (this.isMobile ? 20 : 30);
    this.startContainer.addChild(instructions);

    // Start prompt with responsive font size
    const basePromptSize = this.isMobile ? 20 : 36;
    const promptScaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
    const promptFontSize = Math.max(16, basePromptSize * promptScaleFactor);
    
    const prompt = new PIXI.Text('Tap to Start', { 
      fontSize: promptFontSize, 
      fill: 0xffffff, 
      fontFamily: 'SuperWater' 
    });
    prompt.anchor.set(0.5);
    prompt.x = this.app.screen.width / 2;
    prompt.y = this.app.screen.height / 2 + (this.isMobile ? 60 : 80);
    this.startContainer.addChild(prompt);

    // Input
    this.startContainer.eventMode = 'static';
    this.startContainer.on('pointerdown', () => this.startGame());

    this.addChild(this.startContainer);
  }

  private setupEndScreen() {
    this.endContainer = new PIXI.Container();
    this.endContainer.visible = false;

    // semi-transparent bg
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.7);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    this.endContainer.addChild(bg);

    // Game Over text with responsive font size
    const baseEndTitleSize = this.isMobile ? 32 : 64;
    const endTitleScaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
    const endTitleFontSize = Math.max(20, baseEndTitleSize * endTitleScaleFactor);
    
    const endTitle = new PIXI.Text('Game Over', { 
      fontSize: endTitleFontSize, 
      fill: 0xff0000, 
      fontFamily: 'SuperWater' 
    });
    endTitle.anchor.set(0.5);
    endTitle.x = this.app.screen.width / 2;
    endTitle.y = this.app.screen.height / 2 - (this.isMobile ? 60 : 100);
    this.endContainer.addChild(endTitle);

    // Score display with responsive font size
    const baseScoreSize = this.isMobile ? 24 : 48;
    const scoreScaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
    const scoreFontSize = Math.max(18, baseScoreSize * scoreScaleFactor);
    
    this.endScoreText = new PIXI.Text('Score: 0', { 
      fontSize: scoreFontSize, 
      fill: 0xffffff, 
      fontFamily: 'SuperWater' 
    });
    this.endScoreText.anchor.set(0.5);
    this.endScoreText.x = this.app.screen.width / 2;
    this.endScoreText.y = this.app.screen.height / 2;
    this.endContainer.addChild(this.endScoreText);

    // Restart prompt with responsive font size
    const baseRestartSize = this.isMobile ? 20 : 36;
    const restartScaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
    const restartFontSize = Math.max(16, baseRestartSize * restartScaleFactor);
    
    const restart = new PIXI.Text('Tap to Restart', { 
      fontSize: restartFontSize, 
      fill: 0xffffff, 
      fontFamily: 'SuperWater' 
    });
    restart.anchor.set(0.5);
    restart.x = this.app.screen.width / 2;
    restart.y = this.app.screen.height / 2 + (this.isMobile ? 60 : 100);
    this.endContainer.addChild(restart);

    // Input
    this.endContainer.eventMode = 'static';
    this.endContainer.on('pointerdown', () => this.startGame());

    this.app.stage.addChild(this.endContainer);
  }

  private showStartScreen() {
    this.state = 'START';
    this.startContainer.visible = true;
    this.endContainer.visible = false;
  }

  private playExplosionAnimation(sprite: FallingItem, callback: () => void) {
    // Create explosion sprite at the bomb's position
    const explosionSprite = new PIXI.Sprite(this.getTexture('explosion.png'));
    explosionSprite.anchor.set(0.5);
    explosionSprite.x = sprite.x;
    explosionSprite.y = sprite.y;
    explosionSprite.scale.set(0.5); // Adjust size as needed
    
    // Add explosion to this container
    this.addChild(explosionSprite);
    
    // Hide the original bomb
    sprite.visible = false;
    
    // Remove explosion after animation duration and call callback
    setTimeout(() => {
      this.removeChild(explosionSprite);
      callback();
    }, 500); // 500ms explosion duration
  }

  // Required by ResizableScene interface
  resize(): void {
    // Handle window resize - update positions and scales as needed
    if (this.rubySprite && this.scoreText) {
      const margin = this.isMobile ? 15 : 30;
      // Reposition ruby icon
      this.rubySprite.x = this.app.screen.width - 120 - margin;
      this.rubySprite.y = margin;
      // Reposition score text next to ruby
      this.scoreText.x = this.rubySprite.x + 40;
      this.scoreText.y = this.rubySprite.y - 5;
    }
  }

  // Clean up when scene is destroyed
  destroy(options?: any): void {
    this.app.ticker.remove(this.gameLoop);
    super.destroy(options);
  }
}
