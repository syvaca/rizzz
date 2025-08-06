import * as PIXI from 'pixi.js';

export type PowerUpType = 'SAFETY_NET' | 'SLOW_GRAVITY';

export class PowerUp {
  public type: PowerUpType;      // ← field declarations
  private game: any;             //   (annotate with your Game class if you have one)

  constructor(type: PowerUpType, game: any) {  // ← plain parameters
    this.type = type;   // explicit assignments satisfy `erasableSyntaxOnly`
    this.game = game;
  }

  apply() {
    switch (this.type) {
      case 'SAFETY_NET':
        this.addNet();
        break;
      case 'SLOW_GRAVITY':
        this.tweenGravity(0.2, 6000);
        break;
    }
  }

  // Net stays for 10 seconds and catches falling objects
  private addNet() {
    // Create the net sprite from texture atlas
    const net = new PIXI.Sprite(this.game.getTexture('Net.png'));
    
    // Set anchor to top-left so scaling works correctly
    net.anchor.set(0, 0);
    
    // Scale to stretch across entire screen width
    net.width = this.game.app.screen.width;
    
    // Position at bottom of screen
    net.x = 0; // Start at left edge
    net.y = this.game.app.screen.height - net.height - 5; // Much closer to bottom with minimal padding
    
    // Add to stage
    this.game.app.stage.addChild(net);
    
    // Make net non-interactive so it doesn't block clicks on caught items
    net.eventMode = 'none';
    
    // Store reference to net in game for collision detection
    this.game.safetyNet = {
      sprite: net, // Use the actual net sprite for collision detection
      active: true
    };
    
    // Start blinking animation after 7 seconds (3 seconds before removal)
    setTimeout(() => {
      if (this.game.safetyNet && this.game.safetyNet.sprite === net) {
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
          if (this.game.safetyNet && this.game.safetyNet.sprite === net) {
            // Use alpha transparency for blinking instead of visibility
            net.alpha = net.alpha === 1 ? 0.3 : 1; // Toggle between full and semi-transparent
            blinkCount++;
            
            // Stop blinking after 12 blinks (3 seconds at 0.25s intervals)
            if (blinkCount >= 12) {
              clearInterval(blinkInterval);
              net.alpha = 1; // Ensure it's fully visible at the end
            }
          } else {
            clearInterval(blinkInterval);
          }
        }, 250); // Blink every 0.25 seconds (faster)
      }
    }, 7000); // Start blinking after 7 seconds
    
    // Remove net after 10 seconds
    setTimeout(() => {
      if (this.game.safetyNet && this.game.safetyNet.sprite === net) {
        this.game.app.stage.removeChild(net);
        this.game.safetyNet = null;
      }
    }, 10000); // 10 seconds
  }

  // Temporarily lower gravity, then restore
  private tweenGravity(target: number, ms: number) {
    const original = this.game.gravity;
    this.game.gravity = target;
    setTimeout(() => (this.game.gravity = original), ms);
  }
}
