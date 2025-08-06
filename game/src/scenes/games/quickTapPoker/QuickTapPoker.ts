import * as PIXI from 'pixi.js';
import { PlayingCard } from './PlayingCard';
import { PokerHandEvaluator } from './PokerHandEvaluator';
import { ResizableScene } from '../../SceneManager';
import { getUserCoins, updateUserCoins } from '../../../firebase';

export class QuickTapPoker extends PIXI.Container implements ResizableScene {
  private app: PIXI.Application;
  private userId: string;
  private isMobile: boolean;
  private showMapMenu: () => void;

  // Game state
  private state: 'START' | 'PLAYING' | 'GAME_OVER' = 'START';
  private gameTimer = 0;
  private readonly GAME_DURATION = 5000; // 5 seconds in milliseconds
  
  // Cards
  private allCards: PlayingCard[] = [];
  private selectedCards: PlayingCard[] = [];
  private readonly MAX_SELECTED_CARDS = 5;
  private readonly TOTAL_CARDS_ON_SCREEN = 15;

  // UI containers
  private startContainer!: PIXI.Container;
  private gameContainer!: PIXI.Container;
  private endContainer!: PIXI.Container;

  // UI elements
  private timerText!: PIXI.Text;
  private selectedCountText!: PIXI.Text;
  private finalHandText!: PIXI.Text;
  private scoreText!: PIXI.Text;

  // Texture atlas
  private textureAtlas: PIXI.Spritesheet | null = null;

  // Score
  private score = 0;

  constructor(app: PIXI.Application, userId: string, showMapMenu: () => void, isMobile: boolean = false) {
    super();
    this.app = app;
    this.userId = userId;
    this.showMapMenu = showMapMenu;
    this.isMobile = isMobile;

    this.setupBackground();
    this.setupContainers();
    this.loadTextureAtlas();

    // Add game loop to ticker
    this.app.ticker.add(this.gameLoop);
  }

  private gameLoop = (ticker: PIXI.Ticker) => {
    this.update(ticker.deltaMS);
  };

  private async loadTextureAtlas(): Promise<void> {
    try {
      // Use the pre-loaded atlas from main.ts
      const atlasData = PIXI.Assets.get('quickTapPokerVisuals');
      this.textureAtlas = atlasData;
      console.log('QuickTapPoker texture atlas loaded successfully');
      
      // Update any sprites that need the atlas
      this.updateSpritesWithAtlas();
    } catch (error) {
      console.error('Failed to load QuickTapPoker texture atlas:', error);
      this.textureAtlas = null;
    }
  }

  private updateSpritesWithAtlas(): void {
    // This method can be used to update any existing sprites when atlas loads
    // Currently not needed as cards are created after atlas loads
  }

  private getTexture(textureName: string): PIXI.Texture {
    if (this.textureAtlas && this.textureAtlas.textures[textureName]) {
      return this.textureAtlas.textures[textureName];
    }
    // Fallback to individual texture loading if atlas fails
    return PIXI.Texture.from(`/assets/sprites/quickTapPoker/${textureName}`);
  }

  private setupBackground(): void {
    const bg = new PIXI.Graphics();
    bg.beginFill(0x0f4c3a); // Dark green poker table color
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

    // Title
    const title = new PIXI.Text('Quick Tap Poker', {
      fontSize: this.isMobile ? 36 : 64,
      fill: 0xffffff,
      fontFamily: 'SuperWater',
      align: 'center'
    });
    title.anchor.set(0.5);
    title.x = this.app.screen.width / 2;
    title.y = this.app.screen.height / 3;
    this.startContainer.addChild(title);

    // Instructions
    const instructions = new PIXI.Text(
      'Tap 5 cards in 5 seconds\nto make the best poker hand!',
      {
        fontSize: this.isMobile ? 18 : 24,
        fill: 0xcccccc,
        fontFamily: 'Arial',
        align: 'center'
      }
    );
    instructions.anchor.set(0.5);
    instructions.x = this.app.screen.width / 2;
    instructions.y = this.app.screen.height / 2;
    this.startContainer.addChild(instructions);

    // Start button
    const startButton = new PIXI.Text('TAP TO START', {
      fontSize: this.isMobile ? 24 : 32,
      fill: 0x00ff00,
      fontFamily: 'SuperWater'
    });
    startButton.anchor.set(0.5);
    startButton.x = this.app.screen.width / 2;
    startButton.y = this.app.screen.height * 2 / 3;
    this.startContainer.addChild(startButton);

    // Make interactive
    this.startContainer.eventMode = 'static';
    this.startContainer.on('pointerdown', () => this.startGame());
  }

