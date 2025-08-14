import * as PIXI from 'pixi.js';
import { ResizableScene } from '../../SceneManager';
import { updateUserRubies } from '../../../firebase';

class LetterTile extends PIXI.Sprite {
  public letter: string;
  public value: number;
  public isSelected = false;
  private baseScale = 1;

  constructor(letter: string, texture: PIXI.Texture, value: number) {
    super(texture);
    this.letter = letter;
    this.value = value;
    this.anchor.set(0.5);
    this.eventMode = 'static';
    this.cursor = 'pointer';
  }

  setBaseScale(scale: number) {
    this.baseScale = scale;
    this.scale.set(scale);
  }

  setSelected(selected: boolean) {
    this.isSelected = selected;
    if (selected) {
      this.scale.set(this.baseScale * 1.08);
      this.tint = 0xffffaa;
    } else {
      this.scale.set(this.baseScale);
      this.tint = 0xffffff;
    }
  }
}

export class QuickTapWords extends PIXI.Container implements ResizableScene {
  private app: PIXI.Application;
  private userId: string;
  private isMobile: boolean;
  private showMapMenu: () => void;

  // State
  private state: 'START' | 'PLAYING' | 'GAME_OVER' = 'START';
  private gameTimer = 0;
  private readonly GAME_DURATION = 15000; // 15s

  // UI containers
  private startContainer!: PIXI.Container;
  private gameContainer!: PIXI.Container;
  private endContainer!: PIXI.Container;

  // UI elements
  private timerText!: PIXI.Text;
  private wordText!: PIXI.Text;
  private gameScoreText!: PIXI.Text;
  private rubySprite!: PIXI.Sprite;
  private finalWordText!: PIXI.Text;
  private scoreText!: PIXI.Text;
  private countdownText!: PIXI.Text;

  private submitBtn!: PIXI.Text;
  private backspaceBtn!: PIXI.Text;
  private clearBtn!: PIXI.Text;

  // Spritesheet
  private textureAtlas: PIXI.Spritesheet | null = null;

  // Letter tiles and selection
  private readonly ROWS = 4;
  private readonly COLS = 5;
  private readonly TOTAL_TILES = 20;
  private tilesContainer!: PIXI.Container;
  private letterTiles: LetterTile[] = [];
  private selectedLetters: LetterTile[] = [];
  private score = 0;

  // Letter values
  private LETTER_VALUES: Record<string, number> = {
    A: 1, B: 3, C: 3, D: 2, E: 1,
    F: 4, G: 2, H: 4, I: 1, J: 8,
    K: 5, L: 1, M: 3, N: 1, O: 1,
    P: 3, Q: 10, R: 1, S: 1, T: 1,
    U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  };

  // Dictionary
  private validWords = new Set<string>();
  private dictionaryLoaded = false;

  // Cleanup
  private countdownInterval: number | null = null;

  constructor(app: PIXI.Application, userId: string, showMapMenu: () => void, isMobile: boolean = false) {
    super();
    this.app = app;
    this.userId = userId;
    this.showMapMenu = showMapMenu;
    this.isMobile = isMobile;

    this.setupBackground();
    this.setupContainers();
    // Start preloading (non-blocking)
    this.loadTextureAtlas();
    this.loadDictionary();
    // Game loop
    this.app.ticker.add(this.gameLoop);
  }

  private gameLoop = (ticker: PIXI.Ticker) => this.update(ticker.deltaMS);

  private async loadTextureAtlas(): Promise<void> {
    try {
      const atlas = await PIXI.Assets.load('/assets/sprites/quickTapWords/quickTapWords.json');
      this.textureAtlas = atlas;
    } catch (err) {
      console.error('Failed to load quickTapWords atlas', err);
      this.textureAtlas = null;
    }
  }

