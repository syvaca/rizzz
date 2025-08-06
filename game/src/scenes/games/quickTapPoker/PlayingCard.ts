import * as PIXI from 'pixi.js';

export class PlayingCard extends PIXI.Container {
  public readonly suit: string;
  public readonly rank: string;
  public readonly value: number;
  public isSelected: boolean = false;
  
  private cardSprite!: PIXI.Sprite;
  private selectionBorder!: PIXI.Graphics;
  private onTapCallback: () => void;

  constructor(suit: string, rank: string, texture: PIXI.Texture, onTap: () => void) {
    super();
    
    this.suit = suit;
    this.rank = rank;
    this.value = this.getRankValue(rank);
    this.onTapCallback = onTap;
    
    this.setupCard(texture);
    this.setupInteraction();
  }

  private setupCard(texture: PIXI.Texture): void {
    // Create card sprite
    this.cardSprite = new PIXI.Sprite(texture);
    this.cardSprite.anchor.set(0.5);
    this.addChild(this.cardSprite);
    
    // Create selection border (initially invisible)
    this.selectionBorder = new PIXI.Graphics();
    this.selectionBorder.lineStyle(4, 0x00ff00, 1); // Green border
    this.selectionBorder.drawRoundedRect(-34, -34, 68, 68, 8); // Slightly larger than card
    this.selectionBorder.visible = false;
    this.addChild(this.selectionBorder);
  }

  private setupInteraction(): void {
    this.eventMode = 'static';
    this.cursor = 'pointer';
    
    // Add hover effects
    this.on('pointerover', () => {
      if (!this.isSelected) {
        this.scale.set(1.1);
      }
    });
    
    this.on('pointerout', () => {
      if (!this.isSelected) {
        this.scale.set(1.0);
      }
    });
    
    this.on('pointerdown', () => {
      this.onTapCallback();
    });
  }

  public setSelected(selected: boolean): void {
    this.isSelected = selected;
    this.selectionBorder.visible = selected;
    
    if (selected) {
      this.scale.set(1.1);
      // Add a green tint to indicate selection
      this.cardSprite.tint = 0x90ff90; // Light green tint
    } else {
      this.scale.set(1.0);
      this.cardSprite.tint = 0xffffff; // Reset to normal (white)
    }
  }

  private getRankValue(rank: string): number {
    const rankValues: { [key: string]: number } = {
      'two': 2,
      'three': 3,
      'four': 4,
      'five': 5,
      'six': 6,
      'seven': 7,
      'eight': 8,
      'nine': 9,
      'ten': 10,
      'jack': 11,
      'queen': 12,
      'king': 13,
      'ace': 14
    };
    
    return rankValues[rank] || 0;
  }

  // Helper method to get suit color for poker evaluation
  public getSuitColor(): 'red' | 'black' {
    return (this.suit === 'heart' || this.suit === 'diamonds') ? 'red' : 'black';
  }

  // Helper method for display purposes
  public getDisplayName(): string {
    const rankDisplay: { [key: string]: string } = {
      'two': '2',
      'three': '3',
      'four': '4',
      'five': '5',
      'six': '6',
      'seven': '7',
      'eight': '8',
      'nine': '9',
      'ten': '10',
      'jack': 'J',
      'queen': 'Q',
      'king': 'K',
      'ace': 'A'
    };
    
    const suitDisplay: { [key: string]: string } = {
      'club': '♣',
      'diamonds': '♦',
      'heart': '♥',
      'spades': '♠'
    };
    
    return `${rankDisplay[this.rank]}${suitDisplay[this.suit]}`;
  }
}
