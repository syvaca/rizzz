import { Application, Container, Sprite, Text, TextStyle, TilingSprite, Graphics, Spritesheet, Rectangle, Ticker, Assets, Texture } from 'pixi.js';
import { ResizableScene } from '../../SceneManager';
import { 
  getUserRubies, 
  updateUserRubies, 
  getUserHighScore, 
  updateUserHighScore, 
  updateUserPowerups,
  getUserPowerups,
  subscribeToUser,
  usePowerup
} from '../../../firebase';

type PowerupType = 'multiplier' | 'extra-life' | 'betting';


interface Monster {
  sprite: Sprite;
  isHitByRocket: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Powerup {
  sprite: Sprite;
  type: 'rocket' | 'powercell' | 'multiplier' | 'extra-life' | 'betting';
}

export class CosmoClimbScene extends Container implements ResizableScene {
  private alien!: Sprite;
  private monsters: Monster[] = [];
  private powerups: Powerup[] = [];
  private blackHoles: Sprite[] = [];
  private blackHolePulseTime: number = 0;
  private powerupTiltTime: number = 0;
  private animationUpdateInterval: number = 3; 

  private objectsBeingSucked: Map<Sprite, { target: Sprite, progress: number, initialScale: number }> = new Map();
  private velocityY: number = 0;
  private velocityX: number = 0;
  private maxVelocityX: number = 7;
  private keyboardTilt: number = 0;
  private usingKeyboard: boolean = false;
  private touchDirection: number = 0;
  private score: number = 0;
  private multiplierPowerupsEarned: number = 0;
  private extraLifePowerupsEarned: number = 0;
  private bettingPowerupsEarned: number = 0;
  private scoreText!: Text;
  private highScoreText!: Text;
  private rubyText!: Text;
  private rubySprite!: Sprite;
  private highScore: number = 0;
  private rubies: number = 0;

  private addRubies(amount: number) {
    this.rubies += amount;
    this.rubyText.text = this.rubies.toString();
    
    // Create a small popup effect
    const popup = new Text(`+${amount}`, {
      fontFamily: 'Chewy',
      fontSize: 20,
      fill: 0xff3366,
      stroke: 0x000000,
      strokeThickness: 2
    } as any);
    popup.anchor.set(0.5);
    popup.x = this.rubySprite.x + this.rubySprite.width / 2 + 30;
    popup.y = this.rubySprite.y + this.rubySprite.height / 2;
    this.foregroundLayer.addChild(popup);
    
    // Animate the popup
    const startY = popup.y;
    const duration = 1000; // 1 second
    const startTime = Date.now();
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      popup.y = startY - (progress * 30); // Move up
      popup.alpha = 1 - progress; // Fade out
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.foregroundLayer.removeChild(popup);
      }
    };
    
