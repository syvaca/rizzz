import { Sprite, Texture, Point } from 'pixi.js';

export enum AnimalType {
  MONKEY = 'monkey',
  GIRAFFE = 'giraffe',
  JAGUAR = 'jaguar',
  LION = 'lion'
}

const TOP_UI_HEIGHT = 70;
const VELOCITY_SCALE = 0.7;

export class Animal extends Sprite {
  public velocity: Point;
  public type: AnimalType;
  public isWanted: boolean;
  private speedMultiplier: number = 1;

  constructor(texture: Texture, type: AnimalType, isWanted: boolean = false) {
    super(texture);
    
    this.type = type;
    this.isWanted = isWanted;
    
    // Set random velocity
    const speed = 1 + Math.random() * 2; // Speed between 1-3
    const angle = Math.random() * Math.PI * 2;
    this.velocity = new Point(
      Math.cos(angle) * speed * VELOCITY_SCALE,
      Math.sin(angle) * speed * VELOCITY_SCALE
    );

    // Set random position
    this.x = Math.random() * (window.innerWidth - 64);
    this.y = TOP_UI_HEIGHT + Math.random() * (window.innerHeight - TOP_UI_HEIGHT - 64);

    // Set random z-index (depth)
    this.zIndex = Math.random() * 1000;

    // Enable interaction
    this.eventMode = 'static';
    this.cursor = 'pointer';

    // Scale the sprite to a reasonable size
    const maxSize = 80;
    const scaleFactor = maxSize / Math.max(this.texture.width, this.texture.height);
    this.scale.set(scaleFactor);
  }

  update(deltaTime: number) {
    // Update position based on velocity with speed multiplier
    this.x += this.velocity.x * deltaTime * VELOCITY_SCALE * this.speedMultiplier;
    this.y += this.velocity.y * deltaTime * VELOCITY_SCALE * this.speedMultiplier;

    // Bounce off walls
    const bounds = this.getBounds();
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    if (this.x <= 0 || this.x + bounds.width >= screenWidth) {
      this.velocity.x *= -1;
      this.x = Math.max(0, Math.min(screenWidth - bounds.width, this.x));
    }

    if (this.y <= TOP_UI_HEIGHT || this.y + bounds.height >= screenHeight) {
      this.velocity.y *= -1;
      this.y = Math.max(TOP_UI_HEIGHT, Math.min(screenHeight - bounds.height, this.y));
    }
  }

  setSpeedMultiplier(multiplier: number) {
    this.speedMultiplier = multiplier;
  }

  onClick(callback: () => void) {
    this.on('pointerdown', callback);
  }
} 