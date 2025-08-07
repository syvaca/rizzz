import { Application, Assets, Container, Graphics, scaleModeToGlFilter, Sprite, Text, Ticker } from 'pixi.js';
import { updateUserRubies } from '../../../firebase';

export class GemHuntGame extends Container {

  // Start Overlay
  private startScreen!: Container;
  private startBackground!: Graphics;
  private startText!: Text;
  private startButton!: Sprite;
  private betText!: Text;
  private betSlider!: Graphics;
  private betSliderHandle!: Graphics;
  private betValue!: Text;
  private rubySprite!: Sprite;
  private currentBet: number = 1;

  // Game Set Up
  private background!: Sprite;
  private title!: Sprite;
  private gameBoard!: Sprite;
  private powerUps: Sprite[] = [];
  private tiles: Sprite[] = [];
  private numTiles: number = 25;

  // Gems
  private diamond!: Sprite;
  private diamondIndex!: number;
  private golds: Sprite[] = [];
  private goldIndices: number[] = [];
  private skulls: Sprite[] = [];
  private skullIndices: number[] = [];

  // User
  private userTiles: number[] = [];
  private score: number = 0;
  private gameWon: boolean = false;
  private activePowerUp: string | null = null;

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

    this.initBackground();
    this.initGameBoard();
    this.initPowerUps();
    this.initTiles();
    this.initGems();
    this.initScore();

    this.startOverlay();

    this.resize();


