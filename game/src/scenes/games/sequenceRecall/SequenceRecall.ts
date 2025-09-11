import * as PIXI from 'pixi.js';
import { ResizableScene } from '../../SceneManager';
import { updateUserRubies, getUserRubies } from '../../../firebase';

type GameState = 'START' | 'SHOW_SEQUENCE' | 'DISTRACTION' | 'RECALL' | 'ROUND_RESULT' | 'GAME_OVER';

type Mode = 'cards' | 'numbers';

type CardItem = { kind: 'card'; suit: string; rank: string; textureName: string };
type NumberItem = { kind: 'number'; value: number };
export type SeqItem = CardItem | NumberItem;

class NumberChip extends PIXI.Container {
  public value: number;
  private bg: PIXI.Graphics;
  private labelText: PIXI.Text;
  private baseScale = 1;

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

  setBaseScale(scale: number) {
    this.baseScale = scale;
    this.scale.set(scale);
  }

  flash() {
    this.scale.set(this.baseScale * 1.08);
    setTimeout(() => this.scale.set(this.baseScale), 120);
  }

  private redraw() {
    const size = 64;
    this.bg.clear();
    this.bg.lineStyle(2, 0x0d1b2a, 1);
    this.bg.beginFill(0xfff3c4);
    this.bg.drawRoundedRect(-size / 2, -size / 2, size, size, 10);
    this.bg.endFill();
  }
}

export class SequenceRecall extends PIXI.Container implements ResizableScene {
  private app: PIXI.Application;
  private userId: string;
  private showMapMenu: () => void;
  private isMobile: boolean;

  private state: GameState = 'START';
  private mode: Mode = 'cards';

  // Rounds: lengths 8, 10, 12
  private readonly roundLengths = [8, 10, 12];
  private roundIndex = 0;
  private bankRubies = 0; // current rubies from DB
  private earnedThisGame = 0; // amount earned during this session

  // Containers
  private startContainer!: PIXI.Container;
  private seqContainer!: PIXI.Container;
  private distractionContainer!: PIXI.Container;
  private recallContainer!: PIXI.Container;
  private endContainer!: PIXI.Container;

  // Score (ruby + number)
  private rubySprite!: PIXI.Sprite;
  private scoreText!: PIXI.Text;

  // Cards atlas
  private cardAtlas: PIXI.Spritesheet | null = null;

  // Current sequence and input
  private currentSequence: SeqItem[] = [];
  private inputSequence: SeqItem[] = [];

  // Recall UI
  private slotsRow!: PIXI.Container;
  private optionsContainer!: PIXI.Container;
  private infoText!: PIXI.Text;
  private submitBtn!: PIXI.Text;
  private backspaceBtn!: PIXI.Text;
  private clearBtn!: PIXI.Text;
  private optionButtons: Array<PIXI.Container & { __item?: SeqItem; __used?: boolean }> = [];

  // Distraction
  private distractionTimer = 0;
  private distractionTimerText!: PIXI.Text;
  private readonly DISTRACTION_DURATION = 5000; // ms
  private distractionRubies: Array<{ sprite: PIXI.Sprite; vx: number; vy: number }> = [];
  private shatterParticles: Array<{ g: PIXI.Graphics; vx: number; vy: number; life: number; maxLife: number }> = [];
  private readonly RUBY_TAP_VALUE = 1;

  // Helpers
  private timeouts: number[] = [];

  constructor(app: PIXI.Application, userId: string, showMapMenu: () => void, isMobile: boolean = false) {
    super();
    this.app = app;
    this.userId = userId;
    this.showMapMenu = showMapMenu;
    this.isMobile = isMobile;

    this.setupBackground();
    this.setupContainers();
    void this.loadCardAtlas();
    void this.setupScoreDisplay();

    this.app.ticker.add(this.gameLoop);
  }

