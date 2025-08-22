import { Application, Assets, Container, Graphics, scaleModeToGlFilter, Sprite, Text, Ticker } from 'pixi.js';
import { getUserRubies, updateUserPowerups, updateUserRubies } from '../../../firebase';
import { PowerupMenu, PowerupType } from '../../../components/PowerupMenu';

export class GemHuntGame extends Container {

  // Start Overlay
  private startScreen!: Container;
  private startBackground!: Graphics;
  private startText!: Text;
  private startButton!: Sprite;
  private betValue!: Text;
  private rubySprite!: Sprite;
  private currentBet: number = 10;
  private powerupMenu?: PowerupMenu;
  private multiplierActive: boolean = false;
  private bettingActive: boolean = false;
  private bettingAmount: number = 0;

  // Game Set Up
  private background!: Sprite;
  private title!: Sprite;
  private gameBoard!: Sprite;
  private tiles: Sprite[] = [];
  private numTiles: number = 25;

  // Gems
  private diamond!: Sprite;
  private diamondIndex!: number;
  private golds: Sprite[] = [];
  private goldIndices: number[] = [];
  private skulls: Sprite[] = [];
  private skullIndices: number[] = [];
  private powerUp!: Sprite;
  private powerUpIndex!: number;
  private powerUpType!: string;

  // User
  private userTiles: number[] = [];
  private gameWon: boolean = false;

  // Score
  private goldIcon!: Sprite;
  private goldScore!: Text;
  private diamondIcon!: Sprite;
  private diamondScore!: Text;
  private deathIcon!: Sprite;
  private deathScore!: Text;


