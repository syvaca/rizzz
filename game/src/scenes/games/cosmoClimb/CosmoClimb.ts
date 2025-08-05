import { Application, Container, Sprite, Text, Ticker, Graphics, TilingSprite, Texture, Spritesheet, Assets, Rectangle } from 'pixi.js';
import { ResizableScene } from '../../SceneManager';
import { getUserCoins, updateUserCoins } from '../../../firebase';


interface Monster {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Powerup {
  sprite: Sprite;
  type: 'rocket' | 'powercell';
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
  
  // Damage system
  private isVulnerable: boolean = false;
  private damageTimer: number = 0;
  private damageDuration: number = 5000; // 5 seconds of vulnerability
  private slowdownTimer: number = 0;
  private slowdownDuration: number = 1000; // 1 second of slowdown
  private slowdownMultiplier: number = 0.8; // 20% speed reduction
  private background!: TilingSprite;
  private visuals!: Spritesheet;
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
    
    this.visuals = Assets.get('cosmoClimbVisuals') as Spritesheet;
    
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

  private showGameOver() {
    const overlay = new Graphics();
    overlay.beginFill(0x000000, 0.7);
    overlay.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    overlay.endFill();
    this.addChild(overlay);
    const text = new Text('Game Over', {
      fontFamily: 'Chewy', fontSize: 64, fill: 0xffffff, stroke: 0x000000, strokeThickness: 6, align: 'center'
    } as any);
    text.anchor.set(0.5);
    text.x = this.app.renderer.width / 2;
    text.y = this.app.renderer.height / 2;
    this.addChild(text);
    setTimeout(() => {
      this.removeChild(overlay);
      this.removeChild(text);
    }, 2000);
    setTimeout(() => {
      this.onStart();
    }, 2000);
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

  private generateScoreText() {
    this.scoreText = new Text('0', {
      fontFamily: 'Chewy', fontSize: 32, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4
    } as any);
    this.scoreText.x = 20;
    this.scoreText.y = 20;
    this.foregroundLayer.addChild(this.scoreText);
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

      const powerupType = Math.random() < 0.05 ? 'rocket' : 'powercell';
      const powerupSprite = new Sprite(this.visuals.textures[powerupType === 'rocket' ? 'rocket-off.png' : 'powercell.png']);
      powerupSprite.width = 32;
      powerupSprite.height = 32;
      powerupSprite.anchor.set(0.5);
      powerupSprite.x = x;
      powerupSprite.y = worldY - this.highestY;
      
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
    return { sprite, x: sprite.x, y: sprite.y, vx, vy };
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
      const touchSensitivity = this.isMobile ? 0.75 : 0.6;
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
      if (this.frameCount - this.lastScoreUpdate >= this.scoreUpdateInterval) {
        this.scoreText.text = this.score.toString();
        this.lastScoreUpdate = this.frameCount;
      }
    }
    if (!(newScore % 100)) {
      console.log("curr speed: ", this.baseSpeed);
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
        console.log('monsters', this.monsters);
        this.monsterLayer.removeChild(monster.sprite);
        console.log('monster collision', monster);
        this.monsters.splice(i, 1);
        console.log('monsters', this.monsters);
        this.handleMonsterCollision();
        return;
      }
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
          } else if (powerup.type === 'powercell') {
            this.powercellActive = true;
                this.powercellTimer = 1000; 
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
      // Bounce off walls
      if (monster.sprite.x < 24 || monster.sprite.x > this.app.renderer.width - 24) monster.vx *= -1;
      if (monster.sprite.y < 0 || monster.sprite.y > this.app.renderer.height - 200) monster.vy *= -1;
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