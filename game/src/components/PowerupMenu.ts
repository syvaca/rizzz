import { Application, Assets, Container, Graphics, Rectangle, Sprite, Spritesheet, Text, TextStyle } from 'pixi.js';
import { getUserPowerups, getUserRubies, subscribeToUser, usePowerup, updateUserRubies } from '../firebase';

export type PowerupType = 'multiplier' | 'extra-life' | 'betting';

interface PowerupMenuOptions {
  x?: number;
  y?: number;
  onSelect?: (type: PowerupType) => void;
  onBetPlaced?: (amount: number) => void;
}

/**
 * Lightweight, reusable powerup selector UI.
 *
 * Features:
 * - Displays 3 powerups with live counts pulled from Firebase
 * - Blinking icon animation between frame 1/2
 * - Click to consume a powerup via `usePowerup()` and invoke an optional callback
 * - Optional auto-hide after a duration
 */
export class PowerupMenu extends Container {
  private readonly app: Application;
  private readonly userId: string;
  private visuals!: Spritesheet;
  private readonly powerupTypes: PowerupType[] = ['multiplier', 'extra-life', 'betting'];
  private powerupTexts: Record<PowerupType, Text> = {
    'multiplier': new Text('0'),
    'extra-life': new Text('0'),
    'betting': new Text('0')
  } as any;
  private rowContainers: Record<PowerupType, Container> = {
    'multiplier': new Container(),
    'extra-life': new Container(),
    'betting': new Container()
  };
  private blinkIntervalId?: number;
  private unsubscribeFn?: () => void;
  // no autoHide; host controls lifecycle
  private onSelect?: (type: PowerupType) => void;
  private onBetPlaced?: (amount: number) => void;
  private bettingOverlay?: Container;
  private betSlider?: Graphics;
  private betHandle?: Graphics;
  private betValueText?: Text;
  private anyPowerupUsed: boolean = false; // Track if ANY powerup has been used

  constructor(app: Application, userId: string, options: PowerupMenuOptions = {}) {
    super();
    this.app = app;
    this.userId = userId;
    this.onSelect = options.onSelect;
    this.onBetPlaced = options.onBetPlaced;

    // Defaults
    this.x = options.x ?? 20;
    this.y = options.y ?? (this.app.screen.height - 250);
    // Avoid setting width/height on Container to prevent unintended scaling

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.interactive = true;
    this.hitArea = new Rectangle(0, 0, 75, 245);

    const visualsMaybe = Assets.get('powerupVisuals') as Spritesheet | undefined;
    if (visualsMaybe) {
      this.visuals = visualsMaybe;
      this.finishInit(options);
    } else {
      // Lazily load if not yet available
      Assets.load('powerupVisuals')
        .then((sheet: any) => {
          this.visuals = sheet as Spritesheet;
          this.finishInit(options);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to load powerup visuals:', err);
        });
    }
  }

  private finishInit(options: PowerupMenuOptions): void {
    this.buildUI();
    this.startBlinking();
    this.initCountsAndSubscribe();
  }

  /**
   * Call on layout changes to keep it anchored bottom-left.
   */
  public resize(): void {
    // Keep the same left padding; anchor to bottom with a fixed offset
    this.x = this.x; // no-op to emphasize left offset remains unchanged
    this.y = this.app.screen.height - 250;
  }

  /**
   * Disable all powerup rows when any powerup is used
   */
  private disableAllPowerups(): void {
    this.powerupTypes.forEach((type) => {
      const row = this.rowContainers[type];
      row.eventMode = 'none';
      row.cursor = 'default';
      row.alpha = 0.5;
    });
  }

  /**
   * Reset the powerup menu state for a new game.
   * This re-enables all powerup buttons and clears the used state.
   */
  public resetForNewGame(): void {
    this.anyPowerupUsed = false;
    this.powerupTypes.forEach((type) => {
      const row = this.rowContainers[type];
      const count = parseInt(this.powerupTexts[type].text, 10) || 0;
      
      // Re-enable the row if there are powerups available
      if (count > 0) {
        row.eventMode = 'static';
        row.cursor = 'pointer';
        row.alpha = 1;
      } else {
        row.alpha = 0.5;
      }
    });
  }

