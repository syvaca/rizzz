import { Application, Container, Sprite, Text, Ticker, Graphics, TilingSprite, Texture, Spritesheet, Assets, Rectangle, TextStyle } from 'pixi.js';
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
  private damageDuration: number = 5000; // 5 seconds of vulnerability
  private slowdownTimer: number = 0;
  private slowdownDuration: number = 1000; // 1 second of slowdown
  private slowdownMultiplier: number = 0.8; // 20% speed reduction
  private background!: TilingSprite;
  private visuals!: Spritesheet;
  private powerupVisuals!: Spritesheet;
  private startOverlay?: Container;
  // Container layers for proper z-ordering
  private backgroundLayer!: Container;
  private blackHoleLayer!: Container;
  private powerupLayer!: Container;
  private monsterLayer!: Container;
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
    if (this.isGameOver || !this.gameStarted) return;
    
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
    this.checkGameOverConditions();
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

  private checkGameOverConditions() {

    // Game over if alien falls off bottom (only if not being sucked)
    if (!this.objectsBeingSucked.has(this.alien) && this.alien.y > this.app.renderer.height) {
      this.isGameOver = true;
      this.showGameOver();
    }
  }

  private async showGameOver() {
    // Submit score and rubies to Firebase
    const gameId = 'cosmo-climb'; // Match the ID in games.ts
    const finalScore = this.score;
    
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
      if (this.rubies > 0) {
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
      }
      
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

  private showBettingMenu() {
    // Pause the game
    this.app.ticker.remove(this.update, this);
    
    // Create overlay background
    const overlay = new Graphics();
    overlay.beginFill(0x000000, 0.7);
    overlay.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    overlay.endFill();
    overlay.interactive = true;
    overlay.zIndex = 1000;
    this.addChild(overlay);
    
    // Create container for betting menu
    const menuContainer = new Container();
    menuContainer.width = 300;
    menuContainer.height = 200;
    menuContainer.x = (this.app.renderer.width - 300) / 2;
    menuContainer.y = (this.app.renderer.height - 200) / 2;
    menuContainer.zIndex = 1001;
    
    // Add background for menu
    const menuBg = new Graphics();
    menuBg.beginFill(0x333333);
    menuBg.drawRoundedRect(0, 0, 300, 200, 15);
    menuBg.endFill();
    menuContainer.addChild(menuBg);
    
    // Add title
    const title = new Text('Place Your Bet', {
      fontFamily: 'Chewy',
      fontSize: 28,
      fill: 0xffffff,
      align: 'center'
    });
    title.x = 150 - title.width / 2;
    title.y = 20;
    menuContainer.addChild(title);
    
    // Add bet amount display
    const betAmount = new Text('50', {
      fontFamily: 'Chewy',
      fontSize: 36,
      fill: 0xffd700,
      align: 'center'
    });
    betAmount.x = 150 - betAmount.width / 2;
    betAmount.y = 80;
    menuContainer.addChild(betAmount);
    
    // Add slider
    const sliderBg = new Graphics();
    sliderBg.beginFill(0x666666);
    sliderBg.drawRoundedRect(30, 130, 240, 10, 5);
    sliderBg.endFill();
    menuContainer.addChild(sliderBg);
    
    const sliderKnob = new Graphics();
    sliderKnob.beginFill(0xffffff);
    sliderKnob.drawCircle(0, 0, 15);
    sliderKnob.endFill();
    sliderKnob.x = 150;
    sliderKnob.y = 135;
    sliderKnob.interactive = true;
    sliderKnob.cursor = 'pointer';
    menuContainer.addChild(sliderKnob);
    
    // Slider interaction
    let isDragging = false;
    const minX = 30;
    const maxX = 270;
    let currentBet = 50; // Default bet
    
    const updateBet = (x: number) => {
      // Clamp x position
      const clampedX = Math.max(minX, Math.min(x, maxX));
      sliderKnob.x = clampedX;
      
      // Calculate bet amount (1 to maxRubies)
      const rubies = Math.min(100, this.rubies);
      const ratio = (clampedX - minX) / (maxX - minX);
      currentBet = Math.max(1, Math.round(rubies * ratio));
      betAmount.text = currentBet.toString();
      betAmount.x = 150 - betAmount.width / 2; // Re-center text
    };
    
    sliderKnob.on('pointerdown', (e: any) => {
      isDragging = true;
      const localPos = e.data.getLocalPosition(menuContainer);
      updateBet(localPos.x);
    });
    
    menuContainer.on('pointermove', (e: any) => {
      if (isDragging) {
        const localPos = e.data.getLocalPosition(menuContainer);
        updateBet(localPos.x);
      }
    });
    
    menuContainer.on('pointerup', () => {
      isDragging = false;
    });
    
    // Add BET! button
    const goButton = new Graphics();
    goButton.beginFill(0x4CAF50);
    goButton.drawRoundedRect(100, 160, 100, 30, 10);
    goButton.endFill();
    goButton.interactive = true;
    goButton.cursor = 'pointer';
    
    const goText = new Text('BET!', {
      fontFamily: 'Chewy',
      fontSize: 20,
      fill: 0xffffff
    });
    goText.x = 150 - goText.width / 2;
    goText.y = 165;
    
    goButton.addChild(goText);
    menuContainer.addChild(goButton);
    
    // Handle Go! button click
    goButton.on('pointertap', () => {
      // Set the bet and resume game
      (this as any).userBet = currentBet;
      this.removeChild(overlay);
      this.removeChild(menuContainer);
      this.app.ticker.add(this.update, this);
    });
    
    this.addChild(menuContainer);
  }

  private async createPowerupDisplay() {
    try {
      const powerupContainer = new Container();
      powerupContainer.x = 20;
      powerupContainer.y = this.app.renderer.height - 140; // Position at bottom with some padding
      
      // Add semi-transparent black background
      const bg = new Graphics();
      bg.beginFill(0x000000, 0.7);
      bg.drawRoundedRect(0, 0, 80, 100, 10);
      bg.y = 25;
      bg.endFill();
      powerupContainer.addChild(bg);
      
      // Create powerup icons with blinking animation
      const powerupTypes = ['multiplier', 'extra-life', 'betting'] as const;
      const powerupSprites: Sprite[] = [];
      const powerupTexts: Text[] = [];
      
      // Make the container interactive to handle clicks
      powerupContainer.eventMode = 'static';
      powerupContainer.hitArea = new Rectangle(0, 0, 80, 100);
      
      // Stop event propagation to prevent affecting alien movement
      powerupContainer.on('pointerdown', (e) => {
        e.stopPropagation();
      });
      
      powerupContainer.on('pointerup', (e) => {
        e.stopPropagation();
      });
      
      powerupContainer.on('pointermove', (e) => {
        e.stopPropagation();
      });
      
      powerupTypes.forEach((type, index) => {
        // Create a container for each powerup row
        const rowContainer = new Container();
        rowContainer.y = 40 + index * 30;
        rowContainer.eventMode = 'static';
        rowContainer.cursor = 'pointer';
        rowContainer.hitArea = new Rectangle(0, 0, 200, 30); // Increased width for better click area

        // Add hover effect background
        const hoverGraphics = new Graphics();
        hoverGraphics.beginFill(0xffffff, 0.2);
        hoverGraphics.drawRoundedRect(0, 0, 200, 30, 5);
        hoverGraphics.endFill();
        hoverGraphics.visible = false;
        rowContainer.addChild(hoverGraphics);
        
        // Add hover effects
        rowContainer.on('pointerover', () => {
            hoverGraphics.visible = true;
        });
        
        rowContainer.on('pointerout', () => {
            hoverGraphics.visible = false;
        });
        
        // Create powerup icon
        const sprite = new Sprite(this.powerupVisuals.textures[`${type}-1.png`]);
        sprite.width = 24;
        sprite.height = 24;
        sprite.x = 15;
        
        // Create powerup count text
        const text = new Text({
          text: '0',
          style: new TextStyle({
            fontFamily: 'Chewy',
            fontSize: 20,
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 2, alpha: 1 }
          } as any) // Using 'as any' to bypass TypeScript error for stroke
        });
        text.x = 50;
        
        // Add debug rectangle (can be removed in production)
        const debugRect = new Graphics();
        debugRect.lineStyle(1, 0xff0000, 0.5);
        debugRect.drawRect(0, 0, 200, 30);
        rowContainer.addChild(debugRect);
        hoverGraphics.beginFill(0xffffff, 0.2);
        hoverGraphics.drawRoundedRect(0, 0, 80, 30, 5);
        hoverGraphics.endFill();
        hoverGraphics.visible = false;
        
        // Add click handler
        rowContainer.on('pointertap', async (e) => {
          e.stopPropagation(); // Prevent event from bubbling up
          try {
            // Check if we have this powerup available
            const currentCount = parseInt(text.text, 10); // 
            if (currentCount > 0) {
              // Update the active state based on powerup type
              switch (type) {
                case 'multiplier':
                  this.multiplierActive = true;
                  console.log('Multiplier powerup activated');
                  break;
                case 'extra-life':
                  this.extraLifeActive = true;
                  console.log('Extra life powerup activated');
                  break;
                case 'betting':
                  this.bettingActive = true;
                  console.log('Betting powerup activated');
                  this.showBettingMenu();
                  break;
              }
              
              // Decrement the count in Firebase
              await usePowerup(this.userId, type);
              
              // Update the display
              text.text = `${currentCount - 1}`;
              
              // Log the activation
              console.log(`Activated ${type} powerup`);
              
              // Close the powerup menu after selection
              if ((powerupContainer as any).cleanup) {
                (powerupContainer as any).cleanup();
              }
            }
          } catch (error) {
            console.error(`Error activating ${type} powerup:`, error);
          }
        });
        
        // Add hover effects
        rowContainer.on('pointerover', (e) => {
          e.stopPropagation();
          hoverGraphics.visible = true;
        });
        
        rowContainer.on('pointerout', (e) => {
          e.stopPropagation();
          hoverGraphics.visible = false;
        });
        
        // Add all elements to the row container
        rowContainer.addChild(hoverGraphics);
        rowContainer.addChild(sprite);
        rowContainer.addChild(text);
        
        // Add the row to the main container
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
          if (!powerupSprites[index].destroyed) {
            powerupSprites[index].texture = this.powerupVisuals.textures[`${type}-${frame}.png`];
          }
        });
      }, 500);
      
      // Function to update powerup counts
      const updatePowerupCounts = async () => {
        try {
          const powerups = await getUserPowerups(this.userId);
          powerupTypes.forEach((type, index) => {
            if (!powerupTexts[index].destroyed) {
              powerupTexts[index].text = `${powerups[type]}`;
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
          if (!powerupTexts[index].destroyed) {
            powerupTexts[index].text = `${powerups[type] || 0}`;
          }
        });
      });
      
      this.foregroundLayer.addChild(powerupContainer);
      
      // Store references for cleanup
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
      
    } catch (error) {
      console.error('Error creating powerup display:', error);
    }
  }

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
      //const powerupType = Math.random() < 0.05 ? 'rocket' : Math.random() < 0.97 ? 'powercell' : Math.random() < 0.98 ? 'multiplier' : Math.random() < 0.99 ? 'extra-life' : 'betting';
      // for testing game: 5% chance of rocket, 20% chance of powercell, 25% chance of multiplier, 25% chance of extra life, 25% chance of betting
      const powerupType = Math.random() < 0.05 ? 'rocket' : Math.random() < 0.25 ? 'powercell' : Math.random() < 0.5 ? 'multiplier' : Math.random() < 0.75 ? 'extra-life' : 'betting';
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
          this.handleMonsterCollision();
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
              this.addRubies(2);
            } else {
              this.addRubies(4);
            }
          } else if (powerup.type === 'powercell') {
            this.powercellActive = true;
            this.powercellTimer = 1000;
            if (this.multiplierActive) {
              this.addRubies(1);
            } else {
              this.addRubies(2);
            }
          } else if (powerup.type === 'multiplier') {
            updateUserPowerups(this.userId, 'multiplier', 1);
          } else if (powerup.type === 'extra-life') {
            updateUserPowerups(this.userId, 'extra-life', 1);
          } else if (powerup.type === 'betting') {
            updateUserPowerups(this.userId, 'betting', 1);
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
          Math.abs(this.alien.y - blackHole.y) < 40) {
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

  private handleMonsterCollision() {
    console.log('handleMonsterCollision', this.isVulnerable);
    if (this.isVulnerable) {
      // Second hit while vulnerable = death
      this.isGameOver = true;
      this.showGameOver();
      return;
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
          this.isGameOver = true;
          this.showGameOver();
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