  private setupGameScreen(): void {
    this.gameContainer.removeChildren();

    // Timer display
    this.timerText = new PIXI.Text('5.0', {
      fontSize: this.isMobile ? 32 : 48,
      fill: 0xff0000,
      fontFamily: 'SuperWater'
    });
    this.timerText.anchor.set(0.5, 0);
    this.timerText.x = this.app.screen.width / 2;
    this.timerText.y = 20;
    this.gameContainer.addChild(this.timerText);

    // Selected cards counter
    this.selectedCountText = new PIXI.Text('Selected: 0/5', {
      fontSize: this.isMobile ? 20 : 24,
      fill: 0xffffff,
      fontFamily: 'Arial'
    });
    this.selectedCountText.anchor.set(0, 0);
    this.selectedCountText.x = 20;
    this.selectedCountText.y = 20;
    this.gameContainer.addChild(this.selectedCountText);
  }

  private setupEndScreen(): void {
    this.endContainer.removeChildren();

    // Semi-transparent background
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.8);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    this.endContainer.addChild(bg);

    // Game Over title
    const gameOverText = new PIXI.Text('Time\'s Up!', {
      fontSize: this.isMobile ? 32 : 48,
      fill: 0xff0000,
      fontFamily: 'SuperWater'
    });
    gameOverText.anchor.set(0.5);
    gameOverText.x = this.app.screen.width / 2;
    gameOverText.y = this.app.screen.height / 3;
    this.endContainer.addChild(gameOverText);

    // Final hand result
    this.finalHandText = new PIXI.Text('', {
      fontSize: this.isMobile ? 20 : 28,
      fill: 0xffffff,
      fontFamily: 'Arial',
      align: 'center'
    });
    this.finalHandText.anchor.set(0.5);
    this.finalHandText.x = this.app.screen.width / 2;
    this.finalHandText.y = this.app.screen.height / 2;
    this.endContainer.addChild(this.finalHandText);

    // Score display
    this.scoreText = new PIXI.Text('Score: 0', {
      fontSize: this.isMobile ? 24 : 32,
      fill: 0x00ff00,
      fontFamily: 'SuperWater'
    });
    this.scoreText.anchor.set(0.5);
    this.scoreText.x = this.app.screen.width / 2;
    this.scoreText.y = this.app.screen.height * 2 / 3;
    this.endContainer.addChild(this.scoreText);

    // Restart button
    const restartText = new PIXI.Text('TAP TO PLAY AGAIN', {
      fontSize: this.isMobile ? 20 : 24,
      fill: 0xcccccc,
      fontFamily: 'Arial'
    });
    restartText.anchor.set(0.5);
    restartText.x = this.app.screen.width / 2;
    restartText.y = this.app.screen.height * 3 / 4;
    this.endContainer.addChild(restartText);