  private async loadDictionary(): Promise<void> {
    if (this.dictionaryLoaded) return;
    const urls = ['/data/words_en.txt', '/assets/data/words_en.txt'];
    let loaded = false;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const text = await res.text();
        const lines = text.split(/\r?\n/);
        for (let w of lines) {
          w = w.trim();
          if (w.length === 0) continue;
          this.validWords.add(w.toLowerCase());
        }
        loaded = true;
        break;
      } catch (e) {
        // try next path
      }
    }
    this.dictionaryLoaded = loaded;
    if (!loaded) console.warn('Could not load word list from /data/words_en.txt or /assets/data/words_en.txt');
  }

  private isWordValid(word: string): boolean {
    if (!word) return false;
    // Expect dictionary to be loaded; if not, treat as invalid to enforce validation
    return this.validWords.has(word.toLowerCase());
  }

  private getTextureForLetter(letter: string): PIXI.Texture {
    const frame = `Flat-Wood_01-${letter}-64x64.png`;
    if (this.textureAtlas && this.textureAtlas.textures[frame]) {
      return this.textureAtlas.textures[frame];
    }
    return PIXI.Texture.WHITE;
  }

  private setupBackground(): void {
    const bg = new PIXI.Graphics();
    bg.beginFill(0x2c3e50);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    this.addChild(bg);
  }

  private setupContainers(): void {
    this.startContainer = new PIXI.Container();
    this.gameContainer = new PIXI.Container();
    this.endContainer = new PIXI.Container();

    this.setupStartScreen();
    this.setupGameScreen();
    this.setupEndScreen();

    this.addChild(this.startContainer);
    this.addChild(this.gameContainer);
    this.addChild(this.endContainer);

    this.showStartScreen();
  }

  private setupStartScreen(): void {
    this.startContainer.removeChildren();

    const title = new PIXI.Text('Quick Tap Words', {
      fontSize: this.isMobile ? 36 : 64,
      fill: 0xffffff,
      fontFamily: 'SuperWater',
      align: 'center',
    });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.app.screen.height / 3;
    this.startContainer.addChild(title);

    const instructions = new PIXI.Text('Tap letters to form the longest valid word in 15 seconds!\nHigher value letters score more.', {
      fontSize: this.isMobile ? 18 : 24,
      fill: 0xcccccc,
      fontFamily: 'Arial',
      align: 'center',
    });
    instructions.anchor.set(0.5);
    instructions.x = this.app.screen.width / 2;
    instructions.y = this.app.screen.height / 2;
    this.startContainer.addChild(instructions);

    const startButton = new PIXI.Text('TAP TO START', {
      fontSize: this.isMobile ? 24 : 32,
      fill: 0x00ff00,
      fontFamily: 'SuperWater',
    });
    startButton.anchor.set(0.5);
    startButton.x = this.app.screen.width / 2;
    startButton.y = this.app.screen.height * 2 / 3;
    this.startContainer.addChild(startButton);

    this.startContainer.eventMode = 'static';
    this.startContainer.on('pointerdown', async (e: any) => {
      e.stopPropagation();
      await this.startGame();
    });
  }

  private async setupGameScreen(): Promise<void> {
    this.gameContainer.removeChildren();

    // Timer display
    this.timerText = new PIXI.Text('15.0', {
      fontSize: this.isMobile ? 32 : 48,
      fill: 0x00ff00,
      fontFamily: 'SuperWater',
    });
    this.timerText.anchor.set(0.5, 0);
    this.timerText.x = this.app.screen.width / 2;
    this.timerText.y = 16;
    this.gameContainer.addChild(this.timerText);

    // Word display
    this.wordText = new PIXI.Text('', {
      fontSize: this.isMobile ? 22 : 28,
      fill: 0xffffff,
      fontFamily: 'Arial',
      align: 'center',
    });
    this.wordText.anchor.set(0.5, 0);
    this.wordText.x = this.app.screen.width / 2;
    this.wordText.y = this.timerText.y + (this.isMobile ? 40 : 50);
    this.gameContainer.addChild(this.wordText);

    // Score display (ruby + number)
    await this.setupGameScoreDisplay();

    // Controls
    this.submitBtn = new PIXI.Text('Submit', { fontSize: this.isMobile ? 20 : 24, fill: 0xffffff, fontFamily: 'SuperWater' });
    this.backspaceBtn = new PIXI.Text('Backspace', { fontSize: this.isMobile ? 20 : 24, fill: 0xffffff, fontFamily: 'SuperWater' });
    this.clearBtn = new PIXI.Text('Clear', { fontSize: this.isMobile ? 20 : 24, fill: 0xffffff, fontFamily: 'SuperWater' });
    [this.submitBtn, this.backspaceBtn, this.clearBtn].forEach(btn => {
      btn.anchor.set(0.5);
      btn.eventMode = 'static';
      btn.cursor = 'pointer';
      this.gameContainer.addChild(btn);
    });
    this.layoutControls();

    this.submitBtn.on('pointerdown', async (e: any) => { e.stopPropagation(); await this.endGame(); });
    this.backspaceBtn.on('pointerdown', (e: any) => { e.stopPropagation(); this.backspaceLetter(); });
    this.clearBtn.on('pointerdown', (e: any) => { e.stopPropagation(); this.clearSelection(); });

    // Tiles container
    this.tilesContainer = new PIXI.Container();
    this.gameContainer.addChild(this.tilesContainer);
  }

  private layoutControls(): void {
    const y = this.app.screen.height - (this.isMobile ? 60 : 80);
    const centerX = this.app.screen.width / 2;
    const gap = this.isMobile ? 120 : 160;
    this.backspaceBtn.x = centerX - gap;
    this.backspaceBtn.y = y;
    this.submitBtn.x = centerX;
    this.submitBtn.y = y;
    this.clearBtn.x = centerX + gap;
    this.clearBtn.y = y;
  }

  private async setupGameScoreDisplay(): Promise<void> {
    try {
      const rubyTexture = await PIXI.Assets.load('/assets/sprites/ruby.png');
      this.rubySprite = new PIXI.Sprite(rubyTexture);
      this.rubySprite.width = 32; this.rubySprite.height = 32;

      const baseFontSize = this.isMobile ? 28 : 28;
      const scaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
      const fontSize = Math.max(20, baseFontSize * scaleFactor);
      this.gameScoreText = new PIXI.Text('0', { fontSize, fill: 0xffffff, fontFamily: 'SuperWater' });

      this.updateGameScorePosition();
      this.gameContainer.addChild(this.rubySprite);
      this.gameContainer.addChild(this.gameScoreText);
    } catch (e) {
      console.error('Failed to setup score display', e);
    }
  }

  private updateGameScorePosition(): void {
    if (!this.rubySprite || !this.gameScoreText) return;
    const margin = this.isMobile ? 15 : 30;
    const totalWidth = 32 + 10 + this.gameScoreText.width;
    const padding = 20;
    this.rubySprite.x = this.app.screen.width - totalWidth - padding;
    this.rubySprite.y = margin;
    this.gameScoreText.x = this.rubySprite.x + 42;
    this.gameScoreText.y = this.rubySprite.y - 5;
  }

  private setupEndScreen(): void {
    this.endContainer.removeChildren();

    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.8);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    this.endContainer.addChild(bg);

    const title = new PIXI.Text("Time's Up!", { fontSize: this.isMobile ? 32 : 48, fill: 0xff0000, fontFamily: 'SuperWater' });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.app.screen.height / 3;
    this.endContainer.addChild(title);

    this.finalWordText = new PIXI.Text('', { fontSize: this.isMobile ? 20 : 28, fill: 0xffffff, fontFamily: 'Arial', align: 'center' });
    this.finalWordText.anchor.set(0.5);
    this.finalWordText.x = this.app.screen.width / 2;
    this.finalWordText.y = this.app.screen.height / 2;
    this.endContainer.addChild(this.finalWordText);

    this.scoreText = new PIXI.Text('Score: 0', { fontSize: this.isMobile ? 24 : 32, fill: 0x00ff00, fontFamily: 'SuperWater' });
    this.scoreText.anchor.set(0.5);
    this.scoreText.x = this.app.screen.width / 2;
    this.scoreText.y = this.app.screen.height * 2 / 3;
    this.endContainer.addChild(this.scoreText);

    this.countdownText = new PIXI.Text('', { fontSize: this.isMobile ? 20 : 24, fill: 0xcccccc, fontFamily: 'Arial' });
    this.countdownText.anchor.set(0.5);
    this.countdownText.x = this.app.screen.width / 2;
    this.countdownText.y = this.app.screen.height * 3 / 4;
    this.endContainer.addChild(this.countdownText);
  }

  private showStartScreen(): void {
    this.state = 'START';
    this.startContainer.visible = true;
    this.gameContainer.visible = false;
    this.endContainer.visible = false;
  }

  private showGameScreen(): void {
    this.state = 'PLAYING';
    this.startContainer.visible = false;
    this.gameContainer.visible = true;
    this.endContainer.visible = false;
  }

  private showEndScreen(): void {
    this.state = 'GAME_OVER';
    this.startContainer.visible = false;
    this.gameContainer.visible = false;
    this.endContainer.visible = true;

    let countdown = 3;
    this.countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        this.countdownText.text = `Returning to map in ${countdown}...`;
      } else {
        this.countdownText.text = 'Returning to map...';
        clearInterval(this.countdownInterval!);
        setTimeout(() => { this.cleanup(); this.showMapMenu(); }, 500);
      }
    }, 1000) as unknown as number;
  }

  private async startGame(): Promise<void> {
    // Ensure atlas and dictionary are loaded
    if (!this.textureAtlas) await this.loadTextureAtlas();
    if (!this.dictionaryLoaded) await this.loadDictionary();

    this.gameTimer = this.GAME_DURATION;
    this.selectedLetters = [];
    this.score = 0;
    this.updateWordAndScore();

    // Clear existing tiles
    if (this.tilesContainer) this.tilesContainer.removeChildren();
    this.letterTiles = [];

    // Create tiles and layout grid
    this.createRandomLetterTiles();
    this.layoutTilesGrid();

    this.showGameScreen();
  }

  private createRandomLetterTiles(): void {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < this.TOTAL_TILES; i++) {
      const letter = letters[Math.floor(Math.random() * letters.length)];
      const tex = this.getTextureForLetter(letter);
      const val = this.LETTER_VALUES[letter] ?? 1;
      const tile = new LetterTile(letter, tex, val);
      tile.on('pointerdown', (e: any) => {
        e.stopPropagation();
        if (this.state !== 'PLAYING') return;
        if (tile.isSelected) {
          this.deselectTile(tile);
        } else {
          this.selectTile(tile);
        }
      });
      this.letterTiles.push(tile);
      this.tilesContainer.addChild(tile);
    }
  }

  private layoutTilesGrid(): void {
    if (!this.tilesContainer) return;
    const tileBaseSize = 64;
    const paddingTop = this.wordText ? (this.wordText.y + (this.isMobile ? 40 : 50)) : 120;
    const availableHeight = this.app.screen.height - paddingTop - (this.isMobile ? 110 : 130);
    const availableWidth = this.app.screen.width - 40;

    const gap = this.isMobile ? 6 : 10;
    const gridW = this.COLS * tileBaseSize + (this.COLS - 1) * gap;
    const gridH = this.ROWS * tileBaseSize + (this.ROWS - 1) * gap;
    const scale = Math.min(availableWidth / gridW, availableHeight / gridH);

    const startX = (this.app.screen.width - (this.COLS * tileBaseSize * scale + (this.COLS - 1) * gap * scale)) / 2 + tileBaseSize * scale / 2;
    const startY = paddingTop + (availableHeight - (this.ROWS * tileBaseSize * scale + (this.ROWS - 1) * gap * scale)) / 2 + tileBaseSize * scale / 2;

    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        const idx = r * this.COLS + c;
        const tile = this.letterTiles[idx];
        if (!tile) continue;
        tile.setBaseScale(scale);
        tile.x = startX + c * (tileBaseSize * scale + gap * scale);
        tile.y = startY + r * (tileBaseSize * scale + gap * scale);
      }
    }
  }

  private selectTile(tile: LetterTile): void {
    tile.setSelected(true);
    this.selectedLetters.push(tile);
    this.updateWordAndScore();
  }

  private deselectTile(tile: LetterTile): void {
    tile.setSelected(false);
    const idx = this.selectedLetters.indexOf(tile);
    if (idx >= 0) this.selectedLetters.splice(idx, 1);
    this.updateWordAndScore();
  }

  private backspaceLetter(): void {
    const last = this.selectedLetters.pop();
    if (last) last.setSelected(false);
    this.updateWordAndScore();
  }

  private clearSelection(): void {
    for (const t of this.selectedLetters) t.setSelected(false);
    this.selectedLetters = [];
    this.updateWordAndScore();
  }

  private updateWordAndScore(): void {
    const word = this.selectedLetters.map(t => t.letter).join('');
    this.wordText.text = word;
    this.score = this.selectedLetters.reduce((sum, t) => sum + t.value, 0);
    if (this.gameScoreText) this.gameScoreText.text = String(this.score);
    this.updateGameScorePosition();
  }

  private async endGame(): Promise<void> {
    if (this.state === 'GAME_OVER') return;
    this.state = 'GAME_OVER';

    const finalWord = this.selectedLetters.map(t => t.letter).join('');
    const isValid = this.isWordValid(finalWord);
    const finalScore = isValid ? this.selectedLetters.reduce((sum, t) => sum + t.value, 0) : 0;

    this.finalWordText.text = isValid
      ? `Your Word: ${finalWord || '(none)'}\nLetters Used: ${this.selectedLetters.length}/${this.TOTAL_TILES}`
      : `Your Word: ${finalWord || '(none)'}\nInvalid word`;
    this.scoreText.text = `Score: ${finalScore}`;

    try {
      await updateUserRubies(this.userId, finalScore);
    } catch (e) {
      console.error('Failed to update user rubies', e);
    }

    this.showEndScreen();
  }

  private update(deltaMS: number): void {
    // Advance timer only while playing
    if (this.state !== 'PLAYING') return;

    this.gameTimer -= deltaMS;
    if (this.gameTimer < 0) this.gameTimer = 0;

    // Update timer UI (seconds with one decimal)
    if (this.timerText) {
      const secs = this.gameTimer / 1000;
      this.timerText.text = secs.toFixed(1);
    }

    // Auto end when time is up
    if (this.gameTimer <= 0) {
      // endGame() is async; fire-and-forget is fine here
      void this.endGame();
    }
  }

  private cleanup(): void {
    this.app.ticker.remove(this.gameLoop);
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  resize(): void {
    if (this.timerText) this.timerText.x = this.app.screen.width / 2;
    if (this.wordText) this.wordText.x = this.app.screen.width / 2;
    this.updateGameScorePosition();
    this.layoutControls();
    this.layoutTilesGrid();
  }

  destroy(options?: any): void {
    this.cleanup();
    super.destroy(options);
  }
}

export default QuickTapWords;
