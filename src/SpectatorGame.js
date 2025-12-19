import GameMap from './map/GameMap';
import Tank from './player/Tank';
import Render from './Render';
import Viewport from './Viewport';
import connectionHandler from './ConnectionHandler';
import ChatLog from './ChatLog';

const blueTankColors = [5, 4, 12, 6];
const greenTankColors = [8, 7, 13, 9];

// CSS color names for chat log display
const FFA_COLOR_NAMES = ['#6688ff', '#66cc66', '#ff9944', '#bb66dd', '#44dddd', '#ff88cc'];
const TEAM_COLOR_NAMES = { 0: '#6688ff', 1: '#66cc66' }; // Blue, Green

const FFA_TANK_COLORS = [
  [5, 4, 12, 6],    // Blue
  [8, 7, 13, 9],    // Green
  [15, 14, 26, 16], // Orange
  [18, 17, 27, 19], // Purple
  [21, 20, 28, 22], // Cyan
  [24, 23, 29, 25], // Pink
];

export default class SpectatorGame {
  constructor(seed, playersData, gameMode = '1v1', teams = { 0: [0], 1: [1] }, options = {}, isFFA = false, clearedTiles = [], currentState = {}) {
    this.playersData = playersData;
    this.gameMode = gameMode;
    this.teams = teams;
    this.isFFA = isFFA;
    this.options = options;
    this.destroyed = false;

    // Track player connection status
    this.playerConnected = {};
    Object.keys(playersData).forEach(pN => {
      this.playerConnected[pN] = true;
    });

    // Track scores for display
    this.playerScores = {};
    this.teamScores = { 0: 0, 1: 0 };
    Object.keys(playersData).forEach(pN => {
      this.playerScores[pN] = 0;
    });

    // Spectating state
    this.spectatingPlayerIndex = 0;
    this.spectatingPlayer = null;

    // Create game map
    this.gameMap = new GameMap(1200, 600, seed);

    // Apply accumulated cleared tiles from server (sync map state)
    if (clearedTiles && clearedTiles.length > 0) {
      this.gameMap.applyNetworkTileClears(clearedTiles);
    }

    this.viewport = new Viewport(this.gameMap);
    this.renderer = new Render(this.viewport);
    // Enable live map mode for continuous rendering (no caching)
    this.renderer.liveMapMode = true;

    // FFA color mapping
    if (this.isFFA) {
      const playerNumbers = Object.keys(playersData).map(Number).sort((a, b) => a - b);
      this.ffaColorMap = {};
      playerNumbers.forEach((pN, index) => {
        this.ffaColorMap[pN] = FFA_TANK_COLORS[index % FFA_TANK_COLORS.length];
      });
    }

    // Create all tanks (all network-controlled for spectator)
    this.tanks = {};
    this.allTanks = [];

    Object.keys(playersData).forEach(playerNum => {
      const pNum = parseInt(playerNum);
      const pData = playersData[playerNum];

      let tankColors;
      if (this.isFFA) {
        tankColors = this.ffaColorMap[pNum];
      } else {
        tankColors = pData.team === 0 ? blueTankColors : greenTankColors;
      }

      const tank = new Tank(
        false, // Not player-controlled
        pData.x,
        pData.y,
        3,
        this.gameMap,
        ...tankColors,
        pNum
      );
      this.tanks[pNum] = tank;
      this.allTanks.push(tank);
      this.gameMap.addTank(tank);
      this.gameMap.addBase(tank.base);
    });

    // Apply current player state (positions, direction, etc.) from server
    if (currentState && Object.keys(currentState).length > 0) {
      Object.keys(currentState).forEach(playerNum => {
        const num = parseInt(playerNum);
        if (this.tanks[num]) {
          this.tanks[num].updateState(currentState[num]);
          // Immediately dump state to apply position
          this.tanks[num].dumpState();
        }
      });
    }

    // Set initial spectating target
    if (this.allTanks.length > 0) {
      this.spectatingPlayer = this.allTanks[0];
    }

    // Create spectator HUD
    this.createSpectatorHUD();

    // Create chat log for spectators
    this.chatLog = new ChatLog({
      isSpectator: true,
      playerTeam: 0,
      playerNumber: -1,
      isFFA: isFFA,
      username: 'Spectator',
    });

    // Set up network listeners
    this.setupNetworkListeners();

    // Start in map mode
    this.renderer.setMapMode();

    // Game loop
    this.fps = 18;
    this.fpsInterval = 1000 / this.fps;
    this.prevFrameTime = Date.now();
    this.gameLoopId = requestAnimationFrame(this.gameLoop.bind(this));

    // Key handler for cycling views
    this.keyHandler = (e) => {
      if (e.key === 'Tab' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.spectateNextPlayer();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.spectatePrevPlayer();
      } else if (e.key === 'm' || e.key === 'M') {
        this.toggleMapMode();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  createSpectatorHUD() {
    const hud = document.createElement('div');
    hud.id = 'spectator-hud';
    hud.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(0, 0, 0, 0.7);
      padding: 10px 20px;
      border-radius: 8px;
      color: white;
      font-family: monospace;
      z-index: 100;
      text-align: center;
    `;
    hud.innerHTML = `
      <div style="font-size: 1.2rem; margin-bottom: 5px;">SPECTATING</div>
      <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin: 8px 0;">
        <button id="spectator-prev" style="padding: 5px 12px; cursor: pointer; font-size: 1rem;">&lt;</button>
        <div id="spectator-target" style="font-size: 1rem; min-width: 120px;"></div>
        <button id="spectator-next" style="padding: 5px 12px; cursor: pointer; font-size: 1rem;">&gt;</button>
      </div>
      <div style="margin-top: 8px;">
        <button id="spectator-map-toggle" style="padding: 5px 15px; cursor: pointer; font-size: 0.9rem;">Map View</button>
      </div>
      <div style="font-size: 0.75rem; margin-top: 8px; opacity: 0.6;">
        Keyboard: [TAB] or [Arrow Keys] cycle | [M] map
      </div>
    `;
    document.body.appendChild(hud);
    this.spectatorHUD = hud;

    // Add button click handlers
    document.getElementById('spectator-prev').addEventListener('click', () => this.spectatePrevPlayer());
    document.getElementById('spectator-next').addEventListener('click', () => this.spectateNextPlayer());
    document.getElementById('spectator-map-toggle').addEventListener('click', () => this.toggleMapMode());

    this.updateSpectatorHUD();
  }

  updateSpectatorHUD() {
    const targetEl = document.getElementById('spectator-target');
    if (targetEl && this.spectatingPlayer) {
      const playerNum = this.spectatingPlayer.playerNumber;
      const name = this.playersData[playerNum]?.username || `Player ${playerNum}`;
      targetEl.textContent = name;
    }
  }

  spectateNextPlayer() {
    const alivePlayers = this.allTanks.filter(t => !t.isDead);
    if (alivePlayers.length === 0) {
      this.renderer.setMapMode();
      this.updateMapToggleButton();
      return;
    }

    this.spectatingPlayerIndex = (this.spectatingPlayerIndex + 1) % alivePlayers.length;
    this.spectatingPlayer = alivePlayers[this.spectatingPlayerIndex];
    this.renderer.setNormalMode();
    this.updateSpectatorHUD();
    this.updateMapToggleButton();
  }

  spectatePrevPlayer() {
    const alivePlayers = this.allTanks.filter(t => !t.isDead);
    if (alivePlayers.length === 0) {
      this.renderer.setMapMode();
      this.updateMapToggleButton();
      return;
    }

    this.spectatingPlayerIndex = (this.spectatingPlayerIndex - 1 + alivePlayers.length) % alivePlayers.length;
    this.spectatingPlayer = alivePlayers[this.spectatingPlayerIndex];
    this.renderer.setNormalMode();
    this.updateSpectatorHUD();
    this.updateMapToggleButton();
  }

  toggleMapMode() {
    if (this.renderer.showMap) {
      this.renderer.setNormalMode();
    } else {
      this.renderer.setMapMode();
    }
    this.updateMapToggleButton();
  }

  updateMapToggleButton() {
    const btn = document.getElementById('spectator-map-toggle');
    if (btn) {
      btn.textContent = this.renderer.showMap ? 'Player View' : 'Map View';
    }
  }

  getPlayerUsername(playerNumber) {
    const pNum = typeof playerNumber === 'string' ? parseInt(playerNumber) : playerNumber;
    return this.playersData[pNum]?.username || `Player ${pNum}`;
  }

  getPlayerColor(playerNumber) {
    const pNum = typeof playerNumber === 'string' ? parseInt(playerNumber) : playerNumber;
    if (this.isFFA) {
      const playerNumbers = Object.keys(this.playersData).map(Number).sort((a, b) => a - b);
      const colorIndex = playerNumbers.indexOf(pNum);
      return FFA_COLOR_NAMES[colorIndex % FFA_COLOR_NAMES.length] || '#fff';
    } else {
      const team = this.playersData[pNum]?.team;
      return TEAM_COLOR_NAMES[team] || '#fff';
    }
  }

  setupNetworkListeners() {
    this.stateUpdateHandler = (data) => {
      Object.keys(data).forEach(playerNum => {
        const num = parseInt(playerNum);
        if (this.tanks[num]) {
          this.tanks[num].updateState(data[num]);
        }
      });
    };
    connectionHandler.socket.on('stateUpdate', this.stateUpdateHandler);

    this.tileClearedHandler = (tiles) => {
      this.gameMap.applyNetworkTileClears(tiles);
      // Invalidate map cache so it re-renders with new tiles
      this.renderer.isMapRendered = false;
    };
    connectionHandler.socket.on('tilesCleared', this.tileClearedHandler);

    // Listen for player disconnections
    this.disconnectHandler = ({ playerNumber }) => {
      this.playerConnected[playerNumber] = false;
      const playerName = this.playersData[playerNumber]?.username || `Player ${playerNumber}`;
      this.chatLog.logEvent(`${playerName} disconnected`, 'rgba(150, 80, 80, 0.7)');
    };
    connectionHandler.socket.on('playerDisconnected', this.disconnectHandler);

    // Listen for score updates to log kills/points
    this.scoreUpdateHandler = ({ team, score, playerNumber, playerScore }) => {
      if (this.isFFA && playerNumber !== undefined && playerScore !== undefined) {
        // FFA mode: individual player scored
        const oldScore = this.playerScores[playerNumber] || 0;
        if (playerScore > oldScore) {
          const scorerName = this.getPlayerUsername(playerNumber);
          const scorerColor = this.getPlayerColor(playerNumber);
          if (this.options.gameType === 'deathmatch') {
            // In deathmatch, a point means a kill
            this.chatLog.logScore(scorerName, playerScore, scorerColor);
          } else {
            // Elimination round win
            this.chatLog.logRoundWin(scorerName, scorerColor);
          }
        }
        this.playerScores[playerNumber] = playerScore;
      } else if (team !== undefined && score !== undefined) {
        // Team mode score update
        const oldScore = this.teamScores[team] || 0;
        if (score > oldScore) {
          const teamName = team === 0 ? 'Blue' : 'Green';
          const teamColor = TEAM_COLOR_NAMES[team];
          if (this.options.gameType === 'deathmatch') {
            this.chatLog.logEvent(`<span style="color: ${teamColor}">${teamName}</span> scored! (${score} pts)`, 'rgba(50, 150, 50, 0.7)');
          } else if (this.options.gameType === 'capture') {
            this.chatLog.logEvent(`<span style="color: ${teamColor}">${teamName}</span> captured the flag!`, 'rgba(50, 150, 50, 0.7)');
          } else {
            this.chatLog.logTeamRoundWin(teamName, teamColor);
          }
        }
        this.teamScores[team] = score;
      }
    };
    connectionHandler.socket.on('scoreUpdate', this.scoreUpdateHandler);

    // Listen for round/game end messages
    this.nextRoundHandler = (data) => {
      if (data && data.message) {
        this.chatLog.logEvent(data.message, 'rgba(100, 100, 150, 0.7)');
      }
    };
    connectionHandler.socket.on('nextRound', this.nextRoundHandler);
  }

  gameLoop() {
    if (this.destroyed) return;

    const now = Date.now();
    const elapsed = now - this.prevFrameTime;

    if (elapsed >= this.fpsInterval) {
      this.prevFrameTime = now;

      // Update all tanks
      this.allTanks.forEach(tank => {
        if (!tank.isDead) {
          tank.update();
        }
      });

      // Update game map (projectiles, etc.)
      this.gameMap.update();

      // Update viewport to follow spectated player
      if (this.spectatingPlayer && !this.renderer.showMap) {
        this.viewport.update(
          this.spectatingPlayer.x - this.viewport.width / 2,
          this.spectatingPlayer.y - this.viewport.height / 2
        );
      }

      // Render
      this.renderer.render();

      // Render spectator minimap (shows all players, no fog of war)
      this.renderer.renderSpectatorMinimap(this.allTanks, this.spectatingPlayer);
    }

    this.gameLoopId = requestAnimationFrame(this.gameLoop.bind(this));
  }

  destroy() {
    this.destroyed = true;

    if (this.gameLoopId) {
      cancelAnimationFrame(this.gameLoopId);
    }

    window.removeEventListener('keydown', this.keyHandler);

    connectionHandler.socket.off('stateUpdate', this.stateUpdateHandler);
    connectionHandler.socket.off('tilesCleared', this.tileClearedHandler);
    connectionHandler.socket.off('playerDisconnected', this.disconnectHandler);
    connectionHandler.socket.off('scoreUpdate', this.scoreUpdateHandler);
    connectionHandler.socket.off('nextRound', this.nextRoundHandler);

    if (this.spectatorHUD) {
      this.spectatorHUD.remove();
    }

    if (this.chatLog) {
      this.chatLog.destroy();
    }
  }
}
