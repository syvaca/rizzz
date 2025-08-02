import { Application, Container, Assets, Text, TextStyle, Graphics, Sprite, Texture } from 'pixi.js';
import { Animal, AnimalType } from './Animal';
import { ResizableScene } from '../../SceneManager';

export class AnimalFinderGame extends Container implements ResizableScene {
  // overlay
  private overlayContainer!: Container;
  private overlayTimeout!: ReturnType<typeof setTimeout>;
  private round:number = 1;
  private speedMultiplier: number = 1; // Add speed multiplier

  // wanted animal
  private wantedAnimals: AnimalType[] = [
    AnimalType.MONKEY,
    AnimalType.GIRAFFE,
    AnimalType.JAGUAR,
    AnimalType.LION
  ];
  private wantedAnimalType!: AnimalType;

  private animals: Animal[] = [];
  private gameTimer!: Text;
  private timeRemaining: number = 15;
  private gameState: 'playing' | 'won' | 'lost' = 'playing';
  private background!: Graphics;
  private resultText!: Text;

  constructor(
    private readonly app: Application,
    private readonly onStart: () => void
  ) {
    super();
    this.sortableChildren = true;
    this.setupGame();
  }

  private async setupGame() {
    this.loadBackground();

    // Load and animal textures
    const randomIndex = Math.floor(Math.random() * this.wantedAnimals.length);
    this.wantedAnimalType = this.wantedAnimals[randomIndex];
    const textures = await this.loadAnimalTextures();
    
    // Create UI
    await this.createUI();

    // Show overlay (then create animals and start game after delay)
    await this.showWantedOverlay(textures[this.wantedAnimalType], () => {
      this.createAnimals(textures);
      this.app.ticker.add(this.gameLoop);
    });
  }

  private loadBackground() {
    const background = Sprite.from('background');
    background.width = window.innerWidth;
    background.height = window.innerHeight;
    this.addChild(background);
  }

  private async loadAnimalTextures() {
    const atlas = await Assets.load('/assets/sprites/animalFinderSprites/animals.json');

    return {
      monkey: atlas.textures['monkey.png'],
      giraffe: atlas.textures['giraffe.png'],
      jaguar: atlas.textures['jaguar.png'],
      lion: atlas.textures['lion.png']
    };
  }

  private createAnimals(textures: any) {
    // Determine non-wanted animal types
    const nonWantedTypes = Object.values(AnimalType).filter(
      type => type !== this.wantedAnimalType
    );

    // Create 17 of each non-wanted animal
    nonWantedTypes.forEach(type => {
      for (let i = 0; i < 17; i++) {
        const animal = new Animal(this.getTextureForType(textures, type), type, false);
        animal.setSpeedMultiplier(this.speedMultiplier); // Set speed multiplier
        this.animals.push(animal);
        this.addChild(animal);
      }
    });

    // Create 1 wanted animal
    const wantedAnimal = new Animal(
      this.getTextureForType(textures, this.wantedAnimalType),
      this.wantedAnimalType,
      true
    );
    wantedAnimal.setSpeedMultiplier(this.speedMultiplier); // Set speed multiplier
    this.animals.push(wantedAnimal);
    this.addChild(wantedAnimal);
    
    // Set up click handlers
    this.animals.forEach(animal => {
      animal.onClick(() => this.onAnimalClick(animal));
    });
  }

  private getTextureForType(textures: Record<string, Texture>, type: AnimalType): Texture {
    return textures[type];
  }

