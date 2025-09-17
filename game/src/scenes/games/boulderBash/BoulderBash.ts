import { Assets, AnimatedSprite, Application, Container, Graphics, Sprite, Spritesheet, Text, Texture, Ticker } from 'pixi.js';
import { ResizableScene } from '../../SceneManager';
import type { TrackMeta } from './types';
import { getUserHighScore, updateUserRubies } from "../../../firebase";

export interface BoulderBashParams {
  meta?: TrackMeta;
  round: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'hard';
  bettingMode: string;
}

export class BoulderBashScene extends Container implements ResizableScene {
  public onRoundComplete?: (rubiesEarned: number, streaks: string[], win: boolean) => void;
  /* ─────────────────────────────── Config ──────────────────────────────── */
  private readonly PAD_RELEASE_MS = 300; // pad stays lit longer for more forgiving gameplay
  private TILES_SPEED_MS = 1200; // time it takes for a tile to reach the pad
  private readonly TILE_SPAWN_Y = 100; // astroid spawn

  // Timing windows (ms) – made larger for more forgiving gameplay
  private static readonly BASE_PERFECT = 200;
  private static readonly BASE_GOOD = 300;
  private perfectWindow!: number;
  private goodWindow!: number;
  private correctHits = 0;

  /* ───────────────────────────── Game Objects ─────────────────────────── */
  private pads: Sprite[] = [];
  private padUnlitTextures: Texture[] = [];
  private padLitTextures: Texture[] = [];
  private background!: Sprite;
  private tileLayer!: Container;
  private padLayer!: Container;

  /* ──────────────────────── Visual Tile Scheduling ─────────────────────── */
  private scheduledTiles: Array<{
    padId: number;
    spawnTime: number;
    expectedHitTime: number;
    padX: number;
    padY: number;
    padSize: number;
    sprite?: Sprite;
  }> = [];

  /* ─────────────────────────────── State ──────────────────────────────── */
  private accentMap: number[] = [];
  private lastCueForPad: number[] = [ -Infinity, -Infinity, -Infinity, -Infinity, -Infinity ];
  private activeCues: Map<number, number[]> = new Map(); // queue of expected hit times per pad

  private sceneEnded = false;
  private pendingTimeouts: Set<number> = new Set(); // Track timeouts for cleanup

  private startPerfTime = 0; // performance.now() at game start
  private currentBeat = 0; // last processed beat number (int)
  private nextVisualBeat = 0;
  private readonly beatsTarget: number;            // real length (meta or fallback)
  private completedCues = 1;
  private readonly initialDelayMs = 1000; // 1 second delay  

  
  private score = 0;
  private streak = 0;
  private maxStreak = 0;
  private combos: string[] = [];

  /* Lives & round state */
  private lives = 3;
  private roundStarted = false;
  private tapStartBeat: number | null = null;

  /* UI */
  private scoreContainer!: Container; // container for score and ruby
  private scoreRuby!: Sprite;
  private scoreText!: Text;
  private streakText!: Text;
  private heartSprites: Sprite[] = [];
  private robotSprite!: Sprite;
  private robotTextures: Texture[] = [];

  private readonly params: BoulderBashParams = {
    meta: undefined, // No metadata for now
    round: 1,
    difficulty: 'medium' as const,
    bettingMode: 'standard'
  };


  
  /* ─────────────────────────────── Betting ──────────────────────────────── */
  private pointMultiplier: number = 1;
  private timeModifier: number = 1;
  private goodHit: boolean = false;
  private bettingMode: string = "standard";

  constructor(
    private readonly app: Application,
    private readonly user_id: string,
    private readonly onStart: () => void,
  ) {
    super();

    // Allow child sprites to receive pointer events
    this.eventMode = 'auto';

    const diffStep = 0; // make easier
    const factor = Math.pow(0.9, diffStep);
    this.perfectWindow = BoulderBashScene.BASE_PERFECT * factor;
    this.goodWindow = BoulderBashScene.BASE_GOOD * factor;
    
    this.beatsTarget = 32; // params.meta?.onsets?.length ?? 32;

    /* Pre-processing – build accent pattern */
    this.accentMap = this.buildAccentPattern(this.params.difficulty);

    /* Visuals */
    this.background = Sprite.from('boulderBashBackground');
    this.addChild(this.background);

    this.tileLayer = new Container();
    this.addChild(this.tileLayer); // tiles go below pads

    this.padLayer = new Container();
    this.addChild(this.padLayer);  // pads go above tiles
    
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
    
    this.createPads();
    this.createHUD();
    this.resize();
    
    /* Betting Settings */
    this.setBettingMode();

    /* Bind input */
    this.pads.forEach((pad, idx) => {
      pad.on('pointerdown', () => this.onPadPress(idx));
    });

    /* Keyboard support */
  window.addEventListener('keydown', this.onKeyPress);


    /* Start playback on user click */
    this.showStartOverlay();
  }