    requestAnimationFrame(animate);
  }
  private isNewHighScore: boolean = false;
  private highScoreBlinkTimer: number = 0;
  private highestY: number = 0;
  private startingWorldY: number = 0;
  private lastScoreUpdate: number = 0;
  private scoreUpdateInterval: number = 3; // Update score every 3 frames for smoother display
  private isGameOver: boolean = false;
  private rocketActive: boolean = false;
  private rocketTimer: number = 0;
  private powercellActive: boolean = false;
  private powercellTimer: number = 0;
  private powercellBoostAmount: number = 0;
  private multiplierActive: boolean = false;
  private extraLifeActive: boolean = false;
  private bettingActive: boolean = false;
  
  // Damage system
  private isVulnerable: boolean = false;
  private damageTimer: number = 0;
  private isPaused: boolean = false;
  private storedVelocities: { x: number, y: number } | null = null;
  private isBettingMenuActive: boolean = false;
  private betText!: Text;
  private betSlider!: Graphics;
  private betSliderHandle!: Graphics;
  private betValue!: Text;
  private currentBet: number = 1;
  private damageDuration: number = 5000; // 5 seconds of vulnerability
  private slowdownTimer: number = 0;
  private slowdownDuration: number = 1000; // 1 second of slowdown
  private slowdownMultiplier: number = 0.8; // 20% speed reduction
  private background!: TilingSprite;
  private visuals!: Spritesheet;
  private powerupVisuals!: Spritesheet;
  private powerupCounts: Record<string, Text> = {};
  private powerupContainers: Record<string, Container> = {};
  private lastCollisionObject: Sprite | null = null; // Track the last object that collided with the alien
  private powerupBlinkInterval?: number;
  private startOverlay?: Container;
  // Container layers for proper z-ordering
  private backgroundLayer!: Container;
  private blackHoleLayer!: Container;
  private powerupLayer!: Container;
  private monsterLayer!: Container;
  private menuContainer!: Container;
  private alienLayer!: Container;
  private foregroundLayer!: Container;
  private gameStarted: boolean = false;
  private spawnY: number = 0;
  // Map configuration
  // Track alien's actual world position
  private alienWorldY: number = 0;
  // Dynamic generation tracking
  private lastGeneratedY: number = 0;
  private generationZoneHeight: number = 5000;
  // Solar storm properties
  private solarStorm!: Sprite;
  private solarStormY: number = 0;
  private solarStormBaseSpeed: number = 2.1;
  private solarStormCatchupSpeed: number = 2.3; 
  private isMobile: boolean = false;
  private frameCount: number = 0;
  private animationFrameSkip: number = 1; // Only animate every 2nd frame on mobile
  
  //Speeds
  private baseSpeed: number = -2;
  private maxSpeed: number = -6
  private baseSpeedSolarStorm: number = 2.1;
  private maxSpeedSolarStorm: number = 6.3;
  private baseSolarStormCatchupSpeed: number = 2.3;
  private maxSolarStormCatchupSpeed: number = 6.9;
  private baseRocketSpeed: number = -4;
  private maxRocketSpeed: number = -12;
  private speedIncreaseMultiplier: number = 1.0001;

  // Base element counts for different screen sizes
  private baseMonsters: number = 12;
  private basePowerups: number = 9;
  private baseBlackHoles: number = 7;

  constructor(
    private readonly app: Application,
    private readonly userId: string,
    private readonly onStart: () => void,
  ) {
    super();
    this.init();
  }

  private async init() {
    this.detectMobileAndOptimize();
    
    // Load visuals from cosmoClimbVisuals and powerupVisuals
    this.visuals = Assets.get('cosmoClimbVisuals') as Spritesheet;
    this.powerupVisuals = Assets.get('powerupVisuals') as Spritesheet;
    
    // Initialize container layers for proper z-ordering
    this.backgroundLayer = new Container();
    this.blackHoleLayer = new Container();
    this.powerupLayer = new Container();
    this.monsterLayer = new Container();
    this.alienLayer = new Container();
    this.foregroundLayer = new Container();
    
    this.addChild(this.backgroundLayer);
    this.addChild(this.blackHoleLayer);
    this.addChild(this.powerupLayer);
    this.addChild(this.monsterLayer);
    this.addChild(this.alienLayer);
    this.addChild(this.foregroundLayer);
    
    // Generate all game elements
    this.loadBackground();
    this.generateAlien();
    this.generateSolarStorm();
    this.generateScoreText();
    await this.createPowerupDisplay();
    
    this.showStartOverlay();
    
    // Setup controls and event listeners
    this.setupEventListeners();
    this.setupTouchControls();
  }

  private showStartOverlay() {
    if (this.startOverlay) return;
    this.startOverlay = new Container();
    const g = new Graphics();
    g.beginFill(0x000000, 0.7);
    g.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    g.endFill();
    this.startOverlay.addChild(g);
    const t = new Text('Tap Left and Right to Move\n Collect Powerups to Speed Up\n Avoid Monsters and Black Holes', {
      fontFamily: 'Chewy', fontSize: 36, fill: 0xffffff, stroke: 0x000000, strokeThickness: 6, align: 'center'
    } as any);
    t.anchor.set(0.5);
    t.x = this.app.renderer.width / 2;
    t.y = this.app.renderer.height / 2;
    this.startOverlay.addChild(t);
    this.startOverlay.interactive = true;
    this.startOverlay.eventMode = 'static';
    this.startOverlay.hitArea = new Rectangle(0, 0, this.app.renderer.width, this.app.renderer.height);
    this.startOverlay.on('pointerdown', () => {
      this.startGame();
    });    
    this.addChild(this.startOverlay);
  }

  private startGame = () => {
    this.gameStarted = true;
    this.solarStorm.visible = true;
    
    // Initialize dynamic generation
    this.lastGeneratedY = -5000;
    const firstZoneStart = -5000;
    const firstZoneEnd = 0;

    this.generateMonsters(firstZoneStart, firstZoneEnd);
    this.generatePowerups(firstZoneStart, firstZoneEnd);
    this.generateBlackHoles(firstZoneStart, firstZoneEnd);
    
    if (this.startOverlay) {
      this.removeChild(this.startOverlay);
      this.startOverlay = undefined;
    }
  }

  private update = () => {
    if (!this.gameStarted || this.isGameOver || this.isPaused) return;
    
    this.frameCount++;
    
    this.updateDamageSystem();
    this.updateAlienMovement();
    this.updateAlienSprite();
    this.updateScore();
    this.updateCamera();
    this.checkDynamicGeneration();
    this.handleCollisions();
    this.updateSuckAnimations();
    this.updateSolarStorm();
    this.cleanupOffScreenObjects();
    this.updateVisualEffects();
    this.updateMonsterMovement();
  };

  private checkDynamicGeneration() {
    const currentWorldY = this.alienWorldY;
    const generationThreshold = this.lastGeneratedY + this.generationZoneHeight * 0.2; // Spawn when alien is 80% through current zone
    
    if (currentWorldY <= generationThreshold) {
      // Generate new content in the zone above the alien
      const startY = this.lastGeneratedY - this.generationZoneHeight;
      const endY = this.lastGeneratedY;
      
      this.generateMonsters(startY, endY);
      this.generatePowerups(startY, endY);
      this.generateBlackHoles(startY, endY);
      
      // Update the last generated position
      this.lastGeneratedY -= this.generationZoneHeight;
    }
  }

  private removeCollisionObject(obj: Sprite | null) {
    if (!obj) return;
    
    // Remove from appropriate array and layer based on object type
    const monsterIndex = this.monsters.findIndex(m => m.sprite === obj);
    if (monsterIndex > -1) {
      this.monsters.splice(monsterIndex, 1);
      this.monsterLayer.removeChild(obj);
    } else if (this.blackHoles.includes(obj)) {
      const blackHoleIndex = this.blackHoles.indexOf(obj);
      if (blackHoleIndex > -1) {
        this.blackHoles.splice(blackHoleIndex, 1);
      }
      this.blackHoleLayer.removeChild(obj);
    }
    
    // Also remove from objectsBeingSucked if it exists there
    if (this.objectsBeingSucked.has(obj)) {
      this.objectsBeingSucked.delete(obj);
    }
  }

  private showExtraLifePowerupDisplay() {
    // Remove the object that caused the collision
    console.log("lastCollisionObject: ", this.lastCollisionObject);
    if (this.lastCollisionObject && this.lastCollisionObject != this.solarStorm) {
      this.removeCollisionObject(this.lastCollisionObject);
    }
    
    this.pauseGame();
    // Create and show the 'Extra Life Used!' text
    const style = new TextStyle({
      fontFamily: 'Chewy',
      fontSize: 36,
      fill: '#ffffff',
      stroke: { color: '#000000', width: 4, alpha: 1 },
    });

    const extraLifeText = new Text({
      text: 'Extra Life Used!',
      style: style
    });
    
    // Position the text in the center of the screen
    extraLifeText.anchor.set(0.5);
    extraLifeText.x = this.app.screen.width / 2;
    extraLifeText.y = this.app.screen.height / 2;
    extraLifeText.zIndex = 2000; // Make sure it's on top of everything
    
    // Add to stage
    this.foregroundLayer.addChild(extraLifeText);
    
    // Set a timer to remove the text and reset positions after 2 seconds
    setTimeout(() => {
      // Remove the text
      this.foregroundLayer.removeChild(extraLifeText);
      
      // Reset solar storm position
      this.resetSolarStormPosition();

      this.lastCollisionObject = null;
      
      // Reset vulnerability state
      this.isVulnerable = false;
      this.resumeGame();
      
    }, 2000);
  }
  
  private resetSolarStormPosition() {
    // Reset solar storm to starting position (adjust based on your game's starting position)
    this.solarStormY = this.alien.y + 840;
    this.solarStorm.y = this.solarStormY - this.alien.y;
  }

  private async showGameOver() {
    // Submit score and rubies to Firebase
    const gameId = 'cosmo-climb'; // Match the ID in games.ts
    let finalScore = this.score;
    if (this.bettingActive) {
      if (this.currentBet < this.rubies) {
        finalScore = this.score *5;
      }
      else {
        finalScore = 0;
      }
    }
    
    try {
      // Save rubies to Firebase
      if (this.rubies > 0) {
        await updateUserRubies(this.userId, this.rubies);
      }
      
      // If we have a new high score, update it
      if (this.isNewHighScore) {
        await updateUserHighScore(this.userId, gameId, finalScore);
        this.highScore = finalScore;
      }
      
      // Get the latest high score from the database
      const currentHighScore = await getUserHighScore(this.userId, gameId) || 0;
      const isNewHighScore = this.isNewHighScore || (finalScore > 0 && finalScore >= currentHighScore);
      
      // Create game over overlay
      const overlay = new Graphics();
      overlay.beginFill(0x000000, 0.7);
      overlay.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
      overlay.endFill();
      this.addChild(overlay);
      
      // Game Over text
      const gameOverText = new Text('Game Over', {
        fontFamily: 'Chewy', 
        fontSize: 64, 
        fill: 0xffffff, 
        stroke: 0x000000, 
        strokeThickness: 6, 
        align: 'center'
      } as any);
      gameOverText.anchor.set(0.5);
      gameOverText.x = this.app.renderer.width / 2;
      gameOverText.y = this.app.renderer.height / 2 - 80;
      this.addChild(gameOverText);
      
      // Final score text
      const scoreText = new Text(`Score: ${finalScore}`, {
        fontFamily: 'Chewy',
        fontSize: 48,
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 4,
        align: 'center'
      } as any);
      scoreText.anchor.set(0.5);
      scoreText.x = this.app.renderer.width / 2;
      scoreText.y = this.app.renderer.height / 2;
      this.addChild(scoreText);
      
      // High score text (only show if not a new high score)
      let yOffset = 60;
      if (!isNewHighScore && currentHighScore > 0) {
        const highScoreText = new Text(`High Score: ${currentHighScore}`, {
          fontFamily: 'Chewy',
          fontSize: 36,
          fill: 0xffff00,
          stroke: 0x000000,
          strokeThickness: 3,
          align: 'center'
        } as any);
        highScoreText.anchor.set(0.5);
        highScoreText.x = this.app.renderer.width / 2;
        highScoreText.y = this.app.renderer.height / 2 + yOffset;
        this.addChild(highScoreText);
        yOffset += 40;
      } else if (isNewHighScore) {
        const newHighScoreText = new Text('New High Score!', {
          fontFamily: 'Chewy',
          fontSize: 36,
          fill: 0x00ff00,
          stroke: 0x000000,
          strokeThickness: 3,
          align: 'center'
        } as any);
        newHighScoreText.anchor.set(0.5);
        newHighScoreText.x = this.app.renderer.width / 2;
        newHighScoreText.y = this.app.renderer.height / 2 + yOffset;
        this.addChild(newHighScoreText);
        yOffset += 40;
      }
      
      // Show rubies earned
        // Add ruby icon
        const rubySprite = new Sprite(this.visuals.textures['ruby.png']);
        rubySprite.width = 32;
        rubySprite.height = 32;
        rubySprite.anchor.set(0.5);
        rubySprite.x = this.app.renderer.width / 2 - 40;
        rubySprite.y = this.app.renderer.height / 2 + yOffset;
        this.addChild(rubySprite);
        
        // Add rubies text
        const rubiesText = new Text(`x${this.rubies}`, {
          fontFamily: 'Chewy',
          fontSize: 36,
          fill: 0xffffff,
          stroke: 0x000000,
          strokeThickness: 3,
          align: 'center'
        } as any);
        rubiesText.anchor.set(0.5);
        rubiesText.x = this.app.renderer.width / 2 + 20;
        rubiesText.y = this.app.renderer.height / 2 + yOffset;
        this.addChild(rubiesText);

      // Show multiplier powerups earned
        // Add multiplier icon
        const multiplierSprite = new Sprite(this.powerupVisuals.textures['multiplier-1.png']);
        multiplierSprite.width = 32;
        multiplierSprite.height = 32;
        multiplierSprite.anchor.set(0.5);
        multiplierSprite.x = this.app.renderer.width / 2 - 40;
        multiplierSprite.y = this.app.renderer.height / 2 + yOffset + 34;
        this.addChild(multiplierSprite);
        
        // Add multiplier text
        const multiplierText = new Text(`x${this.multiplierPowerupsEarned}`, {
          fontFamily: 'Chewy',
          fontSize: 36,
          fill: 0xffffff,
          stroke: 0x000000,
          strokeThickness: 3,
          align: 'center'
        } as any);
        multiplierText.anchor.set(0.5);
        multiplierText.x = this.app.renderer.width / 2 + 20;
        multiplierText.y = this.app.renderer.height / 2 + yOffset + 34;
        this.addChild(multiplierText);
      
      // Show extra life powerups earned
        // Add extra life icon
        const extraLifeSprite = new Sprite(this.powerupVisuals.textures['extra-life-1.png']);
        extraLifeSprite.width = 32;
        extraLifeSprite.height = 32;
        extraLifeSprite.anchor.set(0.5);
        extraLifeSprite.x = this.app.renderer.width / 2 - 40;
        extraLifeSprite.y = this.app.renderer.height / 2 + yOffset + 68;
        this.addChild(extraLifeSprite);
        
        // Add extra life text
        const extraLifeText = new Text(`x${this.extraLifePowerupsEarned}`, {
          fontFamily: 'Chewy',
          fontSize: 36,
          fill: 0xffffff,
          stroke: 0x000000,
          strokeThickness: 3,
          align: 'center'
        } as any);
        extraLifeText.anchor.set(0.5);
        extraLifeText.x = this.app.renderer.width / 2 + 20;
        extraLifeText.y = this.app.renderer.height / 2 + yOffset + 68;
        this.addChild(extraLifeText);
      
      // Show betting powerups earned
        // Add betting icon
        const bettingSprite = new Sprite(this.powerupVisuals.textures['betting-1.png']);
        bettingSprite.width = 32;
        bettingSprite.height = 32;
        bettingSprite.anchor.set(0.5);
        bettingSprite.x = this.app.renderer.width / 2 - 40;
        bettingSprite.y = this.app.renderer.height / 2 + yOffset + 102;
        this.addChild(bettingSprite);
        
        // Add betting text
        const bettingText = new Text(`x${this.bettingPowerupsEarned}`, {
          fontFamily: 'Chewy',
          fontSize: 36,
          fill: 0xffffff,
          stroke: 0x000000,
          strokeThickness: 3,
          align: 'center'
        } as any);
        bettingText.anchor.set(0.5);
        bettingText.x = this.app.renderer.width / 2 + 20;
        bettingText.y = this.app.renderer.height / 2 + yOffset + 102;
        this.addChild(bettingText);
      
      // Remove overlay and reset after delay
      setTimeout(() => {
        this.removeChildren().forEach(child => child.destroy());
        this.onStart();
      }, 3000);
      
    } catch (error) {
      console.error('Error saving high score:', error);
      // Fallback to simple game over if there's an error with Firebase
      const overlay = new Graphics();
      overlay.beginFill(0x000000, 0.7);
      overlay.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
      overlay.endFill();
      this.addChild(overlay);
      
      const text = new Text('Game Over', {
        fontFamily: 'Chewy', 
        fontSize: 64, 
        fill: 0xffffff, 
        stroke: 0x000000, 
        strokeThickness: 6, 
        align: 'center'
      } as any);
      text.anchor.set(0.5);
      text.x = this.app.renderer.width / 2;
      text.y = this.app.renderer.height / 2;
      this.addChild(text);
      
      setTimeout(() => {
        this.removeChildren().forEach(child => child.destroy());
        this.onStart();
      }, 2000);
    }
  }

  private pauseGame() {
    if (this.isPaused) return;
    
    this.isPaused = true;
    this.storedVelocities = {
      x: this.velocityX,
      y: this.velocityY
    };
    console.log(this.storedVelocities);
    // Reset velocities to stop movement
    this.velocityX = 0;
    this.velocityY = 0;
    this.keyboardTilt = 0;
    this.touchDirection = 0;
    this.app.ticker.remove(this.update, this);
  }

  private resumeGame() {
    if (!this.isPaused) return;
    
    this.isPaused = false;
    if (this.storedVelocities) {
      this.velocityX = this.storedVelocities.x;
      this.velocityY = this.storedVelocities.y;
      console.log(this.velocityX, this.velocityY);
      this.storedVelocities = null;
    }
    // Only add the update function if it's not already in the ticker
    if (!this.app.ticker.started || !this.app.ticker['_head'].contains(this.update)) {
      this.app.ticker.add(this.update, this);
    }
  }

  private activatePowerup(type: 'multiplier' | 'extra-life' | 'betting') {
    // Implement powerup activation logic here
    console.log(`Activating powerup: ${type}`);
    
    // Example implementation - you'll need to adjust this based on your game's needs
    switch (type) {
      case 'multiplier':
        this.multiplierActive = true;
        this.multiplierPowerupsEarned--;
        break;
      case 'extra-life':
        this.extraLifeActive = true;
        this.extraLifePowerupsEarned--;
        break;
      case 'betting':
        this.bettingActive = true;
        this.bettingPowerupsEarned--;
        this.showBettingMenu();
        break;
    }
    
    // Update the UI to reflect the change
    this.updatePowerupCounts();
  }
  
  private updatePowerupCounts() {
    // Update the display of powerup counts
    if (this.powerupCounts['multiplier']) {
      this.powerupCounts['multiplier'].text = this.multiplierPowerupsEarned.toString();
      this.powerupContainers['multiplier'].alpha = this.multiplierPowerupsEarned > 0 ? 1 : 0.5;
    }
    
    if (this.powerupCounts['extra-life']) {
      this.powerupCounts['extra-life'].text = this.extraLifePowerupsEarned.toString();
      this.powerupContainers['extra-life'].alpha = this.extraLifePowerupsEarned > 0 ? 1 : 0.5;
    }
    
    if (this.powerupCounts['betting']) {
      this.powerupCounts['betting'].text = this.bettingPowerupsEarned.toString();
      this.powerupContainers['betting'].alpha = this.bettingPowerupsEarned > 0 ? 1 : 0.5;
    }
  }

  private showBettingMenu() {
    // Pause the game and show betting menu
    this.isBettingMenuActive = true;
    this.pauseGame();
    
    // Create overlay background
    const overlay = new Graphics();
    overlay.beginFill(0x000000, 0.7);
    overlay.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    overlay.endFill();
    overlay.interactive = true;
    overlay.zIndex = 1000;
    this.addChild(overlay);
    
    // Create container for betting menu
    this.menuContainer = new Container();
    this.menuContainer.width = 300;
    this.menuContainer.height = 200;
    this.menuContainer.x = (this.app.renderer.width - 300) / 2;
    this.menuContainer.y = (this.app.renderer.height - 200) / 2;
    this.menuContainer.zIndex = 1001;
    
    // Add background for menu
    const menuBg = new Graphics();
    menuBg.beginFill(0x333333);
    menuBg.drawRoundedRect(0, 0, 300, 200, 15);
    menuBg.endFill();
    this.menuContainer.addChild(menuBg);
    
    // Add title
    const title = new Text('All or nothing! Hit your goal for 5× Rubies!', {
      fontFamily: 'Chewy',
      fontSize: 28,
      fill: 0xffffff,
      align: 'center'
    });
    title.x = 150 - title.width / 2;
    title.y = 20;
    this.menuContainer.addChild(title);
    
    // Create slider
    this.createBetSlider();
    
    // Add BET! button
    const betButton = new Graphics();
    betButton.beginFill(0x4CAF50);
    betButton.drawRoundedRect(100, 160, 100, 30, 10);
    betButton.endFill();
    betButton.interactive = true;
    betButton.cursor = 'pointer';
    
    const goText = new Text('BET!', {
      fontFamily: 'Chewy',
      fontSize: 20,
      fill: 0xffffff
    });
    goText.x = 150 - goText.width / 2;
    goText.y = 165;
    
    betButton.addChild(goText);
    this.menuContainer.addChild(betButton);
    
    // Handle BET! button click
    betButton.on('pointerdown', () => {
      // Set the bet and resume game
      (this as any).userBet = this.currentBet;
      console.log(this.currentBet)
      this.removeChild(overlay);
      this.removeChild(this.menuContainer);
      this.isBettingMenuActive = false; // Clear the betting menu flag
      this.resumeGame();
    });
    
    this.addChild(this.menuContainer);
  }

  private createBetSlider() {
    const sliderWidth = 200;
    const sliderHeight = 8;
    const handleSize = 20;
    const containerWidth = 300; // Width of the menu container
    const sliderX = (containerWidth - sliderWidth) / 2; // Center the slider
    const sliderY = 100; // Position below the title

    // Slider track
    this.betSlider = new Graphics();
    this.betSlider.beginFill(0x666666);
    this.betSlider.drawRoundedRect(0, 0, sliderWidth, sliderHeight, 4);
    this.betSlider.endFill();
    this.betSlider.lineStyle(2, 0xffffff);
    this.betSlider.drawRoundedRect(0, 0, sliderWidth, sliderHeight, 4);
    this.betSlider.x = sliderX;
    this.betSlider.y = sliderY;
    this.menuContainer.addChild(this.betSlider);

    // Slider handle
    this.betSliderHandle = new Graphics();
    this.betSliderHandle.beginFill(0xffffff);
    this.betSliderHandle.drawCircle(0, 0, handleSize / 2);
    this.betSliderHandle.endFill();
    this.betSliderHandle.lineStyle(2, 0x000000);
    this.betSliderHandle.drawCircle(0, 0, handleSize / 2);
    this.betSliderHandle.x = sliderX;
    this.betSliderHandle.y = sliderY + sliderHeight / 2;
    this.betSliderHandle.eventMode = 'static';
    this.betSliderHandle.cursor = 'pointer';
    this.menuContainer.addChild(this.betSliderHandle);

    // Bet value text
    this.betValue = new Text('1', {
      fontFamily: 'Chewy',
      fontSize: 18,
      fill: 0xffffff,
      stroke: 0x000000
    });
    this.betValue.x = sliderX + sliderWidth + 10;
    this.betValue.y = sliderY - 9; // Vertically center with slider
    this.menuContainer.addChild(this.betValue);

    // Ruby sprite
    this.rubySprite = Sprite.from('ruby.png');
    this.rubySprite.scale.set(0.1);
    this.rubySprite.x = sliderX + sliderWidth + 40; // Position to the right of the value
    this.rubySprite.y = sliderY - 10; // Vertically center with slider
    this.menuContainer.addChild(this.rubySprite);

    // Set up slider interaction
    this.setupSliderInteraction();
  }

  private setupSliderInteraction() {
    let isDragging = false;
    let dragStartX = 0;
    let sliderStartX = 0;

    this.betSliderHandle.on('pointerdown', (event: any) => {
      isDragging = true;
      dragStartX = event.global.x;
      sliderStartX = this.betSliderHandle.x;
    });

    this.app.stage.on('pointermove', async (event: any) => {
      if (!isDragging) return;

      const deltaX = event.global.x - dragStartX;
      let newX = sliderStartX + deltaX;
      
      // Constrain to slider bounds
      const sliderX = this.betSlider.x;
      const sliderWidth = 200;
      const minX = sliderX;
      const maxX = sliderX + sliderWidth;
      newX = Math.max(minX, Math.min(maxX, newX));
      
      this.betSliderHandle.x = newX;
      
      // Update bet value based on position within slider bounds
      const ratio = (newX - minX) / (maxX - minX);
      const rubies = await getUserRubies(this.userId);
      this.currentBet = Math.round(1 + ratio * Math.min(49, rubies)); // 1 to min(50, rubies)
      this.betValue.text = this.currentBet.toString();
    });

// Create bet button
const betButton = new Graphics() as Graphics & { buttonMode: boolean };
betButton.beginFill(0x4CAF50); // Green color
betButton.drawRoundedRect(0, 0, 200, 50, 25);
betButton.endFill();
betButton.x = 50;
betButton.y = 150;
betButton.interactive = true;
betButton.buttonMode = true;

// Add text to button
const goText = new Text('BET!', {
    fontFamily: 'Chewy',
    fontSize: 24,
    fill: 0xffffff,
    align: 'center'
});
goText.anchor.set(0.5);
goText.x = betButton.width / 2;
goText.y = betButton.height / 2;

// Add text to button
betButton.addChild(goText);

// Add click handler
betButton.on('pointertap', async () => {
    // Handle bet placement here
    const rubies = await getUserRubies(this.userId);
    if (rubies >= this.currentBet) {
        await updateUserRubies(this.userId, -this.currentBet);
        this.rubies -= this.currentBet;
        this.rubyText.text = this.rubies.toString();
        
        // Close the betting menu
        this.menuContainer.destroy({ children: true });
        this.isBettingMenuActive = false;
        this.resumeGame();
    } else {
        // Show not enough rubies message
        alert('Not enough rubies to place this bet!');
    }
});

// Add button to menu container
this.menuContainer.addChild(betButton);
    // Blink animation for powerups when available
    const blinkInterval = setInterval(() => {
      Object.entries(this.powerupContainers).forEach(([type, powerupContainer]) => {
        const count = type === 'multiplier' ? this.multiplierPowerupsEarned :
                     type === 'extra-life' ? this.extraLifePowerupsEarned :
                     this.bettingPowerupsEarned;
        
        if (count > 0) {
          powerupContainer.alpha = powerupContainer.alpha === 1 ? 0.7 : 1;
        } else {
          powerupContainer.alpha = 0.5;
        }
      });
    }, 500);
    
    // Store interval for cleanup
    if (this.powerupBlinkInterval) {
      clearInterval(this.powerupBlinkInterval);
    }
    this.powerupBlinkInterval = blinkInterval;
    
    // Add cleanup in the destroy method
    const originalDestroy = this.destroy;
    this.destroy = (options?: any) => {
      if (this.powerupBlinkInterval) {
        clearInterval(this.powerupBlinkInterval);
      }
      originalDestroy.call(this, options);
    };

    // Add debug visualization for the container
    const debugRect = new Graphics();
    debugRect.lineStyle(2, 0x00ff00, 0.5);
    debugRect.drawRect(0, 0, 240, 240);
    const container = new Container();
    container.addChild(debugRect);
    
    return container;
  };

  private createPowerupDisplay = async () => {
    try {
      const powerupTypes: PowerupType[] = ['multiplier', 'extra-life', 'betting'];
      const powerupContainer = new Container();
      powerupContainer.width = 75; 
      powerupContainer.height = 225;
      powerupContainer.x = 20;
      powerupContainer.y = this.app.screen.height - 250;
      powerupContainer.interactive = true;
      powerupContainer.visible = true;
      powerupContainer.alpha = 1;
      powerupContainer.eventMode = 'static';
      powerupContainer.cursor = 'pointer';
      powerupContainer.hitArea = new Rectangle(0, 0, 75, 245); 
      
      // Add container to the stage - make sure it's on top
      this.foregroundLayer.addChild(powerupContainer);
      this.foregroundLayer.sortableChildren = true;
      powerupContainer.zIndex = 1000; // Ensure it's on top
      
      // Create powerup rows
      const rowHeight = 75;
      const rowSpacing = 10;
      const powerupSprites: Sprite[] = [];
      const powerupTexts: Text[] = [];
      
      powerupTypes.forEach((type, index) => {
        const rowContainer = new Container();
        rowContainer.y = index * (rowHeight + rowSpacing);
        rowContainer.eventMode = 'static';
        rowContainer.cursor = 'pointer';
        rowContainer.interactive = true;
        rowContainer.hitArea = new Rectangle(0, 0, 75, rowHeight);  // Width reduced from 200
        
        // Add background for better hit detection
        const bgGraphics = new Graphics();
        bgGraphics.beginFill(0x000000, 0.3);
        bgGraphics.drawRoundedRect(0, 0, 75, rowHeight, 5);
        bgGraphics.endFill();
        rowContainer.addChild(bgGraphics);
        
        // Add hover effect background
        const hoverGraphics = new Graphics();
        hoverGraphics.beginFill(0xffffff, 0.3);
        hoverGraphics.drawRoundedRect(0, 0, 75, rowHeight, 5);
        hoverGraphics.endFill();
        hoverGraphics.visible = false;
        rowContainer.addChild(hoverGraphics);
        
        // Create powerup icon
        const sprite = new Sprite(this.powerupVisuals.textures[`${type}-1.png`]);
        sprite.width = 40;
        sprite.height = 40;
        sprite.x = (75 - sprite.width) / 2; // Center horizontally in the 75px wide container
        sprite.y = (rowHeight - sprite.height) / 2 - 5; // Center vertically in the row
        
        // Create powerup count text
        const text = new Text({
          text: '0',
          style: new TextStyle({
            fontFamily: 'Chewy',
            fontSize: 15,
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 2, alpha: 1 }
          } as any)
        });
        text.x = 50;
        text.y = rowHeight - text.height;

        
        // Add hover effects
        rowContainer.on('pointerover', () => {
          hoverGraphics.visible = true;
        });
        
        rowContainer.on('pointerout', () => {
          hoverGraphics.visible = false;
        });
        
        // Add click handler with event prevention
        rowContainer.on('pointerdown', (e) => {
          e.stopPropagation();
        });
        
        rowContainer.on('pointerup', (e) => {
          e.stopPropagation();
        });
        
        rowContainer.on('pointertap', async (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          try {
            const currentCount = parseInt(text.text, 10);
            if (currentCount > 0) {
              // Update the active state based on powerup type
              switch (type) {
                case 'multiplier':
                  this.multiplierActive = true;
                  break;
                case 'extra-life':
                  this.extraLifeActive = true;
                  break;
                case 'betting':
                  this.bettingActive = true;
                  this.showBettingMenu();
                  break;
              }
              
              // Decrement the count in Firebase
              await usePowerup(this.userId, type);
              
              // Update the display
              text.text = `${currentCount - 1}`;
              
              // Close the powerup menu after selection
              if ((powerupContainer as any).cleanup) {
                (powerupContainer as any).cleanup();
              }
            }
          } catch (error) {
            console.error(`Error activating ${type} powerup:`, error);
          }
        });
        
        // Add elements to row container
        rowContainer.addChild(sprite);
        rowContainer.addChild(text);
        
        // Add row to main container
        powerupContainer.addChild(rowContainer);
        
        // Store references for animation and updates
        powerupSprites.push(sprite);
        powerupTexts.push(text);
      });
      
      // Add blinking animation
      let isFrame1 = true;
      const blinkInterval = setInterval(() => {
        if (powerupContainer.destroyed) {
          clearInterval(blinkInterval);
          return;
        }
        isFrame1 = !isFrame1;
        const frame = isFrame1 ? '1' : '2';
        
        powerupTypes.forEach((type, index) => {
          if (powerupSprites[index] && !powerupSprites[index].destroyed) {
            powerupSprites[index].texture = this.powerupVisuals.textures[`${type}-${frame}.png`];
          }
        });
      }, 500);
      
      // Function to update powerup counts
      const updatePowerupCounts = async () => {
        try {
          const powerups = await getUserPowerups(this.userId);
          powerupTypes.forEach((type, index) => {
            if (powerupTexts[index] && !powerupTexts[index].destroyed) {
              powerupTexts[index].text = `${powerups[type] || 0}`;
            }
          });
        } catch (error) {
          console.error('Error updating powerup counts:', error);
        }
      };
      
      // Initial update and set up subscription
      await updatePowerupCounts();
      const unsubscribe = subscribeToUser(this.userId, (data: any) => {
        const powerups = data?.powerups || {};
        powerupTypes.forEach((type, index) => {
          if (powerupTexts[index] && !powerupTexts[index].destroyed) {
            powerupTexts[index].text = `${powerups[type] || 0}`;
          }
        });
      });
      
      // Add cleanup method
      (powerupContainer as any).updatePowerupCounts = updatePowerupCounts;
      (powerupContainer as any).cleanup = () => {
        clearInterval(blinkInterval);
        unsubscribe();
        if (powerupContainer.parent) {
          powerupContainer.parent.removeChild(powerupContainer);
        }
        powerupContainer.destroy({ children: true });
      };
      
      // Hide the powerup display after 4 seconds
      setTimeout(() => {
        if ((powerupContainer as any).cleanup) {
          (powerupContainer as any).cleanup();
        }
      }, 4000);
      
      return powerupContainer;
    } catch (error) {
      console.error('Error creating powerup display:', error);
      return null;
    }
  };

  private detectMobileAndOptimize() {
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('Mobile device detected:', this.isMobile);
    if (this.isMobile) {
      this.animationFrameSkip = 4; // More aggressive frame skipping on mobile
      this.animationUpdateInterval = 6; // Update animations less frequently on mobile
      this.scoreUpdateInterval = 5; // Update score every 5 frames on mobile for smooth display
      console.log('Mobile optimizations applied - 2x speed boost enabled');
    }
  }

  private loadBackground() {
    const bgTex = Texture.from('cosmoClimbBackground');
    this.background = new TilingSprite(bgTex, this.app.renderer.width, this.app.renderer.height * 3);
    this.background.tilePosition.y = 0;
    this.backgroundLayer.addChild(this.background);
  }

  private generateAlien() {
    this.spawnY = this.app.renderer.height - this.app.renderer.height * 0.2;
    this.alien = new Sprite(this.visuals.textures['alien-right.png']);
    this.alien.width = 48;
    this.alien.height = 48;
    this.alien.anchor.set(0.5);
    this.alien.x = this.app.renderer.width / 2;
    this.alien.y = this.spawnY;
    this.alienWorldY = this.alien.y;
    this.startingWorldY = this.alien.y;
    this.alienLayer.addChild(this.alien);
    this.highestY = this.alien.y;
  }

  private generateSolarStorm() {
    this.solarStorm = new Sprite(this.visuals.textures['solar-storm.png']);
    this.solarStorm.width = this.app.renderer.width;
    this.solarStorm.anchor.set(0, 0); 
    this.solarStorm.x = 0;
    this.solarStorm.y = 600;
    this.solarStormY = this.highestY + 840;
    this.solarStorm.visible = false;
    this.foregroundLayer.addChild(this.solarStorm);
  }

  private async generateScoreText() {
    // Main score display
    this.scoreText = new Text('0', {
      fontFamily: 'Chewy', 
      fontSize: 32, 
      fill: 0xffffff, 
      stroke: 0x000000, 
      strokeThickness: 4
    } as any);
    this.scoreText.x = 20;
    this.scoreText.y = 20;
    this.foregroundLayer.addChild(this.scoreText);

    // High score display
    try {
      const gameId = 'cosmo-climb';
      this.highScore = await getUserHighScore(this.userId, gameId) || 0;
    } catch (error) {
      console.error('Error fetching high score:', error);
      this.highScore = 0;
    }

    this.highScoreText = new Text(`High Score: ${this.highScore}`, {
      fontFamily: 'Chewy',
      fontSize: 16,
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 2
    } as any);
    this.highScoreText.x = 20;
    this.highScoreText.y = 60; // Positioned below the score
    this.foregroundLayer.addChild(this.highScoreText);

    // Rubies counter display
    // Create ruby sprite
    this.rubySprite = new Sprite(this.visuals.textures['ruby.png']);
    this.rubySprite.width = 20;
    this.rubySprite.height = 20;
    this.rubySprite.x = 20;
    this.rubySprite.y = 85;
    this.foregroundLayer.addChild(this.rubySprite);

    // Ruby count text
    this.rubyText = new Text(this.rubies.toString(), {
      fontFamily: 'Chewy',
      fontSize: 16,
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 2
    } as any);
    this.rubyText.x = 45; // Positioned to the right of the ruby sprite
    this.rubyText.y = 85; // Same Y position as ruby sprite
    this.foregroundLayer.addChild(this.rubyText);
  }

  private setupEventListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    Ticker.shared.add(this.update, this);
  }

  private setupTouchControls() {
    // Add touch controls for mobile
    this.app.view.addEventListener('touchstart', this.handleTouch);
    this.app.view.addEventListener('touchmove', this.handleTouchMove);
    this.app.view.addEventListener('touchend', this.handleTouchEnd);
   
    // Prevent text selection and touch highlighting
    this.app.view.style.userSelect = 'none';
    this.app.view.style.webkitUserSelect = 'none';
    this.app.view.style.setProperty('-webkit-touch-callout', 'none');
    this.app.view.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    this.app.view.style.touchAction = 'none';
  }

  private generateMonsters = (startY: number, endY: number) => {
    const screenArea = this.app.renderer.width * this.app.renderer.height;
    const baseArea = 800 * 600;
    const scaleFactor = Math.sqrt(screenArea / baseArea);
    const numMonsters = Math.max(this.baseMonsters, Math.floor(this.baseMonsters * scaleFactor * 2.5));
    
    const zoneHeight = endY - startY;
    const monstersToGenerate = Math.floor(numMonsters * zoneHeight / 5000);

    for (let i = 0; i < monstersToGenerate; i++) {
      const worldY = startY + Math.random() * zoneHeight;
      const x = 60 + Math.random() * (this.app.renderer.width - 120);
      
      const monster = this.createMonster(worldY, x);
      // Position monster relative to camera
      monster.sprite.y = worldY - this.highestY;
      this.monsters.push(monster);
      this.monsterLayer.addChild(monster.sprite);
    }
  }

  private generatePowerups = (startY: number, endY: number) => {
    const screenArea = this.app.renderer.width * this.app.renderer.height;
    const baseArea = 800 * 600;
    const scaleFactor = Math.sqrt(screenArea / baseArea); 
    const numPowerups = Math.max(this.basePowerups, Math.floor(this.basePowerups * scaleFactor * 2.5)); 
    
    const zoneHeight = endY - startY;
    const powerupsToGenerate = Math.floor(numPowerups * zoneHeight / 5000);

    for (let i = 0; i < powerupsToGenerate; i++) {
      const worldY = startY + Math.random() * zoneHeight;
      const x = 60 + Math.random() * (this.app.renderer.width - 120);
      // for actual game: 5% chance of rocket, 92% chance of powercell, 1% chance of multiplier, 1% chance of extra life, 1% chance of betting
      const powerupType = Math.random() < 0.05 ? 'rocket' : Math.random() < 0.97 ? 'powercell' : Math.random() < 0.98 ? 'multiplier' : Math.random() < 0.99 ? 'extra-life' : 'betting';
      // Use powerupVisuals spritesheet for all powerups except rocket and powercell
      const isCosmoClimbPowerup = powerupType === 'rocket' || powerupType === 'powercell';
      const spritesheet = isCosmoClimbPowerup ? this.visuals : this.powerupVisuals;
      const textureKey = 
        powerupType === 'rocket' ? 'rocket-off.png' :
        powerupType === 'powercell' ? 'powercell.png' :
        `${powerupType}-1.png`; // For multiplier, extra-life, betting
      
      const powerupSprite = new Sprite(spritesheet.textures[textureKey]);
      powerupSprite.width = 32;
      powerupSprite.height = 32;
      powerupSprite.anchor.set(0.5);
      powerupSprite.x = x;
      powerupSprite.y = worldY - this.highestY;
      
      // Add blinking animation for non-rocket/powercell powerups
      if (!isCosmoClimbPowerup) {
        let isFrame1 = true;
        const blinkInterval = setInterval(() => {
          if (powerupSprite.destroyed) {
            clearInterval(blinkInterval);
            return;
          }
          isFrame1 = !isFrame1;
          const frame = isFrame1 ? '1' : '2';
          powerupSprite.texture = this.powerupVisuals.textures[`${powerupType}-${frame}.png`];
        }, 500); // Toggle every 500ms
        
        // Store interval ID on the sprite for cleanup
        (powerupSprite as any).blinkInterval = blinkInterval;
      }
      
      this.powerups.push({ sprite: powerupSprite, type: powerupType });
      this.powerupLayer.addChild(powerupSprite);
    }
  }

  private generateBlackHoles = (startY: number, endY: number) => {
    const screenArea = this.app.renderer.width * this.app.renderer.height;
    const baseArea = 800 * 600;
    const scaleFactor = Math.sqrt(screenArea / baseArea);
    const numBlackHoles = Math.max(this.baseBlackHoles, Math.floor(this.baseBlackHoles * scaleFactor * 2.5));
    
    const zoneHeight = endY - startY;
    const blackHolesToGenerate = Math.floor(numBlackHoles * zoneHeight / 5000);

    for (let i = 0; i < blackHolesToGenerate; i++) {
      const worldY = startY + Math.random() * zoneHeight;
      const x = 60 + Math.random() * (this.app.renderer.width - 120);

      const blackHoleSprite = new Sprite(this.visuals.textures['black-hole.png']);
      blackHoleSprite.anchor.set(0.5);
      blackHoleSprite.width = 32;
      blackHoleSprite.height = 32;
      blackHoleSprite.x = x;
      blackHoleSprite.y = worldY - this.highestY;
      this.blackHoles.push(blackHoleSprite);
      this.blackHoleLayer.addChild(blackHoleSprite);
    }
  }



  private createMonster(y: number, x?: number): Monster {
    const monsterKeys = ['monster-1.png', 'monster-2.png', 'monster-3.png'];
    const key = monsterKeys[Math.floor(Math.random() * monsterKeys.length)];
    const sprite = new Sprite(this.visuals.textures[key]);
    sprite.anchor.set(0.5);
    sprite.width = 48;
    sprite.height = 48;
    sprite.x = x !== undefined ? x : 40 + Math.random() * (this.app.renderer.width - 80);
    sprite.y = y;
    const vx = (Math.random() - 0.5) * 1.5;
    const vy = (Math.random() - 0.5) * 0.5;
    return { sprite, isHitByRocket: false, x: sprite.x, y: sprite.y, vx, vy };
  }

  private handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    this.handleTouch(e);
  };

  private handleTouch = (e: TouchEvent) => {
    if (this.isBettingMenuActive) return; // Ignore touch events when betting menu is active
    
    if (e.touches.length === 0) {
      this.touchDirection = 0;
      return;
    }

    const touch = e.touches[0];
    const touchX = touch.clientX;
    const screenWidth = this.app.renderer.width;
    const halfScreen = screenWidth / 2;

    if (touchX < halfScreen) {
      this.touchDirection = -1; // Left
    } else {
      this.touchDirection = 1; // Right
    }
  };

  private handleTouchEnd = (event: TouchEvent) => {
    this.touchDirection = 0;
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.isBettingMenuActive) return; // Ignore key events when betting menu is active
    
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.keyboardTilt = -0.4;
      this.usingKeyboard = true;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.keyboardTilt = 0.4;
      this.usingKeyboard = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (
      e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ||
      e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'
    ) {
      this.keyboardTilt = 0;
      this.usingKeyboard = false;
    }
  };

  private updateAlienMovement() {
    let effectiveTilt = 0;
    
    // Use keyboard controls if active
    if (this.usingKeyboard) {
      effectiveTilt = this.keyboardTilt;
    } else {
      // Use touch controls (more sensitive on mobile)
      const touchSensitivity = this.isMobile ? 0.7 : 0.6;
      effectiveTilt = this.touchDirection * touchSensitivity;
    }
    
    this.velocityX += effectiveTilt;
    // Less damping on mobile for more responsive turning
    const damping = this.isMobile ? 0.9 : 0.85;
    this.velocityX *= damping;
    this.velocityX = Math.max(-this.maxVelocityX, Math.min(this.maxVelocityX, this.velocityX));
    this.alien.x += this.velocityX;
    
    // Keep alien within screen bounds
    if (this.alien.x < 24) this.alien.x = 24;
    if (this.alien.x > this.app.renderer.width - 24) this.alien.x = this.app.renderer.width - 24;
    
    // Freeze alien movement if being sucked into black hole
    if (this.objectsBeingSucked.has(this.alien)) {
    } else {
    if (this.rocketActive) {
        this.baseRocketSpeed = Math.max(this.baseRocketSpeed*this.speedIncreaseMultiplier, this.maxRocketSpeed)
        this.velocityY = this.isMobile ? this.baseRocketSpeed*2 : this.baseRocketSpeed;
      this.rocketTimer -= Ticker.shared.deltaMS;
      if (this.rocketTimer <= 0) {
        this.rocketActive = false;
      }
    } else {
      this.baseSpeed = Math.max(this.baseSpeed*this.speedIncreaseMultiplier, this.maxSpeed);
      this.velocityY = this.isMobile ? this.baseSpeed*2 : this.baseSpeed;
    }
    
    // Apply slowdown effect when damaged
    if (this.slowdownTimer > 0) {
      this.velocityY *= this.slowdownMultiplier;
    }
    
    if (this.powercellActive) {
      this.powercellTimer -= Ticker.shared.deltaMS;
        const totalDuration = 1000; 
      const remainingTime = this.powercellTimer;
      const elapsedTime = totalDuration - remainingTime;
      
      if (elapsedTime <= 500) {
          const accelerationFactor = elapsedTime / 500; 
          const boostMultiplier = this.isMobile ? 5 : 2.5;
          this.powercellBoostAmount = -boostMultiplier * accelerationFactor;
      } else {
          const decelerationFactor = (remainingTime) / 500; 
          const boostMultiplier = this.isMobile ? 5 : 2.5; 
          this.powercellBoostAmount = -boostMultiplier * decelerationFactor;
        }
        
      this.velocityY += this.powercellBoostAmount;
      
      if (this.powercellTimer <= 0) {
        this.powercellActive = false;
        this.powercellBoostAmount = 0;
      }
    }
    
    // Apply slight vertical penalty when moving horizontally
    if (Math.abs(this.velocityX) > 0.5) {
      this.velocityY *= 0.9; // 10% reduction in vertical speed when moving horizontally
    }
    
    this.alien.y += this.velocityY;
    this.alienWorldY += this.velocityY;
    }
  }

  private updateAlienSprite() {
    // Alien sprite direction
    if (this.rocketActive) {
      this.alien.texture = this.visuals.textures['rocket-on.png'];
    } else if (this.velocityX > 0.5) {
      this.alien.texture = this.visuals.textures['alien-right.png'];
    } else if (this.velocityX < -0.5) {
      this.alien.texture = this.visuals.textures['alien-left.png'];
    } else {
      // Use alien-right sprite when moving straight up
      this.alien.texture = this.visuals.textures['alien-right.png'];
    }

  }

  private updateScore() {
    const distanceTraveled = this.startingWorldY - this.alienWorldY; // Positive when moved up from start
    const newScore = Math.max(0, Math.floor(distanceTraveled));
    
    if (newScore !== this.score) {
      this.score = newScore;
      
      // Update score display
      if (this.frameCount - this.lastScoreUpdate >= this.scoreUpdateInterval) {
        this.scoreText.text = this.score.toString();
        this.lastScoreUpdate = this.frameCount;
        
        // Check for new high score
        if (this.score > this.highScore) {
          if (!this.isNewHighScore) {
            this.isNewHighScore = true;
            this.highScoreText.text = 'New High Score!';
            this.highScoreBlinkTimer = 0;
          }
          this.highScore = this.score;
        } else if (!this.isNewHighScore) {
          // Only show regular high score if we're not in new high score mode
          this.highScoreText.text = `High Score: ${this.highScore}`;
        }
      }
    }
    
    // Handle blinking effect for new high score
    if (this.isNewHighScore) {
      this.highScoreBlinkTimer += Ticker.shared.deltaMS;
      const blinkSpeed = 200; // ms per blink
      const isVisible = Math.floor(this.highScoreBlinkTimer / blinkSpeed) % 2 === 0;
      this.highScoreText.visible = isVisible;
    }
  }

  private updateCamera() {
    // Camera follows alien upward if above screen midpoint (freeze if being sucked)
    const screenMidY = this.app.renderer.height / 2;
    if (this.alien.y < screenMidY && !this.objectsBeingSucked.has(this.alien)) {
      const dy = screenMidY - this.alien.y;
      this.alien.y = screenMidY;
      this.highestY -= dy;
     
      for (const monster of this.monsters) {
        monster.sprite.y += dy;
      }
      for (const powerup of this.powerups) {
        powerup.sprite.y += dy;
      }
      for (const blackHole of this.blackHoles) {
        blackHole.y += dy;
      }
      this.solarStorm.y += dy;
      this.background.tilePosition.y += dy;
    }
    }

  private handleCollisions() {
    if (!this.objectsBeingSucked.has(this.alien)) {
      for (let i = this.monsters.length - 1; i >= 0; i--) {
        const monster = this.monsters[i];
        if (
          Math.abs(this.alien.x - monster.sprite.x) < 24 &&
          Math.abs(this.alien.y - monster.sprite.y) < 24
        ) {
          // If rocket is active, apply physics to the monster
          if (this.rocketActive) {
            monster.isHitByRocket = true;
            // Calculate direction from alien to monster
            const dx = monster.sprite.x - this.alien.x;
            const dy = monster.sprite.y - this.alien.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
              // Normalize and scale the direction for the knockback force
              const knockbackForce = 10; // Adjust this value for stronger/weaker knockback
              const knockbackX = (dx / distance) * knockbackForce;
              const knockbackY = (dy / distance) * knockbackForce;
              
              // Apply the knockback velocity
              monster.vx = knockbackX;
              monster.vy = knockbackY - 5; // Add some upward force
              
              // Add rotation effect based on velocity
              monster.sprite.rotation = Math.atan2(monster.vy, monster.vx);
              if (this.multiplierActive) {
                this.addRubies(2);
              } else {
                this.addRubies(1);
              }

            return;
          }
        }
          
          // Normal monster collision 
          this.monsterLayer.removeChild(monster.sprite);
          this.monsters.splice(i, 1);
          this.handleMonsterCollision(monster);
          return;
      }

    if (!this.objectsBeingSucked.has(this.alien)) {
      // Only check powerup collisions every 3 frames for better performance
      if (this.frameCount % 3 === 0) {
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const powerup = this.powerups[i];
        if (
          Math.abs(this.alien.x - powerup.sprite.x) < 32 &&
          Math.abs(this.alien.y - powerup.sprite.y) < 32
        ) {
          if (powerup.type === 'rocket') {
            this.rocketActive = true;
            this.rocketTimer = 4000;
            // Make player invulnerable when collecting rocket
            this.isVulnerable = false;
            this.damageTimer = 0;
            this.slowdownTimer = 0;
            this.alien.visible = true; // Ensure alien is visible
            if (this.multiplierActive) {
              this.addRubies(4);
            } else {
              this.addRubies(2);
            }
          } else if (powerup.type === 'powercell') {
            this.powercellActive = true;
            this.powercellTimer = 1000;
            if (this.multiplierActive) {
              this.addRubies(2);
            } else {
              this.addRubies(1);
            }
          } else if (powerup.type === 'multiplier') {
            updateUserPowerups(this.userId, 'multiplier', 1);
            this.multiplierPowerupsEarned++;  
          } else if (powerup.type === 'extra-life') {
            updateUserPowerups(this.userId, 'extra-life', 1);
            this.extraLifePowerupsEarned++;
          } else if (powerup.type === 'betting') {
            updateUserPowerups(this.userId, 'betting', 1);
            this.bettingPowerupsEarned++;
          }
            this.powerupLayer.removeChild(powerup.sprite);
            this.powerups.splice(i, 1); 
          }
        }
      }
    }

    // Black hole collision and suck-in effect
    if (this.frameCount % 4 === 0) {
    for (const blackHole of this.blackHoles) {
      // Check alien collision
      if (!this.objectsBeingSucked.has(this.alien) && 
          Math.abs(this.alien.x - blackHole.x) < 40 &&
          Math.abs(this.alien.y - blackHole.y) < 40 && !this.rocketActive) {
        this.lastCollisionObject = blackHole; // Track the black hole that collided
        this.objectsBeingSucked.set(this.alien, {
          target: blackHole,
          progress: 0,
          initialScale: this.alien.scale.x
        });
      }
      
      // Check monster collisions
      for (const monster of this.monsters) {
        if (!this.objectsBeingSucked.has(monster.sprite) &&
            Math.abs(monster.sprite.x - blackHole.x) < 40 &&
            Math.abs(monster.sprite.y - blackHole.y) < 40) {
          this.objectsBeingSucked.set(monster.sprite, {
            target: blackHole,
            progress: 0,
            initialScale: monster.sprite.scale.x
          });
        }
      }
      
      // Check powerup collisions
      for (const powerup of this.powerups) {
        if (!this.objectsBeingSucked.has(powerup.sprite) &&
            Math.abs(powerup.sprite.x - blackHole.x) < 40 &&
            Math.abs(powerup.sprite.y - blackHole.y) < 40) {
          this.objectsBeingSucked.set(powerup.sprite, {
            target: blackHole,
            progress: 0,
            initialScale: powerup.sprite.scale.x
          });
          }
        }
        }
      }
    }
  }
}

  private handleMonsterCollision(monster: any) {
    console.log('handleMonsterCollision', this.isVulnerable);
    this.lastCollisionObject = monster.sprite; // Track the monster that collided
    
    if (this.isVulnerable) {
      // Second hit while vulnerable = death
      if (this.extraLifeActive) {
        this.extraLifeActive = false;
        this.showExtraLifePowerupDisplay();
        return;
      }
      else {
        this.isGameOver = true;
        this.showGameOver();
        return;
      }
    }
    else {
      // First hit - take damage
      this.isVulnerable = true;
      this.damageTimer = this.damageDuration;
      this.slowdownTimer = this.slowdownDuration;
    }
  }

  private updateDamageSystem() {
    // Update damage timer
    if (this.damageTimer > 0) {
      this.damageTimer -= Ticker.shared.deltaMS;
      if (this.damageTimer <= 0) {
        this.isVulnerable = false;
        this.damageTimer = 0;
      }
    }
    
    // Update slowdown timer
    if (this.slowdownTimer > 0) {
      this.slowdownTimer -= Ticker.shared.deltaMS;
      if (this.slowdownTimer <= 0) {
        this.slowdownTimer = 0;
      }
    }
    
    // Handle blinking effect when vulnerable
    if (this.isVulnerable && this.damageTimer > 0) {
      // Blink every 100ms (10 times per second)
      const blinkInterval = 100;
      const timeInVulnerableState = this.damageDuration - this.damageTimer;
      const shouldBeVisible = Math.floor(timeInVulnerableState / blinkInterval) % 2 === 0;
      this.alien.visible = shouldBeVisible;
    } else {
      this.alien.visible = true;
    }
  }

  private updateSuckAnimations() {
    if (this.objectsBeingSucked.has(this.alien) && this.extraLifeActive) {
      this.extraLifeActive = false;
      this.objectsBeingSucked.delete(this.alien);
      this.showExtraLifePowerupDisplay();
      return;
    }
    // Handle suck-in animations for all objects (run every frame for smooth animation)
    for (const [object, suckData] of this.objectsBeingSucked.entries()) {
      suckData.progress += 0.016;
      
      if (suckData.progress >= 1) {
        if (object === this.alien) {
          // Alien died
          this.isGameOver = true;
          this.showGameOver();
          return;
        } else {
          // Remove other objects from scene and arrays
          // Remove object from appropriate layer based on type
          if (this.monsters.some(m => m.sprite === object)) {
            this.monsterLayer.removeChild(object);
          } else if (this.powerups.some(p => p.sprite === object)) {
            this.powerupLayer.removeChild(object);
          } else if (this.blackHoles.includes(object)) {
            this.blackHoleLayer.removeChild(object);
          }
          
          // Remove from monsters array
          this.monsters = this.monsters.filter(m => m.sprite !== object);
          
          // Remove from powerups array
          this.powerups = this.powerups.filter(p => p.sprite !== object);
        }
        
        this.objectsBeingSucked.delete(object);
        continue;
      }
      
      // Move object towards black hole center
      const targetX = suckData.target.x;
      const targetY = suckData.target.y;
      object.x += (targetX - object.x) * 0.05;
      object.y += (targetY - object.y) * 0.05;
      
      // Rotate object as it's being sucked in
      object.rotation += 0.08;
      
      // Shrink object
      object.scale.x = suckData.initialScale * (1 - suckData.progress);
      object.scale.y = suckData.initialScale * (1 - suckData.progress);
    }
  }

  private updateSolarStorm = () => {
    if (this.objectsBeingSucked.has(this.alien)) {
      return;
    }
    
    const stormScreenY = this.solarStormY - this.highestY;
    const isOffScreen = stormScreenY > this.app.renderer.height;
    
    this.baseSolarStormCatchupSpeed = Math.min(this.baseSolarStormCatchupSpeed*this.speedIncreaseMultiplier, this.maxSolarStormCatchupSpeed)
    this.baseSpeedSolarStorm = Math.min(this.baseSpeedSolarStorm*this.speedIncreaseMultiplier, this.maxSpeedSolarStorm);
    const currentSpeed = isOffScreen ?  this.baseSolarStormCatchupSpeed : this.baseSpeedSolarStorm
    const stormSpeed = this.isMobile ? currentSpeed * 2 : currentSpeed;
    this.solarStormY -= stormSpeed;
    
    const alienTopForCap = this.alien.y - this.alien.height / 2;
    const maxStormTop = alienTopForCap + 500;
    const currentStormTop = this.solarStormY - this.highestY;
    if (currentStormTop > maxStormTop) {
      this.solarStormY = this.highestY + maxStormTop;
    }
    
    this.solarStorm.y = this.solarStormY - this.highestY;
   
    if (!this.objectsBeingSucked.has(this.alien)) {
      const stormTop = this.solarStorm.y;
      const stormBottom = this.solarStorm.y + this.solarStorm.height;
      const alienTop = this.alien.y - this.alien.height / 2;
      const alienBottom = this.alien.y + this.alien.height / 2;
      
      if (alienBottom > stormTop && alienTop < stormBottom) {
        const stormLeft = this.solarStorm.x;
        const stormRight = this.solarStorm.x + this.solarStorm.width;
        const alienLeft = this.alien.x - this.alien.width / 2;
        const alienRight = this.alien.x + this.alien.width / 2;
        
        if (alienRight > stormLeft && alienLeft < stormRight) {
          if (this.extraLifeActive) {
            this.lastCollisionObject = this.solarStorm;
            this.extraLifeActive = false;
            this.showExtraLifePowerupDisplay();
            return;
          } else {
            this.isGameOver = true;
            this.showGameOver();
          }
        }
      }
    }
    
    const currentHeight = this.spawnY - this.alienWorldY;
  }

  private cleanupOffScreenObjects() {
    // Remove monsters that have gone below the screen
    this.monsters = this.monsters.filter(monster => {
      if (monster.sprite.y > this.app.renderer.height + 50) {
        this.monsterLayer.removeChild(monster.sprite);
        return false; 
      }
      return true;
    });
   
    // Remove powerups that have gone below the screen
    this.powerups = this.powerups.filter(powerup => {
      if (powerup.sprite.y > this.app.renderer.height + 50) {
        this.powerupLayer.removeChild(powerup.sprite);
        return false; 
      }
      return true;
    });
    
    // Remove black holes that have gone below the screen
    this.blackHoles = this.blackHoles.filter(blackHole => {
      if (blackHole.y > this.app.renderer.height + 50) {
        this.blackHoleLayer.removeChild(blackHole);
        return false; 
      }
      return true; 
    });
  }
    
  private updateVisualEffects() {
    if (this.frameCount % this.animationUpdateInterval === 0) {
      this.blackHolePulseTime += Ticker.shared.deltaMS * 0.005;
    for (const blackHole of this.blackHoles) {
        const pulseScale = 0.1 + Math.sin(this.blackHolePulseTime) * 0.01;
      blackHole.scale.x = pulseScale;
      blackHole.scale.y = pulseScale;
      }
    }
   
    if (this.frameCount % this.animationUpdateInterval === 0) {
      this.powerupTiltTime += Ticker.shared.deltaMS * 0.003; 
    for (const powerup of this.powerups) {
        const tiltAngle = Math.sin(this.powerupTiltTime) * 0.1;
      powerup.sprite.rotation = tiltAngle;
      }
    }
    }
   
  private updateMonsterMovement() {
    if (this.frameCount % this.animationFrameSkip === 0) {
    for (const monster of this.monsters) {
      monster.sprite.x += monster.vx;
      monster.sprite.y += monster.vy;
      if (monster.isHitByRocket) { // remove when off screen in x and y directions
        if (monster.sprite.y > this.app.renderer.height || monster.sprite.x > this.app.renderer.width || monster.sprite.x < 0) {
          this.monsterLayer.removeChild(monster.sprite);
          this.monsters = this.monsters.filter(m => m.sprite !== monster.sprite);
        }
      } else { // bounce off walls
        if (monster.sprite.x < 24 || monster.sprite.x > this.app.renderer.width - 24) monster.vx *= -1;
        if (monster.sprite.y < 0 || monster.sprite.y > this.app.renderer.height - 200) monster.vy *= -1;
      }
    }
  }
}

  public resize() {
    if (this.startOverlay) {
      this.startOverlay.width = this.app.renderer.width;
      this.startOverlay.height = this.app.renderer.height;
      this.startOverlay.children[0].width = this.app.renderer.width;
      this.startOverlay.children[0].height = this.app.renderer.height;
      this.startOverlay.children[1].x = this.app.renderer.width / 2;
      this.startOverlay.children[1].y = this.app.renderer.height / 2;
      this.startOverlay.hitArea = new Rectangle(0, 0, this.app.renderer.width, this.app.renderer.height);
    }
  }

  public destroy(options?: any) {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    Ticker.shared.remove(this.update, this);
    super.destroy(options);
  }
} 