  private async createPoster() {
    // Remove any existing poster sprites by finding them in children
    this.children.forEach(child => {
      if (child instanceof Sprite && child.x === window.innerWidth - 50 && (child.y === 50 || child.y === 55)) {
        console.log('Removing old sprite');
        this.removeChild(child);
        child.destroy();
      }
    });
    
    // Wanted poster and animal in upper right corner
    const atlas = await Assets.load('/assets/sprites/animalFinderSprites/animals.json');
    const posterTexture = atlas.textures['wanted poster.png'];
    const animalTexture = atlas.textures[`${this.wantedAnimalType}.png`];
    
    // Create poster sprite
    const posterSprite = new Sprite(posterTexture);
    posterSprite.anchor.set(0.5);
    posterSprite.x = window.innerWidth - 50; // Upper right corner
    posterSprite.y = 50; // Same height as timer
    posterSprite.scale.set(0.1); // Make it small
    this.addChild(posterSprite);
    
    // Create animal sprite
    const animalSprite = new Sprite(animalTexture);
    animalSprite.anchor.set(0.5);
    animalSprite.x = window.innerWidth - 50; // Same x as poster
    animalSprite.y = 50 + 5; // Slightly lower than poster center
    animalSprite.scale.set(0.08); // Make animal smaller than poster
    this.addChild(animalSprite);

  }

  private async createUI() {
    // Timer text
    const timerStyle = new TextStyle({
      fontFamily: 'Hanalei Fill',
      fontSize: 48,
      fill: 0xEBBD72,
      stroke: 0x000000
    });

    this.gameTimer = new Text({
      text: `Time: ${this.timeRemaining}`,
      style: timerStyle
    });
    this.gameTimer.x = 20;
    this.gameTimer.y = 20;
    this.addChild(this.gameTimer);

    this.createPoster();

    // Result text (hidden initially)
    const resultStyle = new TextStyle({
      fontFamily: 'Hanalei Fill',
      fontSize: 36,
      fill: 0xFFFFFF,
      stroke: 0x000000
    });

    this.resultText = new Text({
      text: '',
      style: resultStyle
    });
    this.resultText.x = window.innerWidth / 2 - this.resultText.width / 2;
    this.resultText.y = window.innerHeight / 2 - this.resultText.height / 2;
    this.resultText.visible = false;
    this.resultText.zIndex = 9999;
    this.addChild(this.resultText);
  }

  private async showWantedOverlay(texture: Texture, onComplete: () => void) {
    this.overlayContainer = new Container();
  
    // Dimmed background
    const dimmer = new Graphics();
    dimmer.beginFill(0x000000, 0.7);
    dimmer.drawRect(0, 0, window.innerWidth, window.innerHeight);
    dimmer.endFill();
    this.overlayContainer.addChild(dimmer);

    // Round number
    const label = new Text(`Round ${this.round}`, new TextStyle({
      fontFamily: 'Hanalei Fill',
      fontSize: 60,
      fill: 0xEBBD72,
      stroke: 0x000000,
    }));
    label.anchor.set(0.5);
    label.x = window.innerWidth / 2;
    label.y = window.innerHeight / 4;
    this.overlayContainer.addChild(label);
  
    // Wanted poster background
    const atlas = await Assets.load('/assets/sprites/animalFinderSprites/animals.json');
    const posterTexture = atlas.textures['wanted poster.png'];
    const posterSprite = new Sprite(posterTexture);
    posterSprite.anchor.set(0.5);
    posterSprite.x = window.innerWidth / 2;
    posterSprite.y = window.innerHeight / 2;
    
    // Scale poster to reasonable size
    const posterMaxSize = 300;
    const posterScale = Math.min(posterMaxSize / posterTexture.width, posterMaxSize / posterTexture.height);
    posterSprite.scale.set(posterScale);
    
    this.overlayContainer.addChild(posterSprite);
  
    // Wanted animal image
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.x = window.innerWidth / 2;
    sprite.y = window.innerHeight / 2 + 20; // Move animal lower on the poster
  
    // Scale to fit around 150px
    const maxSize = 150;
    const scale = Math.min(maxSize / texture.width, maxSize / texture.height);
    sprite.scale.set(scale);
  
    this.overlayContainer.addChild(sprite);
  
    this.addChild(this.overlayContainer);
  
    // Remove overlay after 5 seconds
    this.overlayTimeout = setTimeout(() => {
      this.removeChild(this.overlayContainer);
      onComplete(); // Start game
    }, 3000);
  }
  