  private buildUI(): void {
    // Background container (for better hit target)
    const bg = new Graphics();
    bg.beginFill(0x000000, 0.2);
    bg.drawRoundedRect(0, 0, 75, 245, 8);
    bg.endFill();
    bg.interactive = false; // do not block row pointer events
    this.addChild(bg);

    const rowHeight = 75;
    const rowSpacing = 10;

    this.powerupTypes.forEach((type, index) => {
      const row = new Container();
      row.y = index * (rowHeight + rowSpacing);
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.interactive = true;
      row.hitArea = new Rectangle(0, 0, 75, rowHeight);

      const bgGraphics = new Graphics();
      bgGraphics.beginFill(0x000000, 0.3);
      bgGraphics.drawRoundedRect(0, 0, 75, rowHeight, 5);
      bgGraphics.endFill();
      bgGraphics.interactive = false; // keep background transparent to pointer
      row.addChild(bgGraphics);

      const hoverGraphics = new Graphics();
      hoverGraphics.beginFill(0xffffff, 0.25);
      hoverGraphics.drawRoundedRect(0, 0, 75, rowHeight, 5);
      hoverGraphics.endFill();
      hoverGraphics.visible = false;
      hoverGraphics.interactive = false;
      row.addChild(hoverGraphics);

      const icon = new Sprite(this.visuals.textures[`${type}-1.png`]);
      icon.width = 40;
      icon.height = 40;
      icon.x = (75 - icon.width) / 2;
      icon.y = (rowHeight - icon.height) / 2 - 5;
      row.addChild(icon);

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
      row.addChild(text);
      this.powerupTexts[type] = text;
      this.rowContainers[type] = row;

      row.on('pointerover', () => { hoverGraphics.visible = true; });
      row.on('pointerout', () => { hoverGraphics.visible = false; });
      row.on('pointerdown', async (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Check if any powerup has already been used
        if (this.anyPowerupUsed) {
          const warn = new Text('Only one powerup per game!', {
            fontFamily: 'Chewy', fontSize: 14, fill: 0xffaa00, stroke: 0x000000, strokeThickness: 2
          } as any);
          warn.anchor.set(0.5);
          warn.x = this.x + 120;
          warn.y = this.y + 20 + (index * (rowHeight + rowSpacing));
          this.parent?.addChild(warn);
          setTimeout(() => warn.destroy(), 900);
          return;
        }
        
        let current = parseInt(text.text, 10) || 0;
        // Fallback: if UI shows 0, re-fetch to avoid race with initial subscription
        if (current <= 0) {
          try {
            const latest = await getUserPowerups(this.userId);
            current = latest[type] ?? 0;
            this.powerupTexts[type].text = String(current);
          } catch {}
        }

        if (current <= 0) {
          const warn = new Text('No powerups', {
            fontFamily: 'Chewy', fontSize: 14, fill: 0xff6666, stroke: 0x000000, strokeThickness: 2
          } as any);
          warn.anchor.set(0.5);
          warn.x = this.x + 120;
          warn.y = this.y + 20 + (index * (rowHeight + rowSpacing));
          this.parent?.addChild(warn);
          setTimeout(() => warn.destroy(), 900);
          return;
        }

        if (type === 'betting') {
          // For betting, consume the powerup and open overlay
          const ok = await usePowerup(this.userId, type);
          if (ok) {
            const newCount = Math.max(0, current - 1);
            text.text = String(newCount);
            
            // Mark that a powerup has been used (disables all powerups)
            this.anyPowerupUsed = true;
            
            // Disable ALL powerup rows visually and functionally
            this.disableAllPowerups();
            
            // Open betting overlay to choose amount
            this.openBettingOverlay();
          }
        } else {
          // For non-betting powerups, consume immediately
          const ok = await usePowerup(this.userId, type);
          if (ok) {
            const newCount = Math.max(0, current - 1);
            text.text = String(newCount);
            
            // Mark that a powerup has been used (disables all powerups)
            this.anyPowerupUsed = true;
            
            // Disable ALL powerup rows visually and functionally
            this.disableAllPowerups();
            
            if (this.onSelect) {
              this.onSelect(type);
            }
          }
        }
      });

      this.addChild(row);
    });
  }

