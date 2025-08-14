import * as PIXI from 'pixi.js';
import { ResizableScene } from '../../SceneManager';
import { updateUserRubies } from '../../../firebase';

// Token type for expression building
type QTNToken = { kind: 'num'; value: number; tile: NumberTile } | { kind: 'op'; value: '+' | '-' | '*' | '/' };

class NumberTile extends PIXI.Container {
  public value: number;
  public isSelected = false;
  private baseScale = 1;
  private bg: PIXI.Graphics;
  private labelText: PIXI.Text;

  constructor(value: number) {
    super();
    this.value = value;

    this.bg = new PIXI.Graphics();
    this.addChild(this.bg);

    this.labelText = new PIXI.Text(String(value), {
      fontSize: 28,
      fill: 0x102a43,
      fontFamily: 'SuperWater',
    });
    this.labelText.anchor.set(0.5);
    this.addChild(this.labelText);

    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.redraw();
  }

  private redraw() {
    const size = 64;
    this.bg.clear();
    this.bg.lineStyle(2, 0x0d1b2a, 1);
    this.bg.beginFill(this.isSelected ? 0xffe08a : 0xfff3c4);
    this.bg.drawRoundedRect(-size / 2, -size / 2, size, size, 10);
    this.bg.endFill();
  }

  setBaseScale(scale: number) {
    this.baseScale = scale;
    this.scale.set(scale);
  }

  setSelected(selected: boolean) {
    this.isSelected = selected;
    this.redraw();
    this.scale.set(selected ? this.baseScale * 1.08 : this.baseScale);
    this.alpha = selected ? 0.85 : 1;
  }
}

export class QuickTapNumbers extends PIXI.Container implements ResizableScene {
  private app: PIXI.Application;
  private userId: string;
  private isMobile: boolean;
  private showMapMenu: () => void;

  // State
  private state: 'START' | 'PLAYING' | 'GAME_OVER' = 'START';
  private gameTimer = 0;
  private readonly GAME_DURATION = 30000; // ms (tune between 20000 and 30000)

  // Layout
  private readonly ROWS = 3;
  private readonly COLS = 4;
  private readonly TOTAL_TILES = 12;
  private boardTopOffset = 0;
  private isStarting = false;

  // Numbers pool
  private readonly NUMBERS_POOL = [1,2,3,4,5,6,7,8,9,10,25,50,75,100];

  // UI containers
  private startContainer!: PIXI.Container;
  private gameContainer!: PIXI.Container;
  private endContainer!: PIXI.Container;

  // UI elements
  private timerText!: PIXI.Text;
  private targetText!: PIXI.Text;
  private exprText!: PIXI.Text;
  private resultText!: PIXI.Text;
  private gameScoreText!: PIXI.Text;
  private rubySprite!: PIXI.Sprite;
  private finalInfoText!: PIXI.Text;
  private finalScoreText!: PIXI.Text;
  private countdownText!: PIXI.Text;

  private submitBtn!: PIXI.Text;
  private backspaceBtn!: PIXI.Text;
  private clearBtn!: PIXI.Text;
  private opButtons: Record<string, PIXI.Sprite> = {};
  private opTextures: Partial<Record<'+' | '-' | '*' | '/', PIXI.Texture>> = {};

  // Tiles and expression
  private tilesContainer!: PIXI.Container;
  private numberTiles: NumberTile[] = [];
  private tokens: QTNToken[] = [];

  private targetNumber = 0;
  private score = 0;

  // Cleanup
  private countdownInterval: number | null = null;

  constructor(app: PIXI.Application, userId: string, showMapMenu: () => void, isMobile: boolean = false) {
    super();
    this.app = app;
    this.userId = userId;
    this.showMapMenu = showMapMenu;
    this.isMobile = isMobile;
    // Add extra top margin so tiles/operators sit lower below the result text
    this.boardTopOffset = this.isMobile ? 60 : 90; // tweak as desired

    this.setupBackground();
    this.setupContainers();
    this.app.ticker.add(this.gameLoop);
  }

  private gameLoop = (ticker: PIXI.Ticker) => this.update(ticker.deltaMS);

  private setupBackground(): void {
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1b263b);
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

    const title = new PIXI.Text('Quick Tap Numbers', {
      fontSize: this.isMobile ? 36 : 64,
      fill: 0xffffff,
      fontFamily: 'SuperWater',
      align: 'center',
    });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.app.screen.height / 3;
    this.startContainer.addChild(title);