  /* ────────────────────────────── Setup Helpers ───────────────────────── */
  private buildAccentPattern(difficulty: 'easy' | 'medium' | 'hard'): number[] {

    if (difficulty === 'easy') {
      this.TILES_SPEED_MS = 1200; // 1.2 seconds to reach the pad
    } else if (difficulty === 'medium') {
      this.TILES_SPEED_MS = 800;
    } else {
      this.TILES_SPEED_MS = 500;
    }

    // generate 31 random accents to push into a pattern
    const pattern: number[] = [];
    const accentPads = [1,2,3,4];
    for (let beat = 0; beat < this.beatsTarget - 1; beat++) {
      let pad: number;
      do {
        pad = accentPads[Math.floor(Math.random() * accentPads.length)];
      } while (beat>0 && pad === pattern[beat-1]);
      pattern.push(pad);
    }
    return pattern;
  }

  private createPads() {
    for (let i = 0; i < 4; i++) {
      const unlit = Texture.from('target.png');
      const lit = Texture.from('target.png'); //not using
      this.padUnlitTextures.push(unlit);
      this.padLitTextures.push(lit);
  
      const sprite = new Sprite(unlit);
      sprite.anchor.set(0.5);
      sprite.eventMode = 'static';
      sprite.cursor = 'pointer';
      this.pads.push(sprite);
      this.padLayer.addChild(sprite);
    }
  }

