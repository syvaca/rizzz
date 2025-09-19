import { Application, Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import { ResizableScene } from '../../SceneManager';
import { updateUserRubies } from "../../../firebase";

export class BoulderBashScene extends Container implements ResizableScene {
  /* ─────────────────────────────── Config ──────────────────────────────── */
  private readonly TARGET_RELEASE_MS = 300; // target stays available to hit for longer for more forgiving gameplay
  private BOULDERS_SPEED_MS = 1200; // current speed (will increase each round)
  private readonly BOULDER_SPAWN_Y = 100; // asteroid spawn

  // Timing windows (ms) – made larger for more forgiving gameplay
  private static readonly BASE_PERFECT = 200;
  private static readonly BASE_GOOD = 300;
  private perfectWindow!: number;
  private goodWindow!: number;
  private correctHits = 0;

  /* ───────────────────────────── Game Objects ─────────────────────────── */
  private targets: Sprite[] = [];
  private background!: Sprite;
  private boulderLayer!: Container;
  private targetLayer!: Container;

  /* ──────────────────────── Visual Boulder Scheduling ─────────────────────── */
  private scheduledBoulders: Array<{
    targetId: number;
    spawnTime: number;
    expectedHitTime: number;
    targetX: number;
    targetY: number;
    targetSize: number;
    sprite?: Sprite;
  }> = [];

  /* ─────────────────────────────── State ──────────────────────────────── */
  private accentMap: number[] = [];
  private activeCues: Map<number, number[]> = new Map(); // queue of expected hit times per target

  private sceneEnded = false;
  private startPerfTime = 0; // performance.now() at game start
  private readonly beatsTarget: number = 32; // beats per round
  private completedCues = 0;
  private readonly initialDelayMs = 1000; // 1 second delay  

  
  private score = 0;
  private streak = 0;
  private maxStreak = 0;

  /* Lives & round state */
  private lives = 3;
  private currentRound = 1;
  private roundStarted = false;

  /* UI */
  private scoreContainer!: Container; // container for score and ruby
  private scoreRuby!: Sprite;
  private scoreText!: Text;
  private streakText!: Text;
  private heartSprites: Sprite[] = [];
  private robotSprite!: Sprite;
  private robotTextures: Texture[] = [];


  constructor(
    private readonly app: Application,
    private readonly user_id: string,
    private readonly onStart: () => void,
  ) {
    super();

    // Allow child sprites to receive pointer events
    this.eventMode = 'auto';

    const factor = Math.pow(0.9, 0);
    this.perfectWindow = BoulderBashScene.BASE_PERFECT * factor;
    this.goodWindow = BoulderBashScene.BASE_GOOD * factor;

    /* Visuals */
    this.background = Sprite.from('boulderBashBackground');
    this.addChild(this.background);

    this.boulderLayer = new Container();
    this.addChild(this.boulderLayer); // boulders go below targets

    this.targetLayer = new Container();
    this.addChild(this.targetLayer);  // targets go above boulders
    
    const robotSprite = new Sprite(Texture.from('robot-1.png'));

    robotSprite.anchor.set(0.5, 1); // center horizontally, bottom aligned
    robotSprite.scale.set(0.1); // adjust size to taste
    this.addChild(robotSprite);
    this.robotSprite = robotSprite; // optionally store as a member if needed later
    this.robotTextures = [
      Texture.from('robot-1.png'), // 3 lives
      Texture.from('robot-2.png'), // 2 lives
      Texture.from('robot-3.png'), // 1 life
    ];
    
    this.createTargets();
    this.createHUD();
    this.resize();

    /* Bind input */
    this.targets.forEach((target, idx) => {
      target.on('pointerdown', () => this.onTargetPress(idx));
    });

    /* Keyboard support */
    window.addEventListener('keydown', this.onKeyPress);

    /* Start the first round */
    this.showStartOverlay();
  }

  /* ────────────────────────────── Setup Helpers ───────────────────────── */
  private buildAccentPattern(): number[] {
    this.BOULDERS_SPEED_MS = Math.max(1300 - this.currentRound * 100, 200); 

    // generate random accents for each round
    const pattern: number[] = [];
    const targets = [1,2,3,4];
    for (let beat = 0; beat < this.beatsTarget; beat++) {
      let target: number;
      do {
        target = targets[Math.floor(Math.random() * targets.length)];
      } while (beat>0 && target === pattern[beat-1]);
      pattern.push(target);
    }
    return pattern;
  }

  private createTargets() {
    for (let i = 0; i < 4; i++) {
      const sprite = new Sprite(Texture.from('target.png'));
      sprite.anchor.set(0.5);
      sprite.eventMode = 'static';
      sprite.cursor = 'pointer';
      this.targets.push(sprite);
      this.targetLayer.addChild(sprite);
    }
  }

  private updateTargetsPosition() {
    const { width, height } = this.app.renderer;
    const size = Math.min(width, height) * 0.7;
    const gap = 8;
    const targetSize = (size - gap * (this.targets.length - 1)) / this.targets.length;
    const totalWidth = targetSize * this.targets.length + gap * (this.targets.length - 1);
  
    const startX = (width - totalWidth) / 2;
    const robotTopY = this.robotSprite.y - this.robotSprite.height;
    const startY = robotTopY - targetSize - 20; // 20px gap above robot
  
    this.targets.forEach((target, i) => {
      target.width = target.height = targetSize;
      target.x = startX + i * (targetSize + gap) + targetSize / 2;
      target.y = startY + targetSize / 2;
    });
  }

  private createRuby() {
    this.scoreContainer = new Container();
    this.scoreRuby = new Sprite(Texture.from('ruby.png'));
    this.scoreRuby.anchor.set(0.5);
    this.scoreRuby.scale.set(0.1); // Adjust scale as needed

    // position in its container
    this.scoreRuby.x = 10;
    this.scoreRuby.y = 24;
    
    this.scoreContainer.addChild(this.scoreRuby);
  }
  
  private createHUD() {
    this.createRuby();
    this.scoreText = new Text(`${this.score}`, {
      fontFamily: 'Chewy',
      fontSize: 32,
      fill: 0xffffff,
      stroke: 0x000000
    });

    // position score to the right of the ruby
    this.scoreText.x = this.scoreRuby.width + 8;
    this.scoreText.y = (this.scoreRuby.height - this.scoreText.height) / 2 + 10;
    this.scoreContainer.addChild(this.scoreText);
    
    this.addChild(this.scoreContainer);

    this.streakText = new Text('', {
      fontFamily: 'Chewy', fontSize: 28, fill: 0xffff66, stroke: 0x000000,
    });
    this.addChild(this.streakText);

    // Hearts for lives
    const fullTex = Texture.from('heart-full.png');
    for (let i = 0; i < 3; i++) {
      const spr = new Sprite(fullTex);
      spr.scale.set(0.15);
      this.heartSprites.push(spr);
      this.addChild(spr);
    }

    this.updateHUDPosition();
    this.updateHUD();
  }

  private updateHUDPosition() {
    const { width } = this.app.renderer;
    const topPadding = 16;
  
    const leftWidth = width * 0.25;
    const centerWidth = width * 0.5;
    const rightWidth = width * 0.25;
  
    // ─── Hearts (Left 25%) ───
    const heartAreaCenterX = leftWidth / 2;
    const heartSpacing = 4;
    const totalHeartsWidth = this.heartSprites.reduce((acc, h) => acc + h.width, 0) + heartSpacing * (this.heartSprites.length - 1);
    let hx = heartAreaCenterX - totalHeartsWidth / 2;
    const hy = topPadding;
  
    this.heartSprites.forEach((spr) => {
      spr.x = hx;
      spr.y = hy;
      hx += spr.width + heartSpacing;
    });

    // ─── Ruby + Score (Right 25%) ───
    const bounds = this.scoreContainer.getLocalBounds();
    const scoreX = leftWidth + centerWidth + (rightWidth - bounds.width) / 2;
  
    this.scoreContainer.x = scoreX;
    this.scoreContainer.y = topPadding;
  
    if (this.streakText) {
      this.streakText.x = this.scoreContainer.x + (bounds.width - this.streakText.width) / 2;
      this.streakText.y = this.scoreContainer.y + bounds.height + 8;
    }
  }

  private updateRobotPosition() {
    const { width, height } = this.app.renderer;
  
    const maxScale = 0.5;
    const minDimension = Math.min(width, height);
    
    // Robot size should scale with screen size
    const desiredScale = minDimension / 1000; // tweak 1000 to adjust scale responsiveness
    const finalScale = Math.min(desiredScale, maxScale);
  
    this.robotSprite.scale.set(finalScale*.2);
  
    this.robotSprite.x = width / 2;
  
    const paddingBelow = 40; // fixed pixel padding below the robot
    this.robotSprite.y = height - paddingBelow;
  }
  
  private updateBouldersPosition() {
    const { width, height } = this.app.renderer;
    this.scheduledBoulders.forEach(entry => {
      const target = this.targets[entry.targetId - 1];
      // update where future spawns will start
      entry.targetX = target.x;
      entry.targetY = target.y;
      entry.targetSize = target.width;

      // if the sprite’s already on‐screen, resize & reposition it too
      if (entry.sprite) {
        entry.sprite.width = target.width;
        entry.sprite.height = target.height;
        entry.sprite.x = target.x;
      }
    });
  }

  private updateBackgroundPosition() {
    const { width, height } = this.app.renderer;
    // Resize background
    if (this.background) {
      const texW = this.background.texture.width;
      const texH = this.background.texture.height;
      const scaleBg = Math.max(width / texW, height / texH);
      this.background.scale.set(scaleBg);
      this.background.x = (width - texW * scaleBg) / 2;
      this.background.y = (height - texH * scaleBg) / 2;
    }
  }

  public resize() {
    this.updateBackgroundPosition();
    this.updateRobotPosition();
    this.updateTargetsPosition();
    this.updateHUDPosition();
    this.updateBouldersPosition();
  }

  /* ───────────────────────────── Gameplay Flow ─────────────────────────── */
  private showStartOverlay() {
    const layer = new Container();
    layer.eventMode = 'static';
  
    const bg = new Graphics();
    bg.beginFill(0x000000, 0.7);
    bg.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    bg.endFill();
    layer.addChild(bg);
  
    const roundText = new Text(`Round ${this.currentRound}`, {
      fontFamily: 'Chewy', fontSize: 48, fill: 0xffff66, stroke: 0x000000, align: 'center',
    });
    roundText.anchor.set(0.5);
    roundText.x = this.app.renderer.width / 2;
    roundText.y = this.app.renderer.height / 2 - 80;
    layer.addChild(roundText);

    const info = new Text('Destroy the boulders before they hit you!', {
      fontFamily: 'Chewy', fontSize: 24, fill: 0xffffff, stroke: 0x000000, align: 'center',
      wordWrap: true, wordWrapWidth: this.app.renderer.width * 0.8,
    });
    info.anchor.set(0.5);
    info.x = this.app.renderer.width / 2;
    info.y = this.app.renderer.height / 2 - 20;
    layer.addChild(info);
  
    const countdown = new Text('', {
      fontFamily: 'Chewy',
      fontSize: 96,
      fill: 0xffff66,
      stroke: 0x000000
    });
    countdown.anchor.set(0.5);
    countdown.x = this.app.renderer.width / 2;
    countdown.y = this.app.renderer.height / 2 + 60;
    layer.addChild(countdown);
  
    this.addChild(layer);
  
    const countdownSequence = ['3', '2', '1', 'GO!'];
    let index = 0;
  
    const updateCountdown = () => {
      if (index < countdownSequence.length) {
        countdown.text = countdownSequence[index++];
        setTimeout(updateCountdown, 1000);
      } else {
        this.removeChild(layer);
        layer.destroy({ children: true });
        this.startRound();
      }
    };
  
    setTimeout(updateCountdown, 1000);
  }
  

  private startRound() {
    // Clear previous round data
    this.clearRoundData();
    
    // Start game clock
    this.startPerfTime = performance.now(); 

    // Start round immediately so misses count from the beginning
    this.roundStarted = true;

    this.app.ticker.add(this.update, this);
    
    // Generate new accent pattern for this round
    this.accentMap = this.buildAccentPattern();
    
    // Generate game sequence for this round
    for (let beatIndex = 0; beatIndex < this.beatsTarget; beatIndex++) {
      const targetId = this.accentMap[beatIndex];
      if (targetId === 0) continue;
      const expectedHit = this.startPerfTime + beatIndex * 600 + this.initialDelayMs; // 0.6 second intervals (100 BPM)
      const spawnTime = expectedHit - this.BOULDERS_SPEED_MS;
      const target = this.targets[targetId - 1];
      this.scheduledBoulders.push({ targetId, spawnTime, expectedHitTime: expectedHit, targetX: target.x, targetY: target.y, targetSize: target.width });
      this.scheduleCue(targetId, expectedHit);
    }
  }

  private clearRoundData() {
    // Clear scheduled boulders
    this.scheduledBoulders.forEach(entry => {
      if (entry.sprite) {
        this.boulderLayer.removeChild(entry.sprite);
        entry.sprite.destroy();
      }
    });
    this.scheduledBoulders = [];
    
    // Clear active cues
    this.activeCues.clear();
    
    // Reset completed cues for this round
    this.completedCues = 0;
  }

  private async update(_ticker: any) {
    if (this.sceneEnded) return;
    const now = performance.now();
    this.boulderMovement(now);
    this.processExpiredCues(now);

    // ─── Target Rotation ───
    this.targets.forEach((target, i) => {
      const direction = i % 2 === 0 ? 1 : -1; // Even: clockwise, Odd: counterclockwise
      target.rotation += direction * 0.005; // Adjust speed here
    });

    // Check if round is complete
    if (this.activeCues.size === 0 && !this.sceneEnded) {
      this.app.ticker.remove(this.update, this);
      this.roundStarted = false;
      
      if (this.lives > 0) {
        // Round completed successfully, move to next round
        this.currentRound++;
        this.showRoundCompleteOverlay();
      } else {
        // Game over
        this.sceneEnded = true;
        this.showOutOfLivesOverlay();
      }
    }
  }

  private shakeScreen() {
    const originalX = this.x;
    const originalY = this.y;
    const duration = 400; // ms
    const magnitude = 8;
  
    const startTime = performance.now();
  
    const shake = (ticker: Ticker) => {
      const now = performance.now();
      const elapsed = now - startTime;
  
      if (elapsed >= duration) {
        this.app.ticker.remove(shake, this);
        this.x = originalX;
        this.y = originalY;
        return;
      }
  
      const progress = elapsed / duration;
      const intensity = magnitude * (1 - progress);
  
      this.x = originalX + (Math.random() - 0.5) * intensity;
      this.y = originalY + (Math.random() - 0.5) * intensity;
    };
  
    this.app.ticker.add(shake, this);
  }
  
  

  private boulderMovement(now: number) {
    for (let i = this.scheduledBoulders.length - 1; i >= 0; i--) {
      const entry = this.scheduledBoulders[i];
      // spawn it once
      if (!entry.sprite) {
        // grab the same unlit texture you already use for targets
        const asteroidVariants = ['boulder-1.png', 'boulder-2.png', 'boulder-3.png'];
        const randomIndex = Math.floor(Math.random() * asteroidVariants.length);
        const tex = Texture.from(asteroidVariants[randomIndex]);
        const boulder = new Sprite(tex);
        boulder.width = entry.targetSize;
        boulder.height = entry.targetSize;
        boulder.anchor.set(0.5);
        boulder.x = entry.targetX;
        boulder.y = this.BOULDER_SPAWN_Y;
        boulder.visible = true;
        this.boulderLayer.addChild(boulder);
        entry.sprite = boulder;
      }

      // move it up over [0→travelTime]
      const elapsed = now - entry.spawnTime;
      const t = Math.min(elapsed / this.BOULDERS_SPEED_MS, 1);
      entry.sprite!.y = this.BOULDER_SPAWN_Y + (entry.targetY - this.BOULDER_SPAWN_Y) * t;

      // once it reaches the target, remove the graphic
      if (t >= 1 && entry.sprite) {
        this.boulderLayer.removeChild(entry.sprite);
        entry.sprite.visible = false;
        this.scheduledBoulders.splice(i, 1);
        entry.sprite.destroy();
        continue;
      }
    }
  }

  private scheduleCue(targetId: number, expectedHitTime: number) {
    const idx = targetId - 1; // targetId is 1-4, convert to 0-3 index
    
    // Store the cue for hit detection (allow multiple pending cues per target)
    const queue = this.activeCues.get(targetId) ?? [];
    queue.push(expectedHitTime);
    queue.sort((a, b) => a - b); // keep earliest first
    this.activeCues.set(targetId, queue);
  }

  private processExpiredCues(now: number) {
    [...this.activeCues.entries()].forEach(([targetId, queue]) => {
      const idx = targetId - 1;
      while (queue.length && now > queue[0] + this.TARGET_RELEASE_MS) {
        // Missed this cue
        if (this.roundStarted) {
          this.registerMiss(idx);
        }
        queue.shift();
      }
      if (queue.length === 0) {
        this.activeCues.delete(targetId);
      }
    });
  }

  private onTargetPress(idx: number) {
    if (!this.roundStarted) {
      this.roundStarted = true;
    }

    // Determine cue queue for this target
    const targetId = idx + 1;
    const queue = this.activeCues.get(targetId);
    if (!queue || queue.length === 0) {
      // No pending cue – miss
      this.registerMiss(idx);
      return;
    }

    const expectedHitTime = queue[0];
    const now = performance.now();
    const absDelta = Math.abs(now - expectedHitTime);

    if (absDelta <= this.perfectWindow) {
      this.registerHit(idx, 'Perfect', 2);
    } else if (absDelta <= this.goodWindow) {
      this.registerHit(idx, 'Good', 1);
    } else {
      this.registerMiss(idx);
      return;
    }

    // Remove the processed cue
    queue.shift();
    if (queue.length === 0) {
      this.activeCues.delete(targetId);
    }
  }

  private onKeyPress = (e: KeyboardEvent) => {
    if (this.sceneEnded) return;
  
    const keyMap: Record<string, number> = {
      '1': 0,
      '2': 1,
      '3': 2,
      '4': 3,
      'a': 0,
      's': 1,
      'd': 2,
      'f': 3
    };
  
    const idx = keyMap[e.key];
    if (idx !== undefined) {
      this.onTargetPress(idx);
    }
  };

  private registerHit(idx: number, label: string, points: number) {
    this.score += points;
    this.correctHits +=1;
    this.streak += 1;
    this.maxStreak = Math.max(this.maxStreak, this.streak);
    this.showFeedback(idx, label, 0x66ff66);
    this.updateHUD();

    this.completedCues += 1;
  }

  private registerMiss(idx: number) {
    if (this.roundStarted) {
      this.streak = 0;
      this.lives = Math.max(0, this.lives - 1);
    }

    this.showFeedback(idx, 'Miss', 0xff6666);
    this.updateHUD();

    // Handle out-of-lives end
    if (this.roundStarted && this.lives <= 0 && !this.sceneEnded) {
      this.sceneEnded = true;
      // Stop scheduling further cues
      this.app.ticker.remove(this.update, this);
      this.showOutOfLivesOverlay();
    }
  }

  // Colored feedback over targets for when player hits or misses beat
  private showFeedback(idx: number, text: string, color: number) {
    const target = this.targets[idx];
  
    // If it's a hit (green), show explosion sprite instead of green square
    if (color === 0x66ff66) {
      const explosion = new Sprite(Texture.from('explosion.png'));
      explosion.anchor.set(0.5);
      explosion.width = target.width;
      explosion.height = target.height;
      explosion.x = target.x;
      explosion.y = target.y;
      this.addChild(explosion);
  
      setTimeout(() => {
        this.removeChild(explosion);
        explosion.destroy();
      }, 200);
    } else {
      this.shakeScreen();
    }
  }
  

  private updateHUD() {
    this.scoreText.text = `${this.score}`;
    // update heart textures
    this.heartSprites.forEach((spr, idx) => {
      spr.texture = Texture.from(idx < this.lives ? 'heart-full.png' : 'heart-dark.png');
    });
    // Change robot face based on lives left
    if (this.lives >= 1 && this.lives <= 3) {
      const textureIdx = 3 - this.lives;
      this.robotSprite.texture = this.robotTextures[textureIdx];
    }
    this.updateHUDPosition();
  }

  private showRoundCompleteOverlay() {
    const layer = new Container();
    layer.eventMode = 'static';
  
    const bg = new Graphics();
    bg.beginFill(0x000000, 0.7);
    bg.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    bg.endFill();
    layer.addChild(bg);
  
    const roundCompleteText = new Text('Round Complete!', {
      fontFamily: 'Chewy', fontSize: 48, fill: 0x66ff66, stroke: 0x000000, align: 'center',
    });
    roundCompleteText.anchor.set(0.5);
    roundCompleteText.x = this.app.renderer.width / 2;
    roundCompleteText.y = this.app.renderer.height / 2 - 40;
    layer.addChild(roundCompleteText);

    const nextRoundText = new Text(`Next Round: ${this.currentRound}`, {
      fontFamily: 'Chewy', fontSize: 32, fill: 0xffff66, stroke: 0x000000, align: 'center',
    });
    nextRoundText.anchor.set(0.5);
    nextRoundText.x = this.app.renderer.width / 2;
    nextRoundText.y = this.app.renderer.height / 2 + 20;
    layer.addChild(nextRoundText);
  
    this.addChild(layer);
  
    // Show overlay for 2 seconds, then start next round
    setTimeout(() => {
      this.removeChild(layer);
      layer.destroy({ children: true });
      this.showStartOverlay();
    }, 2000);
  }

  /* ─────────────────────────── Out-of-Lives UI & Audio ─────────────────────────── */
  private async showOutOfLivesOverlay() {
    await updateUserRubies(this.user_id, this.score);

    // Clear round data
    this.clearRoundData();

    const label = new Text(`Game Over!`, {
      fontFamily: 'Chewy',
      fontSize: 64,
      fill: 0xffffff,
      stroke: 0x000000,
    });
    label.anchor.set(0.5);
    label.x = this.app.renderer.width / 2;
    label.y = this.app.renderer.height / 2 - 50;
    this.addChild(label);

    const scoreLabel = new Text(`Final Score: ${this.score}`, {
      fontFamily: 'Chewy',
      fontSize: 32,
      fill: 0xffff66,
      stroke: 0x000000,
    });
    scoreLabel.anchor.set(0.5);
    scoreLabel.x = this.app.renderer.width / 2;
    scoreLabel.y = this.app.renderer.height / 2 + 20;
    this.addChild(scoreLabel);

    const roundsLabel = new Text(`Rounds Survived: ${this.currentRound - 1}`, {
      fontFamily: 'Chewy',
      fontSize: 28,
      fill: 0xcccccc,
      stroke: 0x000000,
    });
    roundsLabel.anchor.set(0.5);
    roundsLabel.x = this.app.renderer.width / 2;
    roundsLabel.y = this.app.renderer.height / 2 + 70;
    this.addChild(roundsLabel);
  
    // Swap robot texture to robot-4.png and fade it out
    this.robotSprite.texture = Texture.from('robot-4.png');
  
    const duration = 2000;
    const startTime = performance.now();
  
    const fadeOut = (time: number) => {
      const progress = Math.min((time - startTime) / duration, 1);
      this.robotSprite.alpha = 1 - progress;
  
      if (progress < 1) {
        requestAnimationFrame(fadeOut);
      }
    };
    requestAnimationFrame(fadeOut);
  
    setTimeout(() => {
      this.onStart();
    }, 3000);
  }

  

  /* ─────────────────────────── Cleanup / Exit ─────────────────────────── */
  public endScene() {
    this.app.ticker.remove(this.update, this);
  }
}