  private startBlinking(): void {
    let isFrame1 = true;
    this.blinkIntervalId = window.setInterval(() => {
      isFrame1 = !isFrame1;
      const frame = isFrame1 ? '1' : '2';
      this.powerupTypes.forEach((type) => {
        const row = this.rowContainers[type];
        // icon is first sprite after backgrounds
        const icon = row.children.find((c) => c instanceof Sprite) as Sprite | undefined;
        if (icon && !icon.destroyed) {
          icon.texture = this.visuals.textures[`${type}-${frame}.png`];
        }
        const count = parseInt(this.powerupTexts[type].text, 10) || 0;
        
        // If any powerup is used, keep all dimmed. Otherwise, blink normally
        if (this.anyPowerupUsed) {
          row.alpha = 0.5;
        } else {
          row.alpha = count > 0 ? (row.alpha === 1 ? 0.7 : 1) : 0.5;
        }
      });
    }, 500);
  }

  private async initCountsAndSubscribe(): Promise<void> {
    // Initial counts
    try {
      const powerups = await getUserPowerups(this.userId);
      this.powerupTypes.forEach((type) => {
        this.powerupTexts[type].text = String(powerups[type] ?? 0);
      });
    } catch (err) {
      // Keep defaults if fetch fails
      // eslint-disable-next-line no-console
      console.error('Error fetching powerups:', err);
    }

    // Live updates
    this.unsubscribeFn = subscribeToUser(this.userId, (data: any) => {
      const powerups = data?.powerups || {};
      this.powerupTypes.forEach((type) => {
        if (!this.destroyed) {
          this.powerupTexts[type].text = String(powerups[type] ?? 0);
        }
      });
    });
  }