  private updatePadsPosition() {
    const { width, height } = this.app.renderer;
    const size = Math.min(width, height) * 0.7;
    const gap = 8;
    const padSize = (size - gap * (this.pads.length - 1)) / this.pads.length;
    const totalWidth = padSize * this.pads.length + gap * (this.pads.length - 1);
  
    const startX = (width - totalWidth) / 2;
    const robotTopY = this.robotSprite.y - this.robotSprite.height;
    const startY = robotTopY - padSize - 20; // 20px gap above robot
  
    this.pads.forEach((pad, i) => {
      pad.width = pad.height = padSize;
      pad.x = startX + i * (padSize + gap) + padSize / 2;
      pad.y = startY + padSize / 2;
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
  
  private updateTilesPosition() {
    const { width, height } = this.app.renderer;
    this.scheduledTiles.forEach(entry => {
      const pad = this.pads[entry.padId - 1];
      // update where future spawns will start
      entry.padX = pad.x;
      entry.padY = pad.y;
      entry.padSize = pad.width;

      // if the sprite’s already on‐screen, resize & reposition it too
      if (entry.sprite) {
        entry.sprite.width = pad.width;
        entry.sprite.height = pad.height;
        entry.sprite.x = pad.x;
      }
    });
  }

  private setBettingMode() {
    if (this.params.bettingMode === 'speed') { // done
      this.pointMultiplier = 2;
    } else if (this.params.bettingMode === 'slow') { // done
      this.pointMultiplier = 0.5;
    } else if (this.params.bettingMode === 'double') { // done
      this.lives = 1;
      this.pointMultiplier = 2;
    } else if (this.params.bettingMode === 'perfect') { // done
      //this.roundMultiplier = 5;
    } else if (this.params.bettingMode === 'reverse') { // ?? doesn't always make sense ie sounds

    } else if (this.params.bettingMode === 'chainMulti') { // done
      this.pointMultiplier = 1;
    } else if (this.params.bettingMode === 'chipmunk') { // done
      this.pointMultiplier = 3;
    }

    console.log("Mode: ", this.params.bettingMode);
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
    this.updatePadsPosition();
    this.updateHUDPosition();
    this.updateTilesPosition();
  }

  /* ───────────────────────────── Gameplay Flow ─────────────────────────── */
  private showStartOverlay() {
    const layer = new Container();
    layer.eventMode = 'static';
  
    const bg = new Graphics();
    bg.beginFill(0x000000, 0.4);
    bg.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    bg.endFill();
    layer.addChild(bg);
  
    const info = new Text('Watch the sequence, and tap it on beat!', {
      fontFamily: 'Chewy', fontSize: 28, fill: 0xffffff, stroke: 0x000000, align: 'center',
      wordWrap: true, wordWrapWidth: this.app.renderer.width * 0.8,
    });
    info.anchor.set(0.5);
    info.x = this.app.renderer.width / 2;
    info.y = this.app.renderer.height / 2 - 100;
    layer.addChild(info);
  
    const countdown = new Text('', {
      fontFamily: 'Chewy',
      fontSize: 96,
      fill: 0xffff66,
      stroke: 0x000000
    });
    countdown.anchor.set(0.5);
    countdown.x = this.app.renderer.width / 2;
    countdown.y = this.app.renderer.height / 2 + 20;
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
        this.startGame();
      }
    };
  
    setTimeout(updateCountdown, 1000);
  }
  

  private startGame() {
    // Start game clock
    this.startPerfTime = performance.now(); 

    // Start round immediately so misses count from the beginning
    this.roundStarted = true;

    this.app.ticker.add(this.update, this);
    // Generate game sequence
    for (let beatIndex = 0; beatIndex < this.beatsTarget; beatIndex++) {
      const padId = this.accentMap[beatIndex % this.accentMap.length];
      if (padId === 0) continue;
      const expectedHit = this.startPerfTime + beatIndex * 600 + this.initialDelayMs; // 0.6 second intervals (100 BPM)
      const spawnTime = expectedHit - this.TILES_SPEED_MS;
      const pad = this.pads[padId - 1];
      this.scheduledTiles.push({ padId, spawnTime, expectedHitTime: expectedHit, padX: pad.x, padY: pad.y, padSize: pad.width });
      this.scheduleCue(padId, expectedHit);
    }
  }

  private async update(_ticker: any) {
    if (this.sceneEnded) return;
    const now = performance.now();
    this.tileMovement(now);
    this.processExpiredCues(now);

    // ─── Pad Rotation ───
    this.pads.forEach((pad, i) => {
      const direction = i % 2 === 0 ? 1 : -1; // Even: clockwise, Odd: counterclockwise
      pad.rotation += direction * 0.005; // Adjust speed here
    });

    if (this.activeCues.size === 0 && !this.sceneEnded) {
      this.sceneEnded = true;
      this.app.ticker.remove(this.update, this);
      if (this.lives > 0) {
        this.showWinOverlay();
      } else {
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
  
  

  private tileMovement(now: number) {
    for (let i = this.scheduledTiles.length - 1; i >= 0; i--) {
      const entry = this.scheduledTiles[i];
      // spawn it once
      if (!entry.sprite) {
        // grab the same unlit texture you already use for pads
        const asteroidVariants = ['boulder-1.png', 'boulder-2.png', 'boulder-3.png'];
        const randomIndex = Math.floor(Math.random() * asteroidVariants.length);
        const tex = Texture.from(asteroidVariants[randomIndex]);
        const tile = new Sprite(tex);
        tile.width = entry.padSize;
        tile.height = entry.padSize;
        tile.anchor.set(0.5);
        tile.x = entry.padX;
        tile.y = this.TILE_SPAWN_Y;
        tile.visible = true;
        this.tileLayer.addChild(tile);
        entry.sprite = tile;
      }

      // move it up over [0→travelTime]
      const elapsed = now - entry.spawnTime;
      const t = Math.min(elapsed / this.TILES_SPEED_MS, 1);
      entry.sprite!.y = this.TILE_SPAWN_Y + (entry.padY - this.TILE_SPAWN_Y) * t;

      // once it reaches the pad, remove the graphic
      if (t >= 1 && entry.sprite) {
        this.tileLayer.removeChild(entry.sprite);
        entry.sprite.visible = false;
        this.scheduledTiles.splice(i, 1);
        entry.sprite.destroy();
        continue;
      }
    }
  }

  private scheduleCue(padId: number, expectedHitTime: number) {
    const idx = padId - 1; // padId is 1-4, convert to 0-3 index
    
    // Store the cue for hit detection (allow multiple pending cues per pad)
    const queue = this.activeCues.get(padId) ?? [];
    queue.push(expectedHitTime);
    queue.sort((a, b) => a - b); // keep earliest first
    this.activeCues.set(padId, queue);
  }

  private processExpiredCues(now: number) {
    [...this.activeCues.entries()].forEach(([padId, queue]) => {
      const idx = padId - 1;
      while (queue.length && now > queue[0] + this.PAD_RELEASE_MS) {
        // Missed this cue
        if (this.roundStarted) {
          this.registerMiss(idx);
        }
        // Dim pad
        const pad = this.pads[idx];
        if (pad && this.padUnlitTextures[idx] && !this.sceneEnded) {
          pad.texture = this.padUnlitTextures[idx];
        }
        queue.shift();
      }
      if (queue.length === 0) {
        this.activeCues.delete(padId);
      }
    });
  }

  private onPadPress(idx: number) {
    if (!this.roundStarted) {
      this.roundStarted = true;
      this.tapStartBeat = this.currentBeat;
    }

    // Determine cue queue for this pad
    const padId = idx + 1;
    const queue = this.activeCues.get(padId);
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
      this.goodHit = true;
    } else {
      this.registerMiss(idx);
      return;
    }

    // Remove the processed cue
    queue.shift();
    if (queue.length === 0) {
      this.activeCues.delete(padId);
    }

    // Dim pad shortly after hit
    setTimeout(() => {
      const pad = this.pads[idx];
      pad.texture = this.padUnlitTextures[idx];
    }, 80);
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
      this.onPadPress(idx);
    }
  };

  private registerHit(idx: number, label: string, points: number) {
    this.score += points*this.pointMultiplier;
    this.correctHits +=1;
    this.streak += 1;
    this.maxStreak = Math.max(this.maxStreak, this.streak);
    this.showFeedback(idx, label, 0x66ff66);
    this.updateHUD();

    this.completedCues += 1;
    // Wins round
    if (this.completedCues >= this.beatsTarget && !this.sceneEnded) {
      this.sceneEnded = true;
      this.app.ticker.remove(this.update, this);
      this.showWinOverlay();
    }
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

  // Colored feedback over pads for when player hits or misses beat
  private showFeedback(idx: number, text: string, color: number) {
    const pad = this.pads[idx];
  
    // If it's a hit (green), show explosion sprite instead of green square
    if (color === 0x66ff66) {
      const explosion = new Sprite(Texture.from('explosion.png'));
      explosion.anchor.set(0.5);
      explosion.width = pad.width;
      explosion.height = pad.height;
      explosion.x = pad.x;
      explosion.y = pad.y;
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

  /* ─────────────────────────── Out-of-Lives UI & Audio ─────────────────────────── */
  private async showOutOfLivesOverlay() {

    await updateUserRubies(this.user_id, this.score);

    // Clear asteroids (tileLayer)
    this.scheduledTiles.forEach(entry => {
      if (entry.sprite) {
        this.tileLayer.removeChild(entry.sprite);
        entry.sprite.destroy();
      }
    });
    this.scheduledTiles = [];

    // Clear active cues
    this.activeCues.clear();

    // Reset pad textures
    this.pads.forEach(pad => {
      this.removeChild(pad);
      pad.destroy();
    });
    this.pads = [];

    const label = new Text('You Lose!', {
      fontFamily: 'Chewy',
      fontSize: 64,
      fill: 0xffffff,
      stroke: 0x000000,
    });
    label.anchor.set(0.5);
    label.x = this.app.renderer.width / 2;
    label.y = this.app.renderer.height / 2;
    this.addChild(label);
  
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
    }, 2000);
  }

  private async showWinOverlay() {

    await updateUserRubies(this.user_id, this.score);

    // Clear asteroids (tileLayer)
    this.scheduledTiles.forEach(entry => {
      if (entry.sprite) {
        this.tileLayer.removeChild(entry.sprite);
        entry.sprite.destroy();
      }
    });
    this.scheduledTiles = [];

  // Clear active cues
  this.activeCues.clear();

  // Reset pad textures
  this.pads.forEach(pad => {
    this.removeChild(pad);
    pad.destroy();
  });
  this.pads = []; 
  
    const label = new Text('You Win!', {
      fontFamily: 'Chewy',
      fontSize: 64,
      fill: 0xffffff,
      stroke: 0x000000,
    });
    label.anchor.set(0.5);
    label.x = this.app.renderer.width / 2;
    label.y = this.app.renderer.height / 2;
    this.addChild(label);
  
    const duration = 2000;
    const startY = this.robotSprite.y;
    const startScale = this.robotSprite.scale.x;
  
    const startTime = performance.now();
    const animate = (time: number) => {
      const progress = Math.min((time - startTime) / duration, 1);
      this.robotSprite.y = startY - progress * (this.app.renderer.height + 200); // move off screen
      const scale = startScale * (1 - progress * 0.8); // shrink
      this.robotSprite.scale.set(Math.max(scale, 0.1));
  
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  
    if (this.bettingMode === "perfect" && !this.goodHit) {
      this.combos.push("flawlessFinish");
    } else if (this.bettingMode === "perfect") {
      this.combos.push("flawlessFinishFail");
    } else if (this.bettingMode === "double") {
      this.combos.push("doubleOrNothing");
    }
  
    const currentHighScore = await getUserHighScore(this.user_id, "boulder-bash");
    if (this.score > currentHighScore) {
      this.combos.push("newHighScore");
    }
  
    setTimeout(() => {
      this.onStart();
    }, 2000);
  }
  

  /* ─────────────────────────── Cleanup / Exit ─────────────────────────── */
  public endScene() {
    this.app.ticker.remove(this.update, this);
  }
}