import { Sprite, Texture } from 'pixi.js';

export enum PowerupType {
  MULTIPLIER = 'multiplier',
  EXTRA_LIFE = 'extra-life',
  BETTING = 'betting'
}

export class Powerup extends Sprite {
  private frameTime: number = 0;
  private currentFrame: number = 0;
  private frameDuration: number;
  private frames: Texture[];
  public readonly type: PowerupType;

  constructor(type: PowerupType, frames: Texture[], frameDuration: number = 0.2) {
    super(frames[0]);
    
    this.type = type;
    this.frames = frames;
    this.frameDuration = frameDuration * 60; // Convert to frames (assuming 60fps)
    this.anchor.set(0.5);
    
    // Set initial frame
    this.texture = this.frames[this.currentFrame];
  }

  /**
   * Updates the powerup's animation
   * @param deltaTime Time since last update in seconds
   */
  public update(deltaTime: number): void {
    // Only update if we have multiple frames
    if (this.frames.length <= 1) return;
    
    // Update frame timer
    this.frameTime += deltaTime * 60; // Convert to frames (assuming 60fps)
    
    // Check if it's time to change frames
    if (this.frameTime >= this.frameDuration) {
      this.frameTime = 0;
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.texture = this.frames[this.currentFrame];
    }
  }

  /**
   * Cleans up the powerup's resources
   */
  public destroy(): void {
    // Remove all event listeners
    this.removeAllListeners();
    
    // Call parent's destroy method
    super.destroy({ children: true });
  }
}
