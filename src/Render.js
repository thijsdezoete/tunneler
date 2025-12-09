import { median } from './Helpers';

// 0 === stone
// 1 && 2 === ground
// 3 === empty cell
// 4 === tank tracks blue
// 5 === tank body blue
// 6 === barel tank blue
// 7 === tank tracks green
// 8 === tank body green
// 9 === barel tank green
// 10 === projectile light
// 11 === projectile dark
// 12 === blue base
// 13 === green base

// prettier-ignore
const colors = [
  { r: 154, g: 154, b: 154 }, // stone
  { r: 186, g: 89, b: 4 }, // ground 1
  { r: 195, g: 121, b: 48 },// ground 2
  { r: 0, g: 0, b: 0 },// empty cell (black)
  { r: 0, g: 0, b: 182 }, // tank tracks blue
  { r: 44, g: 44, b: 255 }, // tank body blue
  { r: 243, g: 235, b: 28 }, // tank barrel blue
  { r: 0, g: 182, b: 0 }, // tank tracks green
  { r: 44, g: 255, b: 44 }, // tank body green
  { r: 243, g: 235, b: 28 }, // tank barrel green
  { r: 255, g: 52, b: 8 }, // projectile light
  { r: 186, g: 0, b: 0 }, // projectile dark
  { r: 44, g: 44, b: 255 }, // blue base 
  { r: 44, g: 255, b: 44 }, // green base 

];

export default class Render {
  constructor(viewport) {
    this.viewport = viewport;
    this.canvas = document.querySelector('#gamecanvas');
    this.canvas.width = viewport.width;
    this.canvas.height = viewport.height;
    this.canvas.style.width = '500px';
    this.ctx = this.canvas.getContext('2d');
    this.imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.pixels = this.imageData.data;
    this.showStatic = false;
    this.showMap = false;
    this.isMapRendered = false;
    this.resetRatios();
    this.init();
    this.initMinimap();
    // Teammates for minimap display (set by Game.js)
    this.teammates = [];
    this.playerTeam = 0;
  }

  initMinimap() {
    // Create minimap canvas
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.id = 'minimap';
    // Minimap size: scaled down version of map (1200x600 -> 150x75)
    this.minimapScale = 8;
    this.minimapCanvas.width = Math.floor(this.viewport.gameMap.width / this.minimapScale);
    this.minimapCanvas.height = Math.floor(this.viewport.gameMap.height / this.minimapScale);
    this.minimapCanvas.style.position = 'fixed';
    this.minimapCanvas.style.bottom = '10px';
    this.minimapCanvas.style.right = '10px';
    this.minimapCanvas.style.border = '2px solid #444';
    this.minimapCanvas.style.imageRendering = 'pixelated';
    this.minimapCanvas.style.backgroundColor = 'black';
    // Scale up for visibility
    this.minimapCanvas.style.width = `${this.minimapCanvas.width * 2}px`;
    this.minimapCanvas.style.height = `${this.minimapCanvas.height * 2}px`;
    document.body.appendChild(this.minimapCanvas);
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.minimapImageData = this.minimapCtx.getImageData(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
    this.minimapPixels = this.minimapImageData.data;
  }

  setMapMode() {
    // fit window size but keep aspect ratio
    this.canvas.height = window.innerHeight > this.viewport.gameMap.height ? this.viewport.gameMap.height : window.innerHeight;
    const width = this.canvas.height * this.viewport.gameMap.width / this.viewport.gameMap.height;
    if (width > window.innerWidth) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = this.canvas.width * this.viewport.gameMap.height / this.viewport.gameMap.width;
    } else {
      this.canvas.width = width;
    }

    this.canvas.style.width = '';
    this.resetRatios();
    this.imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.pixels = this.imageData.data;
    this.showMap = true;
  }
  
  setNormalMode() {
    this.canvas.width = viewport.width;
    this.canvas.height = viewport.height;
    this.canvas.style.width = '500px';
    this.resetRatios();
    this.ctx = this.canvas.getContext('2d');
    this.imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.pixels = this.imageData.data;
    this.isMapRendered = false;
  }
  
  resetRatios() {
    this.ratioX = this.viewport.gameMap.width / this.canvas.width;
    this.ratioY = this.viewport.gameMap.height / this.canvas.height;
  }

  init() {
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.backgroundColor = 'black';
  }

  getMapTile(x, y) {
    const finalX = (x) => Math.floor(x * this.ratioX);
    const finalY = (y) => Math.floor(y * this.ratioY);

    if (this.ratioX === 1 && this.ratioY === 1) {
      const tile =  this.viewport.gameMap.getTile(x,y);
      return tile
    }

    const tiles = [];

    for (let i = finalX(x - 1); i < finalX(x); i++) {
      for (let j = finalY(y - 1); j < finalY(y); j++) {
        tiles.push(this.viewport.gameMap.getTile(i, j));
      }
    }
    const calculateTile = () => {    
      const isBaseSomewhere = tiles.includes(12) ? 12 : tiles.includes(13) ? 13 : null;

      if (isBaseSomewhere) {
        return isBaseSomewhere;
      } else {
        return Math.floor(median(tiles));
      }
    };

    return calculateTile();
  }