    const instructions = new PIXI.Text('Use + - * / to reach the target number before time runs out.\nEach number tile can be used once.', {
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
      fill: 0x00ff88,
      fontFamily: 'SuperWater',
    });
    startButton.anchor.set(0.5);
    startButton.x = this.app.screen.width / 2;
    startButton.y = this.app.screen.height * 2 / 3;
    this.startContainer.addChild(startButton);

    this.startContainer.eventMode = 'static';
    // Expand tap target to full screen and prevent multiple-tap race
    this.startContainer.hitArea = new PIXI.Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    this.startContainer.cursor = 'pointer';
    this.startContainer.on('pointerdown', async (e: any) => {
      e.stopPropagation();
      if (this.state !== 'START' || this.isStarting) return;
      this.isStarting = true;
      startButton.text = 'Loading...';
      try {
        await this.startGame();
      } finally {
        this.isStarting = false;
      }
    });
  }

  private async setupGameScreen(): Promise<void> {
    this.gameContainer.removeChildren();

    // Timer
    this.timerText = new PIXI.Text('30.0', {
      fontSize: this.isMobile ? 32 : 48,
      fill: 0x7cffcb,
      fontFamily: 'SuperWater',
    });
    this.timerText.anchor.set(0.5, 0);
    this.timerText.x = this.app.screen.width / 2;
    this.timerText.y = 16;
    this.gameContainer.addChild(this.timerText);

    // Target
    this.targetText = new PIXI.Text('Target: -', {
      fontSize: this.isMobile ? 26 : 32,
      fill: 0xffe066,
      fontFamily: 'SuperWater',
    });
    this.targetText.anchor.set(0.5, 0);
    this.targetText.x = this.app.screen.width / 2;
    this.targetText.y = this.timerText.y + (this.isMobile ? 40 : 50);
    this.gameContainer.addChild(this.targetText);

    // Expression and result
    this.exprText = new PIXI.Text('', { fontSize: this.isMobile ? 20 : 24, fill: 0xffffff, fontFamily: 'Arial', align: 'center' });
    this.exprText.anchor.set(0.5, 0);
    this.exprText.x = this.app.screen.width / 2;
    this.exprText.y = this.targetText.y + (this.isMobile ? 30 : 40);
    this.gameContainer.addChild(this.exprText);

    this.resultText = new PIXI.Text('Result: -', { fontSize: this.isMobile ? 20 : 24, fill: 0xcccccc, fontFamily: 'Arial' });
    this.resultText.anchor.set(0.5, 0);
    this.resultText.x = this.app.screen.width / 2;
    this.resultText.y = this.exprText.y + (this.isMobile ? 26 : 32);
    this.gameContainer.addChild(this.resultText);

    // Score (ruby + number)
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
    this.backspaceBtn.on('pointerdown', (e: any) => { e.stopPropagation(); this.backspace(); });
    this.clearBtn.on('pointerdown', (e: any) => { e.stopPropagation(); this.clearExpression(); });

    // Operator buttons
    await this.setupOperatorButtons();

    // Now that operator buttons exist, ensure they are positioned
    this.layoutControls();

    // Tiles container
    this.tilesContainer = new PIXI.Container();
    this.gameContainer.addChild(this.tilesContainer);

    // Ensure UI is above tiles
    [this.submitBtn, this.backspaceBtn, this.clearBtn].forEach(btn => this.gameContainer.addChild(btn));
    (['+', '-', '*', '/'] as const).forEach(op => {
      const b = this.opButtons[op];
      if (b) this.gameContainer.addChild(b);
    });
  }

  private layoutControls(): void {
    // If controls not yet created (e.g., resize fired before async setup finished), bail out
    if (!this.submitBtn || !this.backspaceBtn || !this.clearBtn) return;

    const y = this.app.screen.height - (this.isMobile ? 60 : 80);
    const centerX = this.app.screen.width / 2;
    const gap = this.isMobile ? 120 : 160;

    this.backspaceBtn.x = centerX - gap;
    this.backspaceBtn.y = y;
    this.submitBtn.x = centerX;
    this.submitBtn.y = y;
    this.clearBtn.x = centerX + gap;
    this.clearBtn.y = y;

    // Position operators to the right of the tiles in a vertical column
    this.layoutOperatorButtons();
  }

  private layoutOperatorButtons(): void {
    const ops = ['+', '-', '*', '/'];
    if (ops.some(op => !this.opButtons[op])) return;

    // Wait for tiles to be laid out first
    if (!this.tilesContainer || this.numberTiles.length === 0) return;

    // Get the bounds of the tile grid
    const firstTile = this.numberTiles[0];
    const lastTile = this.numberTiles[this.numberTiles.length - 1];
    if (!firstTile || !lastTile) return;

    // Calculate tile grid vertical bounds and right edge (respect tile scale)
    const tileGridTop = Math.min(...this.numberTiles.map(tile => tile.y - 32 * tile.scale.y));
    const tileGridBottom = Math.max(...this.numberTiles.map(tile => tile.y + 32 * tile.scale.y));
    const tileGridRight = Math.max(...this.numberTiles.map(tile => tile.x + 32 * tile.scale.x)); // 32 = half tile size
    const gridHeight = tileGridBottom - tileGridTop;

    // Size operators to fill the same height as the tile grid
    const opCount = ops.length;
    if (opCount === 0 || gridHeight <= 0) return;
    const opSize = gridHeight / opCount; // each operator gets an equal slice
    const opStartY = tileGridTop + opSize / 2;
    const opX = tileGridRight + opSize / 2 + (this.isMobile ? 25 : 35); // Position to right with gap

    ops.forEach((op, i) => {
      const btn = this.opButtons[op];
      if (!btn) return;
      // Make each operator square and sized to its slice
      btn.width = opSize;
      btn.height = opSize;
      btn.x = opX;
      btn.y = opStartY + i * opSize;
    });
  }

  private layoutTilesGrid(): void {
    if (!this.tilesContainer) return;
    // Ensure tiles start below the visible bottom of the result text
    const paddingTopBase = this.resultText
      ? (this.resultText.y + this.resultText.height + (this.isMobile ? 20 : 28))
      : 160;
    const paddingTop = paddingTopBase + this.boardTopOffset; // additional board offset
    const availableHeight = this.app.screen.height - paddingTop - (this.isMobile ? 120 : 140);
    // Reserve asymmetric horizontal space: small margin on left, larger on right for operators
    const leftReserve = this.isMobile ? 24 : 40;
    const rightReserve = this.isMobile ? 100 : 120;
    const availableWidth = this.app.screen.width - leftReserve - rightReserve;

    const tileBaseSize = 64;
    const gap = this.isMobile ? 8 : 12;
    const gridW = this.COLS * tileBaseSize + (this.COLS - 1) * gap;
    const gridH = this.ROWS * tileBaseSize + (this.ROWS - 1) * gap;
    const scale = Math.min(availableWidth / gridW, availableHeight / gridH);

    const startX = leftReserve + (availableWidth - (this.COLS * tileBaseSize * scale + (this.COLS - 1) * gap * scale)) / 2;
    const startY = paddingTop + (availableHeight - (this.ROWS * tileBaseSize * scale + (this.ROWS - 1) * gap * scale)) / 2;

    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        const idx = r * this.COLS + c;
        const tile = this.numberTiles[idx];
        if (!tile) continue;
        tile.setBaseScale(scale);
        tile.x = startX + c * (tileBaseSize * scale + gap * scale);
        tile.y = startY + r * (tileBaseSize * scale + gap * scale);
      }
    }
  }

  private addNumber(tile: NumberTile): void {
    // Prevent consecutive numbers
    const last = this.tokens[this.tokens.length - 1];
    if (last && last.kind === 'num') return;
    this.tokens.push({ kind: 'num', value: tile.value, tile });
    tile.setSelected(true);
    this.updateExpressionUI();
  }

  private addOperator(op: '+' | '-' | '*' | '/'): void {
    if (this.state !== 'PLAYING') return;
    const last = this.tokens[this.tokens.length - 1];
    if (!last || last.kind !== 'num') return; // must follow a number
    this.tokens.push({ kind: 'op', value: op });
    this.updateExpressionUI();
  }

  private backspace(): void {
    const t = this.tokens.pop();
    if (!t) return;
    if (t.kind === 'num') {
      t.tile.setSelected(false);
    }
    this.updateExpressionUI();
  }

  private clearExpression(): void {
    for (const t of this.tokens) {
      if (t.kind === 'num') t.tile.setSelected(false);
    }
    this.tokens = [];
    this.updateExpressionUI();
  }

  private updateExpressionUI(): void {
    const parts = this.tokens.map(t => t.kind === 'num' ? String(t.value) : t.value);
    this.exprText.text = parts.join(' ');

    const value = this.evaluateTokens(this.tokens);
    if (value === null || Number.isNaN(value)) {
      this.resultText.text = 'Result: -';
    } else {
      this.resultText.text = `Result: ${Math.round(value * 1000) / 1000}`;
    }
  }

  private evaluateTokens(tokens: QTNToken[]): number | null {
    // Trim trailing operator for live evaluation
    const trimmed: typeof tokens = [...tokens];
    if (trimmed.length && trimmed[trimmed.length - 1].kind === 'op') trimmed.pop();
    if (!trimmed.length) return null;

    const output: number[] = [];
    const ops: Array<'+' | '-' | '*' | '/'> = [];
    const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

    const apply = () => {
      const op = ops.pop();
      if (!op) return;
      const b = output.pop();
      const a = output.pop();
      if (a === undefined || b === undefined) { output.push(NaN); return; }
      let res = 0;
      switch (op) {
        case '+': res = a + b; break;
        case '-': res = a - b; break;
        case '*': res = a * b; break;
        case '/': res = b === 0 ? NaN : a / b; break;
      }
      output.push(res);
    };

    for (const tok of trimmed) {
      if (tok.kind === 'num') {
        output.push(tok.value);
      } else {
        while (ops.length && prec[ops[ops.length - 1]] >= prec[tok.value]) apply();
        ops.push(tok.value);
      }
    }
    while (ops.length) apply();
    return output.length ? output[0] : null;
  }

  private computeScore(finalValue: number | null): number {
    if (finalValue === null || Number.isNaN(finalValue)) return 0;
    const diff = Math.abs(finalValue - this.targetNumber);

    // Tuned scoring aiming for ~100 rubies per 30s on average.
    // Breakdown:
    // - Closeness: up to 80 using reciprocal falloff so large diffs drop quickly.
    // - Speed: up to 20, linear with remaining time (encourages early submit).
    // - Exact bonus: +20 when diff === 0.
    // Perfect at timeout ≈ 100 (80 + 0 + 20). Perfect early tops ≈ 120.
    const CLOSENESS_MAX = 80; // points at exact from closeness
    const CLOSENESS_K = 60;   // falloff factor (smaller = steeper)
    const SPEED_MAX = 20;     // max speed contribution
    const EXACT_BONUS = 20;   // extra for exact match

    // Reciprocal falloff by difference
    const proximity = Math.round(CLOSENESS_MAX / (1 + diff / CLOSENESS_K));

    const timeRatio = Math.max(0, Math.min(1, this.gameTimer / this.GAME_DURATION));
    const speed = Math.round(SPEED_MAX * timeRatio);
    const exact = diff === 0 ? EXACT_BONUS : 0;

    const total = proximity + speed + exact;
    return Math.max(0, total);
  }

  private async endGame(): Promise<void> {
    if (this.state === 'GAME_OVER') return;
    this.state = 'GAME_OVER';

    const value = this.evaluateTokens(this.tokens);
    const diff = value === null || Number.isNaN(value) ? Infinity : Math.abs(value - this.targetNumber);
    this.score = this.computeScore(value);

    const exprStr = this.tokens.map(t => t.kind === 'num' ? String(t.value) : t.value).join(' ');
    const valueStr = value === null || Number.isNaN(value) ? '-' : String(Math.round(value * 1000) / 1000);

    this.finalInfoText.text = `Target: ${this.targetNumber}\nYour Expr: ${exprStr || '(none)'}\nResult: ${valueStr}\nOff by: ${diff === Infinity ? '-' : Math.round(diff)}`;
    this.finalScoreText.text = `Score: ${this.score}`;

    try {
      await updateUserRubies(this.userId, this.score);
    } catch (e) {
      console.error('Failed to update user rubies', e);
    }

    this.showEndScreen();
  }

  private update(deltaMS: number): void {
    if (this.state !== 'PLAYING') return;

    this.gameTimer -= deltaMS;
    if (this.gameTimer < 0) this.gameTimer = 0;

    if (this.timerText) this.timerText.text = (this.gameTimer / 1000).toFixed(1);

    // Live score based on current result
    const value = this.evaluateTokens(this.tokens);
    const liveScore = this.computeScore(value);
    this.updateGameScoreDisplay(liveScore);

    if (this.gameTimer <= 0) {
      void this.endGame();
    }
  }

  private updateGameScoreDisplay(val: number) {
    if (this.gameScoreText) this.gameScoreText.text = String(val);
    this.updateGameScorePosition();
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

    const title = new PIXI.Text("Time's Up!", { fontSize: this.isMobile ? 32 : 48, fill: 0xff4757, fontFamily: 'SuperWater' });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.app.screen.height / 3;
    this.endContainer.addChild(title);

    this.finalInfoText = new PIXI.Text('', { fontSize: this.isMobile ? 20 : 24, fill: 0xffffff, fontFamily: 'Arial', align: 'center' });
    this.finalInfoText.anchor.set(0.5);
    this.finalInfoText.x = this.app.screen.width / 2;
    this.finalInfoText.y = this.app.screen.height / 2;
    this.endContainer.addChild(this.finalInfoText);

    this.finalScoreText = new PIXI.Text('Score: 0', { fontSize: this.isMobile ? 24 : 32, fill: 0x00ff00, fontFamily: 'SuperWater' });
    this.finalScoreText.anchor.set(0.5);
    this.finalScoreText.x = this.app.screen.width / 2;
    this.finalScoreText.y = this.app.screen.height * 2 / 3;
    this.endContainer.addChild(this.finalScoreText);

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
    // Reset state
    this.gameTimer = this.GAME_DURATION;
    this.tokens = [];
    this.score = 0;
    this.updateGameScoreDisplay(0);

    // Target
    this.targetNumber = 101 + Math.floor(Math.random() * 899); // 101-999
    this.targetText.text = `Target: ${this.targetNumber}`;

    // Clear and create tiles
    if (this.tilesContainer) this.tilesContainer.removeChildren();
    this.numberTiles = [];

    const tiles: number[] = [];
    for (let i = 0; i < this.TOTAL_TILES; i++) {
      const n = this.NUMBERS_POOL[Math.floor(Math.random() * this.NUMBERS_POOL.length)];
      tiles.push(n);
    }

    tiles.forEach(n => {
      const tile = new NumberTile(n);
      tile.on('pointerdown', (e: any) => {
        e.stopPropagation();
        if (this.state !== 'PLAYING') return;
        if (tile.isSelected) return; // single-use
        this.addNumber(tile);
      });
      this.numberTiles.push(tile);
      this.tilesContainer.addChild(tile);
    });

    this.layoutTilesGrid();
    // Ensure operator buttons are placed relative to the freshly laid out tiles
    this.layoutOperatorButtons();
    this.updateExpressionUI();
    this.showGameScreen();
  }

  private cleanup(): void {
    this.app.ticker.remove(this.gameLoop);
    if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
  }

  private async tryLoadTexture(urls: string[]): Promise<PIXI.Texture | null> {
    for (const url of urls) {
      try {
        const tex = await PIXI.Assets.load(url);
        if (tex) return tex as PIXI.Texture;
      } catch (_) {
        // try next
      }
    }
    return null;
  }

  private async setupOperatorButtons(): Promise<void> {
    const ops: Array<'+' | '-' | '*' | '/'> = ['+', '-', '*', '/'];
    // Load the quickTapMath spritesheet atlas once
    let sheet: PIXI.Spritesheet | null = null;
    try {
      sheet = await PIXI.Assets.load('/assets/sprites/quickTapMath/quickTapMath.json') as PIXI.Spritesheet;
    } catch (e) {
      console.warn('quickTapMath atlas not found; falling back to text operators', e);
    }

    const frameMap: Record<'+' | '-' | '*' | '/', string> = {
      '+': 'plus.png',
      '-': 'minus.png',
      '*': 'times.png',
      '/': 'divide.png',
    };

    for (const op of ops) {
      const tex = sheet ? sheet.textures[frameMap[op]] : null;
      if (tex) this.opTextures[op] = tex;

      const size = this.isMobile ? 42 : 48;
      let btn: PIXI.Sprite;
      if (tex) {
        btn = new PIXI.Sprite(tex);
        btn.width = size;
        btn.height = size;
      } else {
        // Fallback to text if texture not found
        btn = new PIXI.Text(op, { fontSize: this.isMobile ? 28 : 32, fill: 0xffffff, fontFamily: 'SuperWater' }) as unknown as PIXI.Sprite;
      }
      // Shared sprite/text props
      // @ts-ignore anchor exists on Sprite and Text
      (btn as any).anchor?.set(0.5);
      (btn as any).eventMode = 'static';
      (btn as any).cursor = 'pointer';
      (btn as any).on?.('pointerdown', (e: any) => { e.stopPropagation(); this.addOperator(op); });

      this.opButtons[op] = btn;
      this.gameContainer.addChild(btn);
    }
  }

  resize(): void {
    if (this.timerText) this.timerText.x = this.app.screen.width / 2;
    if (this.targetText) this.targetText.x = this.app.screen.width / 2;
    if (this.exprText) this.exprText.x = this.app.screen.width / 2;
    if (this.resultText) this.resultText.x = this.app.screen.width / 2;
    this.updateGameScorePosition();
    // Lay out tiles first so operator buttons can position relative to fresh bounds
    this.layoutTilesGrid();
    this.layoutControls();
  }

  destroy(options?: any): void {
    this.cleanup();
    super.destroy(options);
  }
}

export default QuickTapNumbers;