    window.addEventListener('resize', () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
      this.resize();
    });
  }

  // Show start of game overlay
  private startOverlay() {
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

    // Bet text
    this.betText = new Text('Double your rubies or lose them all', {
      fontFamily: 'Montserrat, sans-serif',
      fontSize: 20,
      stroke: 0x000000,
      fill: 0xffffff,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: this.app.renderer.width * 0.8
    });
    this.startScreen.addChild(this.betText);

    // Create slider
    this.createBetSlider();

    // Start button
    this.startButton = Sprite.from('play button.png');
    this.startButton.eventMode = 'static';
    this.startButton.cursor = 'pointer';
    this.startButton.on('pointerdown', () => {
      this.removeChild(this.startScreen);
    });
    this.startScreen.addChild(this.startButton);
    this.addChild(this.startScreen);
    
    this.positionOverlay();
  }

  private createBetSlider() {
    const sliderWidth = 200;
    const sliderHeight = 8;
    const handleSize = 20;

    // Slider track
    this.betSlider = new Graphics();
    this.betSlider.beginFill(0x666666);
    this.betSlider.drawRoundedRect(0, 0, sliderWidth, sliderHeight, 4);
    this.betSlider.endFill();
    this.betSlider.lineStyle(2, 0xffffff);
    this.betSlider.drawRoundedRect(0, 0, sliderWidth, sliderHeight, 4);
    this.startScreen.addChild(this.betSlider);

    // Slider handle
    this.betSliderHandle = new Graphics();
    this.betSliderHandle.beginFill(0xffffff);
    this.betSliderHandle.drawCircle(0, 0, handleSize / 2);
    this.betSliderHandle.endFill();
    this.betSliderHandle.lineStyle(2, 0x000000);
    this.betSliderHandle.drawCircle(0, 0, handleSize / 2);
    this.betSliderHandle.eventMode = 'static';
    this.betSliderHandle.cursor = 'pointer';
    this.startScreen.addChild(this.betSliderHandle);

    // Bet value text
    this.betValue = new Text('1', {
      fontFamily: 'Montserrat, sans-serif',
      fontSize: 18,
      fill: 0xffffff,
      stroke: 0x000000
    });
    this.startScreen.addChild(this.betValue);

    // Ruby sprite
    this.rubySprite = Sprite.from('ruby.png');
    this.rubySprite.scale.set(0.1);
    this.startScreen.addChild(this.rubySprite);

    // Set up slider interaction
    this.setupSliderInteraction();
  }

  private setupSliderInteraction() {
    let isDragging = false;
    let dragStartX = 0;
    let sliderStartX = 0;

    this.betSliderHandle.on('pointerdown', (event: any) => {
      isDragging = true;
      dragStartX = event.global.x;
      sliderStartX = this.betSliderHandle.x;
    });

    this.app.stage.on('pointermove', (event: any) => {
      if (!isDragging) return;

      const deltaX = event.global.x - dragStartX;
      let newX = sliderStartX + deltaX;
      
      // Constrain to slider bounds - use the actual slider position and width
      const sliderX = this.betSlider.x;
      const sliderWidth = 200; // sliderWidth
      const minX = sliderX;
      const maxX = sliderX + sliderWidth;
      newX = Math.max(minX, Math.min(maxX, newX));
      
      this.betSliderHandle.x = newX;
      
      // Update bet value (1-50) based on position within slider bounds
      const ratio = (newX - minX) / (maxX - minX);
      this.currentBet = Math.round(1 + ratio * 49); // 1 to 50
      this.betValue.text = this.currentBet.toString();
    });

    this.app.stage.on('pointerup', () => {
      isDragging = false;
    });
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

    // Position bet text
    this.betText.anchor.set(0.5);
    this.betText.style.wordWrapWidth = rw * 0.8;
    this.betText.x = rw / 2;
    this.betText.y = rh *3/4- 80;

    // Position slider
    this.betSlider.x = rw / 2 - 100; // Center the slider
    this.betSlider.y = rh *3/4 - 20;

    // Position slider handle - start at the beginning of the slider
    this.betSliderHandle.x = this.betSlider.x;
    this.betSliderHandle.y = this.betSlider.y + 4; // Center vertically on slider

    // Position bet value text
    this.betValue.anchor.set(0.5);
    this.betValue.x = rw / 2 + 120; // Right of slider
    this.betValue.y = rh *3/4 - 20;

    // Position ruby sprite
    this.rubySprite.anchor.set(0.5);
    this.rubySprite.x = rw / 2 + 150; // Right of bet value
    this.rubySprite.y = rh *3/4 - 20;

    // Position start button
    const scale = rw * 0.35 / this.startButton.texture.width;
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

  // Initialize the power-up sprites
  private initPowerUps() {
    this.powerUps = [];
    const powerUpSprites = [
      'powerup bomb.png',
      'powerup potion.png',
      'powerup shield.png'
    ];
    
    for (let i = 0; i < 3; i++) {
      const powerUp = Sprite.from(powerUpSprites[i]);
      this.addChild(powerUp);
      this.powerUps.push(powerUp);
      
      // Make bomb interactive (first power-up)
      if (i === 0) {
        powerUp.eventMode = 'static';
        powerUp.cursor = 'pointer';
        powerUp.on('pointerdown', () => {
          this.activateBomb();
      });
      }
    }
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

  private positionPowerUps() {
    const rw = this.app.renderer.width;
    const rh = this.app.renderer.height;
    
    // Position the power-ups under the gameboard
    const powerUpSpacing = rw / 6; // Divide screen into 6 sections, power-ups in positions 2, 3, 4
    const powerUpY = rh / 2 + this.gameBoard.height / 2 + 50; // 50px below the gameboard
    
    this.powerUps.forEach((powerUp, index) => {
      powerUp.anchor.set(0.5);
      powerUp.x = powerUpSpacing * (index + 2); // Positions at 2/6, 3/6, 4/6 of screen width (closer together)
      powerUp.y = powerUpY;
      
      // Scale the power-up appropriately
      const scale = Math.min(rw, rh) * 0.12 / powerUp.texture.width;
      powerUp.scale.set(scale);
    });
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
    this.positionGems();
  }

  private positionGems() {
    // position the diamond, golds, and skulls in the center of their respective tiles
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

  private updateScore() {
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

  private activateBomb() {
    this.activePowerUp = 'bomb';
    console.log('Bomb power-up activated! Click a tile to use it.');
  }

  private chosenTile(tile: Sprite) {
    const tileIndex = this.tiles.indexOf(tile);
    
    if (this.activePowerUp === 'bomb') {
      // Use bomb power-up
      this.useBombPowerUp(tileIndex);
      this.activePowerUp = null; // Reset power-up
      return;
    }

    // Normal tile selection
    this.selectTile(tile, tileIndex);
  }

  private useBombPowerUp(centerTileIndex: number) {
    const cols = Math.ceil(Math.sqrt(this.numTiles));
    const rows = Math.ceil(this.numTiles / cols);
    
    // Get adjacent tile indices (up, down, left, right)
    const adjacentIndices = [];
    const row = Math.floor(centerTileIndex / cols);
    const col = centerTileIndex % cols;
    
    // Check all 4 directions
    const directions = [
      [-1, 0], // up
      [1, 0],  // down
      [0, -1], // left
      [0, 1]   // right
    ];
    
    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      
      if (newRow >= 0 && newRow < rows && newCol >= 0 && newCol < cols) {
        const index = newRow * cols + newCol;
        if (index < this.numTiles) {
          adjacentIndices.push(index);
        }
      }
    }
    
    // Add center tile and all adjacent tiles
    const tilesToPop = [centerTileIndex, ...adjacentIndices];
    
    tilesToPop.forEach(index => {
      if (!this.userTiles.includes(index)) {
        this.userTiles.push(index);
        
        const tile = this.tiles[index];
        tile.interactive = false;
        (tile as any).buttonMode = false;
        this.tilePopAnimation(tile);
        
        // Only collect gems, not skulls
        if (index === this.diamondIndex) {
          console.log('Bomb found the diamond!');
          this.score += 500;
        }
        if (this.goldIndices.includes(index)) {
          console.log('Bomb found a gold!');
          this.score += 300;
        }
        // Skulls are not collected by bomb
      }
    });
    
    this.updateScore();
    this.checkGameEnd();
  }

  private selectTile(tile: Sprite, tileIndex: number) {
    // add the tile to the user's tiles
    if (!this.userTiles.includes(tileIndex)) {
      this.userTiles.push(tileIndex);
    }

    this.updateScore();

    // disable interaction for the tile
    tile.interactive = false;
    (tile as any).buttonMode = false;

    this.tilePopAnimation(tile);

    // check if the tile is the diamond, gold, or skull
    if (tileIndex === this.diamondIndex) {
      console.log('You found the diamond!');
      this.score += 500;
    }
    if (this.goldIndices.includes(tileIndex)) {
      console.log('You found a gold!');
      this.score += 300;
    }
    if (this.skullIndices.includes(tileIndex)) {
      console.log('You found a skull!');
      this.score -= 400;
    }

    console.log(`Current score: ${this.score}`);

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
        'You win ' + `${this.currentBet*2}` + ` rubies!`: 'You Lose ' + `${this.currentBet}` + ` rubies!`, {
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
    if (this.gameWon) {
      await updateUserRubies(this.userId, this.currentBet);
    } else {
      await updateUserRubies(this.userId, -this.currentBet);
    }
  }

  public resize() {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.positionBackground();
    this.positionOverlay();
    this.positionTitle();
    this.positionGameBoard();
    this.positionPowerUps();
    this.positionTiles();
    this.positionGems();
    this.positionScore();
  }
}