  render() {
    if (this.showMap && this.isMapRendered) return;

    if (this.showMap) {
      this.setMapMode();
      for (let y = 0; y < this.canvas.height; y++) {
        for (let x = 0; x < this.canvas.width; x++) {
          const offset = y * this.canvas.width * 4 + x * 4;

          const currentTile = this.getMapTile(x, y);
          //const currentTile = this.viewport.gameMap.getTile(x,y)

          this.pixels[offset] = colors[currentTile].r;
          this.pixels[offset + 1] = colors[currentTile].g;
          this.pixels[offset + 2] = colors[currentTile].b;
          this.pixels[offset + 3] = 255;
        }
      }
      this.flushPixels();
      this.isMapRendered = true;
      return;
    }

    if (this.showStatic) {
      for (let i = 0; i < this.viewport.height * this.viewport.width; i++) {
        const offset = i * 4;
        this.pixels[offset] = Math.floor(Math.random() * 255);
        this.pixels[offset + 1] = Math.floor(Math.random() * 255);
        this.pixels[offset + 2] = Math.floor(Math.random() * 255);
        this.pixels[offset + 3] = Math.floor(Math.random() * 100) + 155;
      }
      this.flushPixels();
      return;
    }

    for (let y = 0; y < this.viewport.height; y++) {
      for (let x = 0; x < this.viewport.width; x++) {
        const offset = y * this.viewport.width * 4 + x * 4;
        const currentTile = this.viewport.getTile(x, y);

        this.pixels[offset] = colors[currentTile].r;
        this.pixels[offset + 1] = colors[currentTile].g;
        this.pixels[offset + 2] = colors[currentTile].b;
        this.pixels[offset + 3] = 255;
      }
    }
    this.flushPixels();
  }

  flushPixels() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  renderMinimap(playerX, playerY) {
    if (this.showMap) {
      // Hide minimap when showing full map
      this.minimapCanvas.style.display = 'none';
      return;
    }
    this.minimapCanvas.style.display = 'block';

    const scale = this.minimapScale;
    const mapWidth = this.minimapCanvas.width;
    const mapHeight = this.minimapCanvas.height;
    const gameMap = this.viewport.gameMap;

    // Fog of war color (dark gray - unexplored)
    const fogColor = { r: 30, g: 30, b: 30 };

    // Determine which tile codes belong to player's team
    const friendlyBaseTile = this.playerTeam === 0 ? 12 : 13;
    const enemyBaseTile = this.playerTeam === 0 ? 13 : 12;

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const offset = (y * mapWidth + x) * 4;
        const mapX = x * scale;
        const mapY = y * scale;

        // Check if this area has been explored by player's team
        const isExplored = gameMap.isExploredByTeam(mapX, mapY, this.playerTeam);

        let color;
        if (!isExplored) {
          // Fog of war - unexplored area
          color = fogColor;
        } else {
          const tile = gameMap.getTile(mapX, mapY);

          // Use simplified colors for minimap
          if (tile === 0) {
            color = { r: 100, g: 100, b: 100 }; // stone - gray
          } else if (tile === 1 || tile === 2) {
            color = { r: 80, g: 50, b: 20 }; // ground - dark brown
          } else if (tile === 3) {
            color = { r: 0, g: 0, b: 0 }; // empty/cleared - black
          } else if (tile === friendlyBaseTile) {
            color = this.playerTeam === 0
              ? { r: 0, g: 100, b: 255 }   // blue base
              : { r: 0, g: 255, b: 100 };  // green base
          } else if (tile === enemyBaseTile) {
            color = this.playerTeam === 0
              ? { r: 0, g: 100, b: 0 }     // enemy green base (dimmed)
              : { r: 0, g: 0, b: 100 };    // enemy blue base (dimmed)
          } else {
            color = { r: 0, g: 0, b: 0 };
          }
        }

        this.minimapPixels[offset] = color.r;
        this.minimapPixels[offset + 1] = color.g;
        this.minimapPixels[offset + 2] = color.b;
        this.minimapPixels[offset + 3] = 255;
      }
    }

    // Draw player position indicator (white dot)
    const playerMinimapX = Math.floor(playerX / scale);
    const playerMinimapY = Math.floor(playerY / scale);

    // Draw a 3x3 white square for player
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = playerMinimapX + dx;
        const py = playerMinimapY + dy;
        if (px >= 0 && px < mapWidth && py >= 0 && py < mapHeight) {
          const offset = (py * mapWidth + px) * 4;
          this.minimapPixels[offset] = 255;
          this.minimapPixels[offset + 1] = 255;
          this.minimapPixels[offset + 2] = 255;
          this.minimapPixels[offset + 3] = 255;
        }
      }
    }

    // Draw teammate positions (yellow dots)
    this.teammates.forEach(teammate => {
      if (teammate.isDead) return;
      const tmX = Math.floor(teammate.x / scale);
      const tmY = Math.floor(teammate.y / scale);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = tmX + dx;
          const py = tmY + dy;
          if (px >= 0 && px < mapWidth && py >= 0 && py < mapHeight) {
            const offset = (py * mapWidth + px) * 4;
            this.minimapPixels[offset] = 255;
            this.minimapPixels[offset + 1] = 255;
            this.minimapPixels[offset + 2] = 0;
            this.minimapPixels[offset + 3] = 255;
          }
        }
      }
    });

    this.minimapCtx.putImageData(this.minimapImageData, 0, 0);
  }
}