  private async openBettingOverlay(): Promise<void> {
    // Prevent multiple overlays
    if (this.bettingOverlay) return;

    const rubies = await getUserRubies(this.userId);

    // If no rubies, show quick message and return
    if (!rubies || rubies <= 0) {
      const toast = new Text('Not enough rubies to bet', {
        fontFamily: 'Chewy',
        fontSize: 18,
        fill: 0xff6666,
        stroke: 0x000000,
        strokeThickness: 3
      } as any);
      toast.anchor.set(0.5);
      toast.x = this.x + this.width + 120;
      toast.y = this.y + 40;
      this.parent?.addChild(toast);
      setTimeout(() => toast.destroy(), 1500);
      return;
    }

    const overlay = new Container();
    overlay.zIndex = 10000;
    overlay.eventMode = 'static';
    this.parent?.addChild(overlay);
    if (this.parent) {
      (this.parent as any).sortableChildren = true;
    }

    const bg = new Graphics();
    bg.beginFill(0x000000, 0.7);
    bg.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    bg.endFill();
    overlay.addChild(bg);

    const panel = new Container();
    panel.width = 300;
    panel.height = 200;
    panel.x = (this.app.renderer.width - 300) / 2;
    panel.y = (this.app.renderer.height - 200) / 2;
    overlay.addChild(panel);

    const panelBg = new Graphics();
    panelBg.beginFill(0x333333);
    panelBg.drawRoundedRect(0, 0, 300, 200, 15);
    panelBg.endFill();
    panel.addChild(panelBg);

    const title = new Text('All or nothing! Win 5× your bet!', {
      fontFamily: 'Chewy',
      fontSize: 24,
      fill: 0xffffff,
      align: 'center'
    } as any);
    title.x = 150 - title.width / 2;
    title.y = 16;
    panel.addChild(title);

    // Slider
    const sliderWidth = 200;
    const sliderHeight = 8;
    const handleSize = 20;
    const sliderX = (300 - sliderWidth) / 2;
    const sliderY = 90;

    const slider = new Graphics();
    slider.beginFill(0x666666);
    slider.drawRoundedRect(0, 0, sliderWidth, sliderHeight, 4);
    slider.endFill();
    slider.lineStyle(2, 0xffffff);
    slider.drawRoundedRect(0, 0, sliderWidth, sliderHeight, 4);
    slider.x = sliderX;
    slider.y = sliderY;
    panel.addChild(slider);
    this.betSlider = slider;

    const handle = new Graphics();
    handle.beginFill(0xffffff);
    handle.drawCircle(0, 0, handleSize / 2);
    handle.endFill();
    handle.lineStyle(2, 0x000000);
    handle.drawCircle(0, 0, handleSize / 2);
    handle.x = sliderX;
    handle.y = sliderY + sliderHeight / 2;
    handle.eventMode = 'static';
    handle.cursor = 'pointer';
    panel.addChild(handle);
    this.betHandle = handle;

    const valueText = new Text('1', {
      fontFamily: 'Chewy',
      fontSize: 18,
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 2
    } as any);
    valueText.x = sliderX + sliderWidth + 12;
    valueText.y = sliderY - 10;
    panel.addChild(valueText);
    this.betValueText = valueText;

    const rubyIcon = Sprite.from('ruby.png');
    rubyIcon.scale.set(0.12);
    rubyIcon.x = sliderX + sliderWidth + 38;
    rubyIcon.y = sliderY - 14;
    panel.addChild(rubyIcon);

    // Interaction
    let isDragging = false;
    let dragStartX = 0;
    let startX = 0;
    const maxBet = Math.min(49, rubies);
    const setFromX = (newX: number) => {
      const minX = sliderX;
      const maxX = sliderX + sliderWidth;
      const clamped = Math.max(minX, Math.min(maxX, newX));
      handle.x = clamped;
      const ratio = (clamped - minX) / (maxX - minX);
      const bet = Math.max(1, Math.round(1 + ratio * (maxBet - 1)));
      valueText.text = String(bet);
    };
    // Initialize position
    setFromX(sliderX + (sliderWidth * (1 / Math.max(1, maxBet))));

    handle.on('pointerdown', (ev: any) => {
      isDragging = true;
      dragStartX = ev.global.x;
      startX = handle.x;
    });
    this.app.stage.on('pointermove', (ev: any) => {
      if (!isDragging) return;
      const deltaX = ev.global.x - dragStartX;
      setFromX(startX + deltaX);
    });
    this.app.stage.on('pointerup', () => { isDragging = false; });
    this.app.stage.on('pointerupoutside', () => { isDragging = false; });

    // Bet button
    const btn = new Graphics() as Graphics & { buttonMode: boolean };
    btn.beginFill(0x4CAF50);
    btn.drawRoundedRect(100, 150, 100, 34, 10);
    btn.endFill();
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.buttonMode = true;
    panel.addChild(btn);

    const btnText = new Text('BET!', {
      fontFamily: 'Chewy',
      fontSize: 20,
      fill: 0xffffff
    } as any);
    btnText.anchor.set(0.5);
    btnText.x = 150;
    btnText.y = 167;
    panel.addChild(btnText);

    btn.on('pointerdown', async () => {
      const amount = parseInt(valueText.text, 10) || 1;
      // Deduct bet upfront (consistent with Cosmo Climb betting flow)
      try {
        const current = await getUserRubies(this.userId);
        if (current < amount) {
          // Not enough rubies at commit time
          const warn = new Text('Not enough rubies', {
            fontFamily: 'Chewy', fontSize: 18, fill: 0xff6666, stroke: 0x000000, strokeThickness: 3
          } as any);
          warn.anchor.set(0.5);
          warn.x = 150; warn.y = 130;
          panel.addChild(warn);
          setTimeout(() => warn.destroy(), 1200);
          return;
        }
        await updateUserRubies(this.userId, -amount);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to place bet:', e);
        return;
      }
      if (this.onBetPlaced) this.onBetPlaced(amount);
      overlay.destroy({ children: true });
      this.bettingOverlay = undefined;
    });

    // Close button (X) to cancel betting
    const closeBtn = new Graphics();
    closeBtn.beginFill(0xff4444);
    closeBtn.drawCircle(0, 0, 15);
    closeBtn.endFill();
    closeBtn.lineStyle(2, 0xffffff);
    closeBtn.drawCircle(0, 0, 15);
    closeBtn.x = 280;
    closeBtn.y = 20;
    closeBtn.eventMode = 'static';
    closeBtn.cursor = 'pointer';
    panel.addChild(closeBtn);

    const closeText = new Text('×', {
      fontFamily: 'Chewy',
      fontSize: 24,
      fill: 0xffffff
    } as any);
    closeText.anchor.set(0.5);
    closeText.x = 280;
    closeText.y = 20;
    panel.addChild(closeText);

    closeBtn.on('pointerdown', () => {
      // If betting is cancelled, don't mark the powerup as used
      // The powerup will be available again
      overlay.destroy({ children: true });
      this.bettingOverlay = undefined;
    });

    this.bettingOverlay = overlay;
  }

  public cleanup(): void {
    if (this.blinkIntervalId) {
      clearInterval(this.blinkIntervalId);
      this.blinkIntervalId = undefined;
    }
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = undefined;
    }
    if (this.parent) {
      this.parent.removeChild(this);
    }
    this.destroy({ children: true });
  }

  public override destroy(options?: any): void {
    if (this.blinkIntervalId) clearInterval(this.blinkIntervalId);
    if (this.unsubscribeFn) this.unsubscribeFn();
    super.destroy(options);
  }
}