    // Make interactive
    this.endContainer.eventMode = 'static';
    this.endContainer.on('pointerdown', () => this.startGame());
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
  }

  private startGame(): void {
    this.gameTimer = this.GAME_DURATION;
    this.selectedCards = [];
    this.score = 0;
    
    // Clear existing cards
    this.allCards.forEach(card => {
      if (card.parent) {
        card.parent.removeChild(card);
      }
    });
    this.allCards = [];

    // Create and position 15 random cards
    this.createRandomCards();
    this.showGameScreen();
  }

  private createRandomCards(): void {
    const deck = this.createFullDeck();
    
    // Shuffle and take 15 cards
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    const selectedDeck = deck.slice(0, this.TOTAL_CARDS_ON_SCREEN);
    
    // Position cards randomly on screen
    selectedDeck.forEach((cardData, index) => {
      const card = new PlayingCard(
        cardData.suit,
        cardData.rank,
        this.getTexture(cardData.textureName),
        () => this.onCardTapped(card)
      );
      
      // Random position with some padding from edges
      const padding = 80;
      card.x = padding + Math.random() * (this.app.screen.width - 2 * padding);
      card.y = 100 + Math.random() * (this.app.screen.height - 200);
      
      this.allCards.push(card);
      this.gameContainer.addChild(card);
    });
  }

  private createFullDeck(): Array<{suit: string, rank: string, textureName: string, value: number}> {
    const suits = ['club', 'diamonds', 'heart', 'spades'];
    const ranks = [
      { name: 'two', value: 2 },
      { name: 'three', value: 3 },
      { name: 'four', value: 4 },
      { name: 'five', value: 5 },
      { name: 'six', value: 6 },
      { name: 'seven', value: 7 },
      { name: 'eight', value: 8 },
      { name: 'nine', value: 9 },
      { name: 'ten', value: 10 },
      { name: 'jack', value: 11 },
      { name: 'queen', value: 12 },
      { name: 'king', value: 13 },
      { name: 'ace', value: 14 }
    ];

    const deck: Array<{suit: string, rank: string, textureName: string, value: number}> = [];
    
    suits.forEach(suit => {
      ranks.forEach(rank => {
        deck.push({
          suit,
          rank: rank.name,
          textureName: `tiny-card-${suit}-reg-${rank.name}-64x64.png`,
          value: rank.value
        });
      });
    });
    
    return deck;
  }

  private onCardTapped(card: PlayingCard): void {
    if (this.state !== 'PLAYING') return;
    
    if (card.isSelected) {
      // Deselect card
      card.setSelected(false);
      const index = this.selectedCards.indexOf(card);
      if (index > -1) {
        this.selectedCards.splice(index, 1);
      }
    } else if (this.selectedCards.length < this.MAX_SELECTED_CARDS) {
      // Select card
      card.setSelected(true);
      this.selectedCards.push(card);
    }
    
    this.updateSelectedCountDisplay();
  }

  private updateSelectedCountDisplay(): void {
    this.selectedCountText.text = `Selected: ${this.selectedCards.length}/${this.MAX_SELECTED_CARDS}`;
  }

  private update(deltaMS: number): void {
    if (this.state !== 'PLAYING') return;

    this.gameTimer -= deltaMS;
    
    // Update timer display
    const secondsLeft = Math.max(0, this.gameTimer / 1000);
    this.timerText.text = secondsLeft.toFixed(1);
    
    // Change timer color as time runs out
    if (secondsLeft <= 2) {
      this.timerText.style.fill = 0xff0000; // Red
    } else if (secondsLeft <= 3) {
      this.timerText.style.fill = 0xffaa00; // Orange
    } else {
      this.timerText.style.fill = 0x00ff00; // Green
    }

    // End game when timer reaches 0
    if (this.gameTimer <= 0) {
      this.endGame();
    }
  }

  private async endGame(): Promise<void> {
    this.state = 'GAME_OVER';
    
    // Evaluate the selected hand
    const handResult = PokerHandEvaluator.evaluateHand(this.selectedCards);
    this.score = handResult.score;
    
    // Update display
    this.finalHandText.text = `Your Hand: ${handResult.handName}\nCards Selected: ${this.selectedCards.length}/5`;
    this.scoreText.text = `Score: ${this.score}`;
    
    // Update user coins
    try {
      await updateUserCoins(this.userId, this.score);
    } catch (error) {
      console.error('Failed to update user coins:', error);
    }
    
    this.showEndScreen();
  }

  // ResizableScene interface
  resize(): void {
    // Update positions for different screen sizes
    if (this.timerText) {
      this.timerText.x = this.app.screen.width / 2;
    }
    // Add more resize logic as needed
  }

  destroy(options?: any): void {
    this.app.ticker.remove(this.gameLoop);
    super.destroy(options);
  }
}