  private lastTime: number = 0;
  
  private gameLoop = () => {
    if (this.gameState !== 'playing') return;

    // Update timer using actual delta time
    const currentTime = Date.now();
    if (this.lastTime === 0) {
      this.lastTime = currentTime;
    }
    
    const deltaSeconds = (currentTime - this.lastTime) / 1000;
    this.timeRemaining -= deltaSeconds;
    this.lastTime = currentTime;
    
    this.gameTimer.text = `Time: ${Math.max(0, Math.ceil(this.timeRemaining))}`;

    // Check if time ran out
    if (this.timeRemaining <= 0) {
      this.endGame(false);
      return;
    }

    // Update all animals
    this.animals.forEach(animal => animal.update(1));
  }

  private onAnimalClick(animal: Animal) {
    if (this.gameState !== 'playing') return;

    if (animal.isWanted) {
      animal.tint = 0x65CC3F; // Flash green
      setTimeout(() => {
        animal.tint = 0xFFFFFF; // Reset to normal
      }, 500);
      this.endGame(true);
    } else {
      // Wrong animal clicked - maybe add some feedback
      animal.tint = 0xCC523F; // Flash red
      setTimeout(() => {
        animal.tint = 0xFFFFFF; // Reset to normal
      }, 200);
    }
  }

  private endGame(won: boolean) {
    this.gameState = won ? 'won' : 'lost';
    
    this.resultText.text = won ? 'YOU WIN!' : 'TIME\'S UP! YOU LOSE!';
    this.resultText.visible = true;
    this.resultText.x = window.innerWidth / 2 - this.resultText.width / 2;
    this.resultText.y = window.innerHeight / 2 - this.resultText.height / 2;

    // Stop the game loop
    this.app.ticker.remove(this.gameLoop);

    if (won) {
      this.round++;
      // Add restart functionality for win
      setTimeout(() => {
        this.restartGame();
      }, 3000);
    } else {
      // Remove all animals except the wanted animal
      const wantedAnimal = this.animals.find(a => a.isWanted);
      this.animals.forEach(animal => {
        if (!animal.isWanted) {
          this.removeChild(animal);
          animal.destroy();
        }
      });
      this.animals = wantedAnimal ? [wantedAnimal] : [];
      // Return to menu after 2 seconds if lost
      setTimeout(() => {
        this.onStart();
      }, 2000);
    }
  }

  private async restartGame() {
    // Clear all animals
    this.animals.forEach(animal => {
      this.removeChild(animal);
      animal.destroy();
    });
    this.animals = [];

    // Reset game state
    this.timeRemaining = 15;
    this.gameState = 'playing';
    this.resultText.visible = false;
    this.lastTime = 0; // Reset lastTime to fix timer issue

    // Increase speed every 3 rounds
    if (this.round % 3 === 0) {
      this.speedMultiplier += 0.50; // Increase speed by 50% every 3 rounds
    }

    // Reload textures and recreate animals
    const randomIndex = Math.floor(Math.random() * this.wantedAnimals.length);
    this.wantedAnimalType = this.wantedAnimals[randomIndex];
    await this.createPoster();
    this.loadAnimalTextures().then(async textures => {
      await this.showWantedOverlay(textures[this.wantedAnimalType], async () => {
        this.createAnimals(textures);
        this.app.ticker.add(this.gameLoop);
      });
    });
  }

  public resize() {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    
    // Update background
    this.background.clear();
    this.background.beginFill(0x87CEEB);
    this.background.drawRect(0, 0, window.innerWidth, window.innerHeight);
    this.background.endFill();
    
    if (this.resultText && this.resultText.visible) {
      this.resultText.x = window.innerWidth / 2 - this.resultText.width / 2;
      this.resultText.y = window.innerHeight / 2 - this.resultText.height / 2;
    }
  }
}