  constructor(
    private readonly app: Application,
    private readonly userId: string,
    private readonly onReturnToMap: () => void
  ) {
    super();
    this.init();
    this.resize();

    window.addEventListener('resize', () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
      this.resize();
    });
  }

  private async init() {
    this.initBackground();
    this.initGameBoard();
    this.initTiles();
    this.initGems();
    this.initScore();
    this.startOverlay();
  }

  // Show start of game overlay
  private async startOverlay() {
    // Create an overlay container
    this.startScreen = new Container();
    this.startScreen.eventMode = 'static';

    // Dim background
    this.startBackground = new Graphics();
    this.startScreen.addChild(this.startBackground);

    // Instruction text
    this.startText = new Text('Find all the gems before the skulls!', {
      fontFamily: 'Montserrat, sans-serif',
      fontSize: 28,
      stroke: 0x000000,
      fill: 0xffffff,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: this.app.renderer.width * 0.8
    });
    this.startScreen.addChild(this.startText);

    // Start button
    this.startButton = Sprite.from('play button.png');
    this.startButton.eventMode = 'static';
    this.startButton.cursor = 'pointer';
    this.startButton.on('pointerdown', async () => {
      // if not enough rubies, show error message and return to map
      const userRubies = await getUserRubies(this.userId);
      if (userRubies < this.currentBet) {
        this.startText.text = 'Not enough rubies';
        this.startText.style.fill = 0xff0000; // Change text color to red
        setTimeout(() => {
          this.onReturnToMap();
        }, 2000);
        return;
      }
      // Otherwise, start the game
      this.removeChild(this.startScreen);

      // Reset powerup state for new game
      this.multiplierActive = false;
      this.bettingActive = false;
      this.bettingAmount = 0;
      
      // Show reusable powerup menu and keep it visible until the first tile is clicked
      this.powerupMenu = new PowerupMenu(this.app, this.userId, {
        onSelect: (type: PowerupType) => {
          if (type === 'multiplier') {
            this.multiplierActive = true;
          }
        },
        onBetPlaced: (amount: number) => {
          this.bettingActive = true;
          this.bettingAmount = amount;
        }
      });
      
      // Reset powerup menu state for new game
      this.powerupMenu.resetForNewGame();
      
      this.sortableChildren = true as true;
      this.addChild(this.powerupMenu);
    });

    this.startScreen.addChild(this.startButton);
    this.addChild(this.startScreen);

    // Bet value text
    this.betValue = new Text(`${this.currentBet}`, {
      fontFamily: 'Montserrat, sans-serif',
      fontSize: 18,
      fill: 0xffffff,
      stroke: 0x000000
    });
    this.startScreen.addChild(this.betValue);

    // Ruby sprite
    this.rubySprite = Sprite.from('ruby.png');
    this.startScreen.addChild(this.rubySprite);
    
    this.positionOverlay();
  }

  private positionOverlay() {
    const rw = this.app.renderer.width;
    const rh = this.app.renderer.height;

    this.startBackground.clear();
    this.startBackground.beginFill(0x000000, 0.65);
    this.startBackground.drawRect(0, 0, rw, rh);
    this.startBackground.endFill();

    // Position instruction text
    this.startText.anchor.set(0.5);
    this.startText.style.wordWrapWidth = rw * 0.8;
    this.startText.x = rw / 2;
    this.startText.y = rh / 3;

    // Position bet value text
    this.betValue.anchor.set(0.5);
    this.betValue.scale.set(2.2);
    this.betValue.x = rw / 2 + 30; // right of ruby
    this.betValue.y = rh *2/3 - 20;

    // Position ruby sprite
    this.rubySprite.anchor.set(0.5);
    this.rubySprite.scale.set(0.2);
    this.rubySprite.x = rw / 2 - 30; // left of bet value
    this.rubySprite.y = rh *2/3 - 20;

    // Position start button
    const scale = rw * 0.25 / this.startButton.texture.width;
    this.startButton.scale.set(scale);
    this.startButton.anchor.set(0.5);
    this.startButton.x = rw / 2;
    this.startButton.y = rh / 2;
  }

  // Initialize the background and title
  private initBackground() {
    this.background = Sprite.from('gemHuntBackground');
    this.addChild(this.background);

    this.title = Sprite.from('title.png');
    this.addChild(this.title);
  }

  // Position background to fill the screen
  private positionBackground() {
    const rendererWidth = this.app.renderer.width;
    const rendererHeight = this.app.renderer.height;
    const texWidth = this.background.texture.width;
    const texHeight = this.background.texture.height;

    const scale = Math.max(rendererWidth / texWidth, rendererHeight / texHeight);
    this.background.scale.set(scale);
    this.background.x = (rendererWidth - texWidth * scale) / 2;
    this.background.y = (rendererHeight - texHeight * scale) / 2;
  }

  // TODO: fix title positioning
  private positionTitle() {
    const rendererWidth = this.app.renderer.width;
    const rendererHeight = this.app.renderer.height;
  
    // Position the title at the top center of the screen
    const vp = Math.min(rendererWidth, rendererHeight);
    const t = Math.min(Math.max((vp - 480) / (1080 - 480), 0), 1);

    const minScale = 0.2;
    const maxScale = 0.4;
    const dynamicScale = minScale + (maxScale - minScale) * t;
    this.title.scale.set(dynamicScale);
    this.title.anchor.set(0.5, 0);
    this.title.x = rendererWidth / 2;
  
    const idealMinY = rendererHeight * 0.25;
    const idealMaxY = 10;
    let dynY = idealMinY + (idealMaxY - idealMinY) * t;

    const topTile = this.gameBoard;
    const tileScale = this.gameBoard.scale.x;
    const tileH     = this.gameBoard.texture.height * tileScale;
    const tileTop   = topTile.y - tileH / 2;

    const titleH = this.title.texture.height * dynamicScale;
    const margin = 10;
    const maxY   = tileTop - margin - titleH;
    if (dynY > maxY) dynY = maxY;
    this.title.y = dynY; 
  }

  // Initialize the game board
  private initGameBoard() {
    this.gameBoard = Sprite.from('gameboard.png');
    this.addChild(this.gameBoard);
  }

  private positionGameBoard() {
    const rw = this.app.renderer.width;
    const rh = this.app.renderer.height;
    const tw = this.gameBoard.texture.width;
    const th = this.gameBoard.texture.height;

    this.gameBoard.scale.set(Math.min(rw / tw, rh / th) * 3.5 / 4);
    this.gameBoard.anchor.set(0.5);
    this.gameBoard.x = rw / 2;
    this.gameBoard.y = rh / 2;
  }

  // Initialize the tiles into an array
  private initTiles() {
    this.tiles = [];
    for (let i = 0; i < this.numTiles; i++) {
      const tile = Sprite.from('tile.png');
      tile.anchor.set(0.5);
      tile.interactive = true;
      (tile as any).buttonMode = true;

      // pointer effects
      tile.on('pointerover', () => (tile.tint = 0xaaaaaa));
      tile.on('pointerout', () => (tile.tint = 0xffffff));
      tile.on('pointerdown', () => this.chosenTile(tile));

      this.addChild(tile);
      this.tiles.push(tile);
    }
    this.positionTiles();
  }

  // Position the tiles into the game board
  private positionTiles() {
    if (!this.gameBoard || this.tiles.length === 0) return;

    const count = this.tiles.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    const gridFraction = 0.82; // How much of the board to use for tiles+gaps
    const gapRatio = 0.35; // Gap between tiles as a fraction of tile size

    const boardSize = Math.min(this.gameBoard.width, this.gameBoard.height);
    const available = boardSize * gridFraction;
    const divisor = cols + (cols - 1) * gapRatio;
    const tileSize = available / divisor;
    const gap = tileSize * gapRatio;

    const origTex = this.tiles[0].texture.width;
    const scale = tileSize / origTex;

    // Compute grid's total width/height in world space
    const gridW = tileSize * cols + gap * (cols - 1);
    const gridH = tileSize * rows + gap * (rows - 1);

    const startX = this.gameBoard.x - gridW / 2 + tileSize / 2;
    const startY = this.gameBoard.y - gridH / 2 + tileSize / 2;

    this.tiles.forEach((tile, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;

      tile.scale.set(scale);
      tile.x = startX + col * (tileSize + gap);
      tile.y = startY + row * (tileSize + gap);
    });
  }

  // Initialize the gems (diamond, golds, and skulls)
  // Place gems randomly on the tiles
  private initGems() {
    // Diamond 
    this.diamondIndex = Math.floor(Math.random() * this.numTiles);
    this.diamond = Sprite.from('diamond.png');
    this.diamond.anchor.set(0.5);
    this.addChild(this.diamond);
    this.addChildAt(this.diamond, this.getChildIndex(this.tiles[this.diamondIndex]));

    // sqrt number used to determine how many golds and skulls to place -- can be changed / deleted once we create game modes
    const sqrt = Math.ceil(Math.sqrt(this.numTiles));

    // Golds
    const goldsCount = sqrt;
    this.golds = [];
    for (let i = 0; i < goldsCount; i++) {
      let index;
      do {
        index = Math.floor(Math.random() * this.numTiles);
      } while (this.goldIndices.includes(index) || this.diamondIndex === index || this.skullIndices.includes(index));
      this.goldIndices.push(index);
      const gold = Sprite.from('gold.png');
      gold.anchor.set(0.5);
      this.addChild(gold);

      // copy position & scale
     this.addChildAt(gold, this.getChildIndex(this.tiles[index]));    // COMMENT OUT TO SEE GOLD ON TOP OF TILES
      this.golds.push(gold);
    }

    // Skulls
    const skullsCount = sqrt;
    this.skulls = [];
    for (let i = 0; i < skullsCount; i++) {
      let index;
      do {
        index = Math.floor(Math.random() * this.numTiles);
      } while (this.goldIndices.includes(index) || this.diamondIndex === index || this.skullIndices.includes(index));
      this.skullIndices.push(index);
      const skull = Sprite.from('skull.png');
      skull.anchor.set(0.5);
      this.addChild(skull);
      
      // copy position & scale
      this.addChildAt(skull, this.getChildIndex(this.tiles[index]));  // COMMENT OUT TO SEE SKULL ON TOP OF TILES
      this.skulls.push(skull);
    }

    // 1/5 proabaility that a power up will be placed
    if (Math.random() < 0.2) {
      let index;
      do {
        index = Math.floor(Math.random() * this.numTiles);
      } while (this.goldIndices.includes(index) || this.diamondIndex === index || this.skullIndices.includes(index));
      this.powerUpIndex = index;
      
      // choose either betting-2.png, extra-life-2.png, or multiplier-2.png
      this.powerUpType = Math.random() < 0.33 ? 'betting' : (Math.random() < 0.5 ? 'extra-life' : 'multiplier');
      this.powerUp = Sprite.from(`${this.powerUpType}-2.png`);
      this.powerUp.anchor.set(0.5);
      this.addChild(this.powerUp);
      this.addChildAt(this.powerUp, this.getChildIndex(this.tiles[this.powerUpIndex]));
    }

    this.positionGems();
  }

  private positionGems() {
    // position the diamond, golds, skulls, and power-up in the center of their respective tiles
    const dT = this.tiles[this.diamondIndex];
    this.diamond.x = dT.x;
    this.diamond.y = dT.y;
    this.diamond.scale.set(dT.scale.x);

    this.golds.forEach((g, i) => {
      const t = this.tiles[this.goldIndices[i]];
      g.x = t.x;
      g.y = t.y;
      g.scale.set(t.scale.x);
    });

    this.skulls.forEach((s, i) => {
      const t = this.tiles[this.skullIndices[i]];
      s.x = t.x;
      s.y = t.y;
      s.scale.set(t.scale.x);
    });

    if (this.powerUp) {
      const t = this.tiles[this.powerUpIndex];
      this.powerUp.x = t.x;
      this.powerUp.y = t.y;
      this.powerUp.scale.set(t.scale.x + .12);
    }
  }

  private initScore() {
    // Gold Icon
    this.goldIcon = Sprite.from('gold.png');
    this.goldIcon.anchor.set(1, 0);  // right-top
    this.goldIcon.scale.set(0.1);  // scale down the icon
    this.addChild(this.goldIcon);

    // Gold Text
    const totalGolds = this.goldIndices.length;
    const goldCount = this.userTiles.filter(index => this.goldIndices.includes(index)).length;
    this.goldScore = new Text(
      `${goldCount}/${totalGolds}`,
      {
        fontFamily: 'Montserrat, sans-serif',
        fontSize: 28,
        fill: 0xffffff,
        stroke: 0x000000,
      }

    );
    this.goldScore.anchor.set(1, 0);
    this.addChild(this.goldScore);

    // Diamond Icon
    this.diamondIcon = Sprite.from('diamond.png');
    this.diamondIcon.anchor.set(1, 0);  // right-top
    this.diamondIcon.scale.set(0.09);  // scale down the icon
    this.addChild(this.diamondIcon);

    // Diamond Text
    const totalDiamonds = 1;
    const diamondCount = this.userTiles.filter(index => this.diamondIndex === index).length;
    this.diamondScore = new Text(
      `${diamondCount}/${totalDiamonds}`,
      {
        fontFamily: 'Montserrat, sans-serif',
        fontSize: 28,
        fill: 0xffffff,
        stroke: 0x000000,
      }
    );
    this.diamondScore.anchor.set(1, 0);
    this.addChild(this.diamondScore);

    // Death Icon
    this.deathIcon = Sprite.from('skull.png');
    this.deathIcon.anchor.set(1, 0);  // right-top
    this.deathIcon.scale.set(0.08);  // scale down the icon
    this.addChild(this.deathIcon);

    // Death Text
    const totalDeaths = this.skullIndices.length;
    const deathCount = this.userTiles.filter(index => this.skullIndices.includes(index)).length;
    this.deathScore = new Text(
      `${deathCount}/${totalDeaths}`,
      {
        fontFamily: 'Montserrat, sans-serif',
        fontSize: 28,
        fill: 0xffffff,
        stroke: 0x000000,
      }
    );
    this.deathScore.anchor.set(1, 0);
    this.addChild(this.deathScore);
  }

  private positionScore() {
    const rw = this.app.renderer.width;
    const margin = 20;

    // top-right corner for diamond icon
    this.diamondIcon.x = rw - margin + 2 ;
    this.diamondIcon.y = margin;

    // just to the left of the diamond icon, vertically centered
    this.diamondScore.x = this.diamondIcon.x - this.diamondIcon.width - 10;
    this.diamondScore.y = this.diamondIcon.y + (this.diamondIcon.height - this.diamondScore.height) / 2;

    // top-right corner for icon
    this.goldIcon.x = rw - margin;
    this.goldIcon.y = margin + 50;

    // just to the left of the icon, vertically centered
    this.goldScore.x = this.goldIcon.x - this.goldIcon.width - 10;
    this.goldScore.y = this.goldIcon.y + (this.goldIcon.height - this.goldScore.height) / 2;

    // top-right corner for death icon
    this.deathIcon.x = rw - margin;
    this.deathIcon.y = margin + 100; 

    // just to the left of the death icon, vertically centered
    this.deathScore.x = this.deathIcon.x - this.deathIcon.width - 10;
    this.deathScore.y = this.deathIcon.y + (this.deathIcon.height - this.deathScore.height) / 2;
  }

  private updateVisualScore() {
    // update the gold score text
    const goldCount = this.userTiles.filter(index => this.goldIndices.includes(index)).length;
    this.goldScore.text = `${goldCount}/${this.goldIndices.length}`;

    // update the diamond score text
    const diamondCount = this.userTiles.filter(index => this.diamondIndex === index).length;
    this.diamondScore.text = `${diamondCount}/${1}`;

    // update the death score text
    const deathCount = this.userTiles.filter(index => this.skullIndices.includes(index)).length;
    this.deathScore.text = `${deathCount}/${this.skullIndices.length}`;

    // position the score elements
    this.positionScore();
  }

  private tilePopAnimation(tile: Sprite) {
    // Initial “pop” velocities:
    let vy = -15;                   // upward kick (px per tick)
    let vx = (Math.random() - 0.5) * 10;  // slight random left/right (px per tick)
    const gravity = 1;              // gravity accel (px per tick²)

    const arc = (ticker: Ticker) => {
      const dt = ticker.deltaTime;
      vy += gravity * dt;
      tile.x += vx * dt;
      tile.y += vy * dt;

      // once it falls off the bottom, stop animating and remove
      if (tile.y - tile.height / 2 > this.app.renderer.height) {
        this.app.ticker.remove(arc, this);
        this.removeChild(tile);
      }
    };

    this.app.ticker.add(arc, this);
  }


  private chosenTile(tile: Sprite) {
    // On first interaction with a tile, remove the powerup menu if present
    if (this.powerupMenu) {
      this.powerupMenu.cleanup();
      this.powerupMenu = undefined;
    }

    const tileIndex = this.tiles.indexOf(tile);
    
    // add the tile to the user's tiles
    if (!this.userTiles.includes(tileIndex)) {
      this.userTiles.push(tileIndex);
    }

    this.updateVisualScore();

    // disable interaction for the tile
    tile.interactive = false;
    (tile as any).buttonMode = false;

    this.tilePopAnimation(tile);

    // update user powerups
    if(this.powerUpIndex === tileIndex) {
      console.log('You found a power-up!');
      if (this.powerUpType === 'multiplier') {
        updateUserPowerups(this.userId, 'multiplier', 1); 
      } else if (this.powerUpType === 'extra-life') {
        updateUserPowerups(this.userId, 'extra-life', 1);
      } else if (this.powerUpType === 'betting') {
        updateUserPowerups(this.userId, 'betting', 1);
      }
    }
    
    this.checkGameEnd();
  }

  private checkGameEnd() {
    // if all skull indicies are in userTiles, end the game
    if (this.skullIndices.every(index => this.userTiles.includes(index))) {
      console.log('Game Over! You found all the skulls!');
      this.tiles.forEach(t => {
        t.interactive = false;
        (t as any).buttonMode = false;
      });
      this.gameWon = false;
      this.endOverlay();
    }

    // if all gold indicies and diamond index are in userTiles, end the game
    if (this.goldIndices.every(index => this.userTiles.includes(index)) && this.userTiles.includes(this.diamondIndex)) {
      console.log('You found all the golds and the diamond! You win!');
      this.tiles.forEach(t => {
        t.interactive = false;
        (t as any).buttonMode = false;
      });
      this.gameWon = true;
      this.endOverlay();
    }
  }

  private async endOverlay() {
    // Calculate total winnings before updating rubies
    const baseWin = this.currentBet;
    const extraWin = (this.gameWon && this.multiplierActive) ? baseWin : 0; // double winnings if multiplier
    const betWin = (this.gameWon && this.bettingActive && this.bettingAmount > 0) ? (5 * this.bettingAmount) : 0;
    const totalWin = this.gameWon ? (baseWin + extraWin + betWin) : 0;

    // update user rubies
    await this.updateUserRubies(); 

    // Create end overlay
    this.startScreen = new Container();
    this.startScreen.eventMode = 'static';

    // Dim background
    this.startBackground = new Graphics();
    this.startScreen.addChild(this.startBackground);

    // Result text
    this.startText = new Text(
      this.gameWon ? 
        `You win ${totalWin} rubies!` : `You Lose ${this.currentBet} rubies!`, {
      fontFamily: 'Montserrat, sans-serif',
      fontSize: 28,
      stroke: 0x000000,
      fill: this.gameWon ? 0x57bdf5 : 0xff0000,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: this.app.renderer.width * 0.8
    });
    this.startScreen.addChild(this.startText);
    this.addChild(this.startScreen);
    
    this.positionOverlay();

    // Show result for 3 seconds then return to map
    setTimeout(() => {
      this.onReturnToMap();
    }, 3000);
  }

  public async updateUserRubies() {
    // Base bet outcome
    let delta = this.gameWon ? this.currentBet : -this.currentBet;

    // Betting powerup: bet amount already deducted upfront in the menu
    // If win: credit +6× bet (net +5× after upfront deduction). If lose: no additional delta.
    if (this.bettingActive && this.bettingAmount > 0) {
      if (this.gameWon) {
        delta += 6 * this.bettingAmount;
      }
    }

    // Multiplier doubles winnings only (no effect on losses)
    if (this.gameWon && this.multiplierActive && delta > 0) {
      delta *= 2;
    }

    await updateUserRubies(this.userId, delta);
  }

  public resize() {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.positionBackground();
    this.positionOverlay();
    this.positionTitle();
    this.positionGameBoard();
    this.positionTiles();
    this.positionGems();
    this.positionScore();
    if (this.powerupMenu) this.powerupMenu.resize();
  }
}
