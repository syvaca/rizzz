import * as PIXI from 'pixi.js';

export class FallingItem extends PIXI.Sprite {
  private vy   = 0;                // px / s
  private spin = (Math.random() - 0.5) * Math.PI; // rad / s
  public itemType: string;         // Track what type of item this is
  public isCaught = false;         // Track if item is caught by safety net

  constructor(tex: PIXI.Texture, itemType: string) {
    super(tex);
    this.anchor.set(0.5);
    this.itemType = itemType;

    // 🔽 adjust this number to taste (e.g., 0.25 = 25 % of original)
    const size = 0.05 + Math.random() * 0.1;  // 25–35 % scale
    this.scale.set(size);
  }

  public get velocityY(): number {
    return this.vy;
  }

  update(dt: number, gravity: number) { // dt in seconds
    // Don't apply gravity if caught by safety net
    if (!this.isCaught) {
      this.vy += gravity * dt;       // accelerate
    }
    this.y  += this.vy * dt;       // move
    this.rotation += this.spin * dt;
  }

  kick() {
    this.vy = -600;                // upward impulse (px / s)
    this.isCaught = false;         // Release from safety net when kicked
  }

  catch() {
    this.vy = 0;                   // stop falling when caught by net
    this.isCaught = true;          // Mark as caught
  }
}