  // ===== Lifecycle =====
  private setupBackground() {
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1f2937);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    this.addChild(bg);
  }

  private setupContainers() {
    this.startContainer = new PIXI.Container();
    this.seqContainer = new PIXI.Container();
    this.distractionContainer = new PIXI.Container();
    this.recallContainer = new PIXI.Container();
    this.endContainer = new PIXI.Container();

    this.addChild(this.startContainer);
    this.addChild(this.seqContainer);
    this.addChild(this.distractionContainer);
    this.addChild(this.recallContainer);
    this.addChild(this.endContainer);

    this.setupStartScreen();
    this.setupDistractionScreen();
    this.setupRecallScreen();
    this.setupEndScreen();

    this.showOnly('START');
  }

  private async loadCardAtlas(): Promise<void> {
    try {
      const sheet = PIXI.Assets.get('quickTapPokerVisuals') as PIXI.Spritesheet;
      this.cardAtlas = sheet ?? null;
    } catch (e) {
      this.cardAtlas = null;
    }
  }

  private getCardTexture(name: string): PIXI.Texture {
    if (this.cardAtlas && this.cardAtlas.textures[name]) return this.cardAtlas.textures[name];
    return PIXI.Texture.from(`/assets/sprites/quickTapPoker/${name}`);
  }

  private async setupScoreDisplay() {
    const rubyTexture = await PIXI.Assets.load('/assets/sprites/ruby.png');
    this.rubySprite = new PIXI.Sprite(rubyTexture);
    this.rubySprite.width = 32; this.rubySprite.height = 32;

    const baseFontSize = this.isMobile ? 28 : 28;
    const scaleFactor = Math.min(this.app.screen.width / 400, this.app.screen.height / 600);
    const fontSize = Math.max(20, baseFontSize * scaleFactor);
    this.scoreText = new PIXI.Text('0', { fontSize, fill: 0xffffff, fontFamily: 'SuperWater' });

    this.addChild(this.rubySprite);
    this.addChild(this.scoreText);
    this.updateScorePosition();

    // Load the user's current banked rubies and display them
    try {
      this.bankRubies = await getUserRubies(this.userId);
      this.scoreText.text = String(this.bankRubies);
    } catch (e) {
      console.error('Failed to load user rubies', e);
    }
  }

  private updateScorePosition() {
    if (!this.rubySprite || !this.scoreText) return;
    const margin = this.isMobile ? 15 : 30;
    const totalWidth = 32 + 10 + this.scoreText.width;
    const padding = 20;
    this.rubySprite.x = this.app.screen.width - totalWidth - padding;
    this.rubySprite.y = margin;
    this.scoreText.x = this.rubySprite.x + 42;
    this.scoreText.y = this.rubySprite.y - 5;
  }

  private gameLoop = (ticker: PIXI.Ticker) => {
    if (this.state === 'DISTRACTION') {
      this.updateDistraction(ticker.deltaMS);
    }
  };

  // ===== Start Screen =====
  private setupStartScreen() {
    this.startContainer.removeChildren();

    const title = new PIXI.Text('Sequence Recall', {
      fontSize: this.isMobile ? 36 : 64,
      fill: 0xffffff,
      fontFamily: 'SuperWater',
      align: 'center',
    });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.app.screen.height / 3;
    this.startContainer.addChild(title);

    const instructions = new PIXI.Text(
      'Memorize the sequence. Get distracted. Rebuild it!\n3 rounds: 8, 10, 12 items. Points for accuracy.',
      { fontSize: this.isMobile ? 18 : 22, fill: 0xcccccc, fontFamily: 'Arial', align: 'center' }
    );
    instructions.anchor.set(0.5);
    instructions.x = this.app.screen.width / 2;
    instructions.y = this.app.screen.height / 2;
    this.startContainer.addChild(instructions);

    const btnCards = new PIXI.Text('Start (Cards)', { fontSize: this.isMobile ? 22 : 28, fill: 0x00ff88, fontFamily: 'SuperWater' });
    const btnNumbers = new PIXI.Text('Start (Numbers)', { fontSize: this.isMobile ? 22 : 28, fill: 0x66a3ff, fontFamily: 'SuperWater' });
    [btnCards, btnNumbers].forEach((b) => {
      b.anchor.set(0.5);
      b.eventMode = 'static';
      b.cursor = 'pointer';
      this.startContainer.addChild(b);
    });
    btnCards.x = this.app.screen.width / 2 - (this.isMobile ? 90 : 120);
    btnCards.y = this.app.screen.height * 2 / 3;
    btnNumbers.x = this.app.screen.width / 2 + (this.isMobile ? 90 : 120);
    btnNumbers.y = btnCards.y;

    btnCards.on('pointerdown', (e: any) => { e.stopPropagation(); this.mode = 'cards'; this.beginGame(); });
    btnNumbers.on('pointerdown', (e: any) => { e.stopPropagation(); this.mode = 'numbers'; this.beginGame(); });
  }

  private beginGame() {
    this.earnedThisGame = 0;
    // Keep displaying bank rubies fetched from DB
    this.roundIndex = 0;
    this.startRound();
  }

  private startRound() {
    const length = this.roundLengths[this.roundIndex];
    this.currentSequence = this.chooseSequence(length);
    this.inputSequence = [];
    this.showSequence();
  }

  private chooseSequence(length: number): SeqItem[] {
    if (this.mode === 'cards') {
      const suits = ['club', 'diamonds', 'heart', 'spades'];
      const ranks = ['two','three','four','five','six','seven','eight','nine','ten','jack','queen','king','ace'];
      const deck: CardItem[] = [];
      for (const s of suits) for (const r of ranks) deck.push({ kind: 'card', suit: s, rank: r, textureName: `tiny-card-${s}-reg-${r}-64x64.png` });
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      return deck.slice(0, length);
    } else {
      const nums: number[] = [];
      while (nums.length < length) { const n = 1 + Math.floor(Math.random() * 99); if (!nums.includes(n)) nums.push(n); }
      return nums.map((n) => ({ kind: 'number', value: n }));
    }
  }

  // ===== SHOW_SEQUENCE =====
  private showSequence() {
    this.state = 'SHOW_SEQUENCE';
    this.showOnly('SHOW_SEQUENCE');
    this.seqContainer.removeChildren();

    const title = new PIXI.Text(`Round ${this.roundIndex + 1}: Memorize this ${this.currentSequence.length}-item sequence`, {
      fontSize: this.isMobile ? 20 : 26, fill: 0xffffff, fontFamily: 'SuperWater', align: 'center'
    });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.isMobile ? 60 : 80;
    this.seqContainer.addChild(title);

    const visuals = this.currentSequence.map((item) => this.createVisualForItem(item));
    this.layoutHorizontalRow(this.seqContainer, visuals, title.y + (this.isMobile ? 70 : 90));

    // Display for a bit then move to distraction
    const displayTime = Math.max(3000, 350 * this.currentSequence.length);
    this.timeouts.push(window.setTimeout(() => this.startDistraction(), displayTime));
  }

  private createVisualForItem(item: SeqItem): PIXI.Container {
    if (item.kind === 'card') {
      const sp = new PIXI.Sprite(this.getCardTexture(item.textureName));
      sp.anchor.set(0.5);
      return sp;
    } else {
      const chip = new NumberChip(item.value);
      chip.setBaseScale(1);
      return chip;
    }
  }

  private layoutHorizontalRow(container: PIXI.Container, items: PIXI.Container[], centerY: number) {
    const baseSize = 64;
    const gap = this.isMobile ? 8 : 12;
    const count = items.length;
    const gridW = count * baseSize + (count - 1) * gap;
    const availableWidth = this.app.screen.width - 40;
    const scale = Math.min(1.0, availableWidth / gridW);

    let x = (this.app.screen.width - (count * baseSize * scale + (count - 1) * gap * scale)) / 2 + baseSize * scale / 2;
    for (const d of items) {
      // @ts-ignore anchor exists on Sprite/Text
      (d as any).anchor?.set?.(0.5);
      (d as any).scale?.set?.(scale);
      d.x = x;
      d.y = centerY;
      x += baseSize * scale + gap * scale;
      container.addChild(d);
    }
  }

  // ===== DISTRACTION =====
  private setupDistractionScreen() {
    this.distractionContainer.removeChildren();
    const title = new PIXI.Text('Distraction! Tap the rubies!', { fontSize: this.isMobile ? 24 : 32, fill: 0xffe066, fontFamily: 'SuperWater' });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.isMobile ? 60 : 80;
    this.distractionContainer.addChild(title);

    this.distractionTimerText = new PIXI.Text('', { fontSize: this.isMobile ? 18 : 22, fill: 0xffffff, fontFamily: 'Arial' });
    this.distractionTimerText.anchor.set(0.5);
    this.distractionTimerText.x = this.app.screen.width / 2;
    this.distractionTimerText.y = title.y + (this.isMobile ? 36 : 44);
    this.distractionContainer.addChild(this.distractionTimerText);
  }

  private startDistraction() {
    this.state = 'DISTRACTION';
    this.showOnly('DISTRACTION');
    this.distractionContainer.visible = true;

    // Clear any previous rubies
    for (const r of this.distractionRubies) {
      if (r.sprite.parent) r.sprite.parent.removeChild(r.sprite);
      r.sprite.destroy();
    }
    this.distractionRubies = [];

    // Spawn bouncing rubies
    const count = 6;
    for (let i = 0; i < count; i++) {
      this.spawnRuby();
    }

    this.distractionTimer = this.DISTRACTION_DURATION;
    this.updateDistractionTimerText();
  }

  private spawnRuby() {
    const sprite = new PIXI.Sprite(this.rubySprite.texture);
    sprite.anchor.set(0.5);
    sprite.width = 36; sprite.height = 36;
    sprite.x = 40 + Math.random() * (this.app.screen.width - 80);
    sprite.y = 140 + Math.random() * (this.app.screen.height - 220);
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.on('pointerdown', (e: any) => {
      e.stopPropagation();
      // Track earnings this session
      this.earnedThisGame += this.RUBY_TAP_VALUE;
      // Persist to DB and update bank rubies display
      void updateUserRubies(this.userId, this.RUBY_TAP_VALUE)
        .then(() => {
          this.bankRubies += this.RUBY_TAP_VALUE;
          this.scoreText.text = String(this.bankRubies);
        })
        .catch((err) => console.error('Failed to add tap ruby:', err));
      // Shatter effect
      this.spawnShatterEffect(sprite.x, sprite.y);
      // Remove this ruby
      if (sprite.parent) sprite.parent.removeChild(sprite);
      const idx = this.distractionRubies.findIndex((r) => r.sprite === sprite);
      if (idx !== -1) this.distractionRubies.splice(idx, 1);
      sprite.destroy();
      // Keep constant count during distraction
      if (this.state === 'DISTRACTION' && this.distractionTimer > 0) {
        this.spawnRuby();
      }
    });
    const vx = (Math.random() * 2 - 1) * 0.35 * (this.isMobile ? 1.2 : 1);
    const vy = (Math.random() * 2 - 1) * 0.35 * (this.isMobile ? 1.2 : 1);
    this.distractionContainer.addChild(sprite);
    this.distractionRubies.push({ sprite, vx, vy });
  }

  private spawnShatterEffect(x: number, y: number) {
    const pieces = 8 + Math.floor(Math.random() * 4); // 8-11 shards
    for (let i = 0; i < pieces; i++) {
      const g = new PIXI.Graphics();
      // Draw a small triangle-shaped shard
      g.beginFill(0xff4d6d);
      g.moveTo(0, 0);
      const r1 = 2 + Math.random() * 3;
      const r2 = 3 + Math.random() * 4;
      g.lineTo(r1, 0);
      g.lineTo(0, r2);
      g.closePath();
      g.endFill();
      g.x = x;
      g.y = y;
      g.rotation = Math.random() * Math.PI * 2;
      g.alpha = 1;
      this.distractionContainer.addChild(g);

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.15 + Math.random() * 0.35; // px/ms
      const vx = Math.cos(angle) * speed * (this.isMobile ? 1.2 : 1);
      const vy = Math.sin(angle) * speed * (this.isMobile ? 1.2 : 1) - 0.05; // kick up
      const life = 600 + Math.random() * 300; // ms
      this.shatterParticles.push({ g, vx, vy, life, maxLife: life });
    }
  }

  private updateDistraction(deltaMS: number) {
    this.distractionTimer -= deltaMS;
    if (this.distractionTimer < 0) this.distractionTimer = 0;
    this.updateDistractionTimerText();

    const minX = 20, maxX = this.app.screen.width - 20;
    const minY = 120, maxY = this.app.screen.height - 100;
    for (const r of this.distractionRubies) {
      r.sprite.x += r.vx * deltaMS;
      r.sprite.y += r.vy * deltaMS;
      if (r.sprite.x < minX) { r.sprite.x = minX; r.vx *= -1; }
      if (r.sprite.x > maxX) { r.sprite.x = maxX; r.vx *= -1; }
      if (r.sprite.y < minY) { r.sprite.y = minY; r.vy *= -1; }
      if (r.sprite.y > maxY) { r.sprite.y = maxY; r.vy *= -1; }
    }

    // Update shatter particles
    for (let i = this.shatterParticles.length - 1; i >= 0; i--) {
      const p = this.shatterParticles[i];
      p.life -= deltaMS;
      p.g.x += p.vx * deltaMS;
      p.g.y += p.vy * deltaMS;
      // simple gravity and damping
      p.vy += 0.0006 * deltaMS;
      p.vx *= 0.995;
      p.vy *= 0.995;
      const t = Math.max(0, p.life / p.maxLife);
      p.g.alpha = t;
      if (p.life <= 0) {
        if (p.g.parent) p.g.parent.removeChild(p.g);
        p.g.destroy();
        this.shatterParticles.splice(i, 1);
      }
    }

    if (this.distractionTimer <= 0) {
      this.startRecall();
    }
  }

  private updateDistractionTimerText() {
    const secs = (this.distractionTimer / 1000).toFixed(1);
    this.distractionTimerText.text = `Ends in ${secs}s`;
  }

  // ===== RECALL =====
  private setupRecallScreen() {
    this.recallContainer.removeChildren();

    const title = new PIXI.Text('Rebuild the sequence', { fontSize: this.isMobile ? 24 : 32, fill: 0xffffff, fontFamily: 'SuperWater' });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.isMobile ? 60 : 80;
    this.recallContainer.addChild(title);

    this.infoText = new PIXI.Text('', { fontSize: this.isMobile ? 16 : 20, fill: 0xcccccc, fontFamily: 'Arial', align: 'center' });
    this.infoText.anchor.set(0.5);
    this.infoText.x = this.app.screen.width / 2;
    this.infoText.y = title.y + (this.isMobile ? 32 : 40);
    this.recallContainer.addChild(this.infoText);

    this.slotsRow = new PIXI.Container();
    this.recallContainer.addChild(this.slotsRow);

    this.optionsContainer = new PIXI.Container();
    this.recallContainer.addChild(this.optionsContainer);

    // Controls
    this.submitBtn = new PIXI.Text('Submit', { fontSize: this.isMobile ? 20 : 24, fill: 0x00ff88, fontFamily: 'SuperWater' });
    this.backspaceBtn = new PIXI.Text('Backspace', { fontSize: this.isMobile ? 20 : 24, fill: 0xffffff, fontFamily: 'SuperWater' });
    this.clearBtn = new PIXI.Text('Clear', { fontSize: this.isMobile ? 20 : 24, fill: 0xffffff, fontFamily: 'SuperWater' });
    [this.submitBtn, this.backspaceBtn, this.clearBtn].forEach((b) => {
      b.anchor.set(0.5);
      b.eventMode = 'static';
      b.cursor = 'pointer';
      this.recallContainer.addChild(b);
    });
    this.submitBtn.on('pointerdown', (e: any) => { e.stopPropagation(); this.trySubmitRecall(); });
    this.backspaceBtn.on('pointerdown', (e: any) => { e.stopPropagation(); this.backspaceRecall(); });
    this.clearBtn.on('pointerdown', (e: any) => { e.stopPropagation(); this.clearRecall(); });
  }

  private startRecall() {
    this.state = 'RECALL';
    this.showOnly('RECALL');

    // Reset containers
    this.slotsRow.removeChildren();
    this.optionsContainer.removeChildren();
    this.optionButtons = [];
    this.inputSequence = [];

    this.infoText.text = `Tap options to fill ${this.currentSequence.length} slots in order.`;

    // Create empty slots
    const placeholders: PIXI.Graphics[] = [];
    for (let i = 0; i < this.currentSequence.length; i++) {
      const g = new PIXI.Graphics();
      g.lineStyle(2, 0xaaaaaa, 1);
      g.beginFill(0x000000, 0.2);
      g.drawRoundedRect(-30, -30, 60, 60, 10);
      g.endFill();
      g.alpha = 0.6;
      g.eventMode = 'none';
      placeholders.push(g);
    }
    this.layoutHorizontalRow(this.slotsRow, placeholders, this.infoText.y + (this.isMobile ? 60 : 72));

    // Create options (shuffled copy)
    const options = [...this.currentSequence];
    for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }

    const optionViews = options.map((item) => {
      const v = this.createVisualForItem(item) as PIXI.Container & { __item?: SeqItem; __used?: boolean };
      v.__item = item;
      v.__used = false;
      (v as any).eventMode = 'static';
      (v as any).cursor = 'pointer';
      (v as any).on?.('pointerdown', (e: any) => { e.stopPropagation(); this.onOptionTapped(v); });
      return v;
    });

    this.layoutOptionsGrid(optionViews);
    this.optionButtons = optionViews;

    this.layoutRecallControls();
  }

  private layoutOptionsGrid(items: PIXI.Container[]) {
    const paddingTop = this.slotsRow.y + (this.isMobile ? 60 : 72);
    const availableHeight = this.app.screen.height - paddingTop - (this.isMobile ? 120 : 140);
    const availableWidth = this.app.screen.width - 40;
    const baseSize = 64;
    const gap = this.isMobile ? 8 : 12;

    // Choose columns to make grid not too tall
    const count = items.length;
    const cols = Math.min(count, Math.max(4, Math.floor(this.app.screen.width / 100)));
    const rows = Math.ceil(count / cols);

    // Compute scale so grid fits
    const gridW = cols * baseSize + (cols - 1) * gap;
    const gridH = rows * baseSize + (rows - 1) * gap;
    const scale = Math.min(1.0, availableWidth / gridW, availableHeight / gridH);

    const totalW = cols * baseSize * scale + (cols - 1) * gap * scale;
    const totalH = rows * baseSize * scale + (rows - 1) * gap * scale;
    const startX = (this.app.screen.width - totalW) / 2 + baseSize * scale / 2;
    const startY = paddingTop + (availableHeight - totalH) / 2 + baseSize * scale / 2;

    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (idx >= items.length) break;
        const v = items[idx++];
        (v as any).scale?.set?.(scale);
        // @ts-ignore anchor may exist
        (v as any).anchor?.set?.(0.5);
        v.x = startX + c * (baseSize * scale + gap * scale);
        v.y = startY + r * (baseSize * scale + gap * scale);
        this.optionsContainer.addChild(v);
      }
    }
  }

  private layoutRecallControls() {
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

  private onOptionTapped(v: PIXI.Container & { __item?: SeqItem; __used?: boolean }) {
    if (!v.__item || v.__used) return;
    if (this.inputSequence.length >= this.currentSequence.length) return;

    v.__used = true;
    (v as any).alpha = 0.5;
    this.inputSequence.push(v.__item);
    this.renderSlotsSelection();
  }

  private backspaceRecall() {
    const last = this.inputSequence.pop();
    if (!last) return;
    // Re-enable corresponding option view (first matching unused)
    const view = this.optionButtons.find((o) => !o.__used && this.itemsEqual((o.__item as SeqItem), last))
      || this.optionButtons.find((o) => this.itemsEqual((o.__item as SeqItem), last) && o.__used);
    if (view) { view.__used = false; (view as any).alpha = 1.0; }
    this.renderSlotsSelection();
  }

  private clearRecall() {
    this.inputSequence = [];
    for (const v of this.optionButtons) { v.__used = false; (v as any).alpha = 1.0; }
    this.renderSlotsSelection();
  }

  private trySubmitRecall() {
    if (this.inputSequence.length < this.currentSequence.length) return; // require full
    const correct = this.countCorrectPositions(this.inputSequence, this.currentSequence);
    const roundScore = correct * 10; // 10 points per correct position
    // Track earnings and persist to DB
    this.earnedThisGame += roundScore;
    void updateUserRubies(this.userId, roundScore)
      .then(() => {
        this.bankRubies += roundScore;
        this.scoreText.text = String(this.bankRubies);
      })
      .catch((err) => console.error('Failed to add round rubies:', err));
    this.showRoundResult(correct, roundScore);
  }

  private renderSlotsSelection() {
    // Remove any existing selected visuals (keep placeholders behind)
    // We'll add visuals on top of placeholders at their positions
    // Rebuild by clearing and re-adding
    this.slotsRow.removeChildren();

    // Recreate placeholders first
    const placeholders: PIXI.Graphics[] = [];
    for (let i = 0; i < this.currentSequence.length; i++) {
      const g = new PIXI.Graphics();
      g.lineStyle(2, 0xaaaaaa, 1);
      g.beginFill(0x000000, 0.2);
      g.drawRoundedRect(-30, -30, 60, 60, 10);
      g.endFill();
      g.alpha = 0.6;
      g.eventMode = 'none';
      placeholders.push(g);
    }
    this.layoutHorizontalRow(this.slotsRow, placeholders, this.infoText.y + (this.isMobile ? 60 : 72));

    // Now add selected item visuals aligned to same x positions
    const baseSize = 64;
    const gap = this.isMobile ? 8 : 12;
    const count = this.currentSequence.length;
    const availableWidth = this.app.screen.width - 40;
    const gridW = count * baseSize + (count - 1) * gap;
    const scale = Math.min(1.0, availableWidth / gridW);
    let x = (this.app.screen.width - (count * baseSize * scale + (count - 1) * gap * scale)) / 2 + baseSize * scale / 2;
    const y = this.infoText.y + (this.isMobile ? 60 : 72);

    for (let i = 0; i < this.inputSequence.length; i++) {
      const it = this.inputSequence[i];
      const vis = this.createVisualForItem(it);
      // @ts-ignore
      (vis as any).anchor?.set?.(0.5);
      (vis as any).scale?.set?.(scale);
      vis.x = x + i * (baseSize * scale + gap * scale);
      vis.y = y;
      this.slotsRow.addChild(vis);
    }
  }

  private itemsEqual(a: SeqItem, b: SeqItem): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'number' && b.kind === 'number') return a.value === b.value;
    if (a.kind === 'card' && b.kind === 'card') return a.suit === b.suit && a.rank === b.rank;
    return false;
  }

  private countCorrectPositions(guess: SeqItem[], target: SeqItem[]): number {
    let correct = 0;
    for (let i = 0; i < Math.min(guess.length, target.length); i++) {
      if (this.itemsEqual(guess[i], target[i])) correct++;
    }
    return correct;
  }

  private showRoundResult(correct: number, roundScore: number) {
    this.state = 'ROUND_RESULT';

    const overlay = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.75);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    overlay.addChild(bg);

    const title = new PIXI.Text('Round Complete', { fontSize: this.isMobile ? 28 : 40, fill: 0xffe066, fontFamily: 'SuperWater' });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.app.screen.height / 3;
    overlay.addChild(title);

    const details = new PIXI.Text(`Correct: ${correct}/${this.currentSequence.length}\nRound Score: +${roundScore}`, { fontSize: this.isMobile ? 20 : 24, fill: 0xffffff, fontFamily: 'Arial', align: 'center' });
    details.anchor.set(0.5);
    details.x = this.app.screen.width / 2;
    details.y = this.app.screen.height / 2;
    overlay.addChild(details);

    const btn = new PIXI.Text(this.roundIndex < this.roundLengths.length - 1 ? 'Next Round' : 'Finish', { fontSize: this.isMobile ? 22 : 28, fill: 0x00ff88, fontFamily: 'SuperWater' });
    btn.anchor.set(0.5);
    btn.x = this.app.screen.width / 2;
    btn.y = this.app.screen.height * 2 / 3;
    btn.eventMode = 'static'; btn.cursor = 'pointer';
    btn.on('pointerdown', (e: any) => {
      e.stopPropagation();
      overlay.destroy({ children: true });
      if (this.roundIndex < this.roundLengths.length - 1) {
        this.roundIndex++;
        this.startRound();
      } else {
        this.endGame();
      }
    });
    overlay.addChild(btn);

    this.addChild(overlay);
  }

  // ===== End Screen =====
  private setupEndScreen() {
    this.endContainer.removeChildren();

    const title = new PIXI.Text('All Rounds Complete!', { fontSize: this.isMobile ? 32 : 48, fill: 0xffffff, fontFamily: 'SuperWater' });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.app.screen.height / 3;
    this.endContainer.addChild(title);

    const finalText = new PIXI.Text('', { fontSize: this.isMobile ? 22 : 28, fill: 0xffe066, fontFamily: 'Arial' });
    finalText.anchor.set(0.5);
    finalText.x = this.app.screen.width / 2;
    finalText.y = this.app.screen.height / 2;
    this.endContainer.addChild(finalText);

    const toMap = new PIXI.Text('Return to Map', { fontSize: this.isMobile ? 22 : 28, fill: 0x00ff88, fontFamily: 'SuperWater' });
    toMap.anchor.set(0.5);
    toMap.x = this.app.screen.width / 2;
    toMap.y = this.app.screen.height * 2 / 3;
    toMap.eventMode = 'static'; toMap.cursor = 'pointer';
    toMap.on('pointerdown', (e: any) => { e.stopPropagation(); this.cleanup(); this.showMapMenu(); });
    this.endContainer.addChild(toMap);

    // Store reference for updating on endGame
    (this.endContainer as any).__finalText = finalText;
  }

  private async endGame() {
    this.state = 'GAME_OVER';
    this.showOnly('GAME_OVER');
    // Rubies were persisted incrementally during gameplay
    const finalText: PIXI.Text | undefined = (this.endContainer as any).__finalText;
    if (finalText) finalText.text = `Final Rubies Earned: ${this.earnedThisGame}`;
  }

  // ===== Utils =====
  private showOnly(which: GameState) {
    this.startContainer.visible = which === 'START';
    this.seqContainer.visible = which === 'SHOW_SEQUENCE';
    this.distractionContainer.visible = which === 'DISTRACTION';
    this.recallContainer.visible = which === 'RECALL';
    this.endContainer.visible = which === 'GAME_OVER';
  }

  resize(): void {
    this.updateScorePosition();
    // Relayout recall controls if visible
    if (this.recallContainer.visible) this.layoutRecallControls();
  }

  private cleanupTimeouts() {
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts = [];
  }

  private cleanup(): void {
    // Stop game loop ticker and clear timers
    this.app.ticker.remove(this.gameLoop);
    this.cleanupTimeouts();
    // Remove distraction sprites if any remain
    for (const r of this.distractionRubies) {
      if (r.sprite.parent) r.sprite.parent.removeChild(r.sprite);
      r.sprite.destroy();
    }
    this.distractionRubies = [];
    // Remove any remaining shatter particles
    for (const p of this.shatterParticles) {
      if (p.g.parent) p.g.parent.removeChild(p.g);
      p.g.destroy();
    }
    this.shatterParticles = [];
  }

  destroy(options?: any): void {
    this.app.ticker.remove(this.gameLoop);
    this.cleanupTimeouts();
    super.destroy(options);
  }
}

export default SequenceRecall;
