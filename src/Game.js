import KeyHandler from './KeyHandler';
import GameMap from './map/GameMap';
import { Base } from './player/Base';
import Tank from './player/Tank';
import Render from './Render';
import Viewport from './Viewport';
import StatsDisplay from './StatsDisplay';
import { delay } from './Helpers';

import connectionHandler from './ConnectionHandler';
import Overlay from './Overlay';
import ChatLog from './ChatLog';

const blueTankColors = [5, 4, 12, 6];
const greenTankColors = [8, 7, 13, 9];

// FFA tank colors - 6 distinct color sets for free-for-all mode
// Format: [body, tracks, base, barrel]
const FFA_TANK_COLORS = [
  [5, 4, 12, 6],    // Blue
  [8, 7, 13, 9],    // Green
  [15, 14, 26, 16], // Orange
  [18, 17, 27, 19], // Purple
  [21, 20, 28, 22], // Cyan
  [24, 23, 29, 25], // Pink
];

// CSS color names for event log display
const FFA_COLOR_NAMES = ['#6688ff', '#66cc66', '#ff9944', '#bb66dd', '#44dddd', '#ff88cc'];
const TEAM_COLOR_NAMES = { 0: '#6688ff', 1: '#66cc66' }; // Blue, Green

export default class Game {
  constructor(seed, playersData, activePlayerNumber, gameMode = '1v1', teams = { 0: [0], 1: [1] }, options = {}, isFFA = false) {
    this.pausedState = {};
    this.paused = false;
    this.currentRound = 1;
    this.isRoundSwitching = false;
    this.isGameloopSuspended = false;
    this.playerNumber = activePlayerNumber;

    // Spectator mode (for FFA when player dies)
    this.isSpectating = false;
    this.spectatingPlayerIndex = 0; // Index into allTanks for cycling views
    this.spectatingPlayer = null; // The tank we're currently spectating
    this.gameMode = gameMode;
    this.teams = teams;
    this.isFFA = isFFA;

    // Game options with defaults
    this.options = {
      minimap: options.minimap !== undefined ? options.minimap : true,
      friendlyFire: options.friendlyFire !== undefined ? options.friendlyFire : true,
      maxPoints: options.maxPoints || 5,
      gameType: options.gameType || 'elimination', // elimination, capture, deathmatch
    };

    this.maxPoints = this.options.maxPoints;
    // For elimination mode, maxRounds = maxPoints. For other modes, rounds are continuous.
    this.maxRounds = this.options.gameType === 'elimination' ? this.options.maxPoints : 999;

    // Store player data for usernames
    this.playersData = playersData;

    // Player scores for FFA deathmatch (per-player scoring)
    this.playerScores = {};
    // Track player connection status
    this.playerConnected = {};
    Object.keys(playersData).forEach(pN => {
      this.playerScores[pN] = 0;
      this.playerConnected[pN] = true; // All players start as connected
    });

    if (this.isFFA) {
      // FFA mode: each player is their own "team", everyone else is an enemy
      this.playerTeam = activePlayerNumber; // In FFA, team = player number
      this.enemyTeam = null; // No single enemy team in FFA
      this.teammateNumbers = []; // No teammates in FFA
      this.enemyNumbers = Object.keys(playersData)
        .map(Number)
        .filter(n => n !== activePlayerNumber);

      // Assign colors based on player order
      const playerNumbers = Object.keys(playersData).map(Number).sort((a, b) => a - b);
      this.ffaColorMap = {};
      playerNumbers.forEach((pN, index) => {
        this.ffaColorMap[pN] = FFA_TANK_COLORS[index % FFA_TANK_COLORS.length];
      });

      this.playerTankColors = this.ffaColorMap[activePlayerNumber];
    } else {
      // Team mode: traditional blue vs green
      this.playerTeam = playersData[activePlayerNumber].team;
      this.enemyTeam = this.playerTeam === 0 ? 1 : 0;
      this.teammateNumbers = teams[this.playerTeam].filter(n => n !== activePlayerNumber);
      this.enemyNumbers = teams[this.enemyTeam];
      this.playerTankColors = this.playerTeam === 0 ? blueTankColors : greenTankColors;
      this.enemyTankColors = this.playerTeam === 0 ? greenTankColors : blueTankColors;
    }

    this.overlay = new Overlay(
      'A player has minimized the game. Please wait till they open the window again.'
    );
    this.midRoundOverlay = new Overlay();
    this.finalOverlay = new Overlay();

    // Chat/Event log
    const playerData = playersData[activePlayerNumber];
    this.chatLog = new ChatLog({
      isSpectator: false,
      playerTeam: playerData.team,
      playerNumber: activePlayerNumber,
      isFFA: isFFA,
      username: playerData.username || `Player ${activePlayerNumber}`,
    });

    this.fps = 18;
    this.fpsInterval = 1000 / this.fps;
    this.prevFrameTime = Date.now();
    this.statsDisplay = new StatsDisplay();
    this.coordsDisplay = this.createCoordsDisplay();
    this.gameHUD = this.createGameHUD();
    this.gameMap = new GameMap(1200, 600, seed);
    this.viewport = new Viewport(this.gameMap);
    this.renderer = new Render(this.viewport);
    this.teamScores = { 0: 0, 1: 0 }; // Team scores

    // Create the local player tank
    this.player = new Tank(
      true,
      playersData[activePlayerNumber].x,
      playersData[activePlayerNumber].y,
      3,
      this.gameMap,
      ...this.playerTankColors,
      this.playerNumber
    );

    // Create all other tanks (teammates and enemies)
    this.tanks = { [activePlayerNumber]: this.player };
    this.teammates = [];
    this.enemies = [];

    // Create teammate tanks (same team, controlled by network) - only in team mode
    this.teammateNumbers.forEach(playerNum => {
      const tank = new Tank(
        false,
        playersData[playerNum].x,
        playersData[playerNum].y,
        3,
        this.gameMap,
        ...this.playerTankColors,
        playerNum
      );
      this.tanks[playerNum] = tank;
      this.teammates.push(tank);
    });

    // Create enemy tanks
    this.enemyNumbers.forEach(playerNum => {
      // In FFA mode, use each player's assigned color from the color map
      const enemyColors = this.isFFA
        ? this.ffaColorMap[playerNum]
        : this.enemyTankColors;

      const tank = new Tank(
        false,
        playersData[playerNum].x,
        playersData[playerNum].y,
        3,
        this.gameMap,
        ...enemyColors,
        playerNum
      );
      this.tanks[playerNum] = tank;
      this.enemies.push(tank);
    });

    // Legacy support: keep this.enemy pointing to first enemy for 1v1 compatibility
    this.enemy = this.enemies[0];

    // All tanks array for iteration
    this.allTanks = Object.values(this.tanks);

    // Collect all bases
    this.bases = this.allTanks.map(tank => tank.base);

    // Add all tanks and bases to the game map
    this.allTanks.forEach((tank) => {
      this.gameMap.addTank(tank);
      this.gameMap.addBase(tank.base);
    });

    connectionHandler.socket.on('stateUpdate', (data) => {
      // Update all network-controlled tanks (teammates + enemies)
      Object.keys(data).forEach(playerNum => {
        const num = parseInt(playerNum);
        if (num !== activePlayerNumber && this.tanks[num]) {
          this.tanks[num].updateState(data[num]);
        }
      });
    });

    connectionHandler.socket.on('pausedUpdate', (data) => {
      if (data) {
        this.pausedState = data;
      }
    });

    // Listen for tile clears from other clients
    connectionHandler.socket.on('tilesCleared', (tiles) => {
      this.gameMap.applyNetworkTileClears(tiles);
    });

    // Listen for score updates from other clients
    connectionHandler.socket.on('scoreUpdate', ({ team, score, playerNumber, playerScore }) => {
      if (this.isFFA && playerNumber !== undefined) {
        // FFA mode: individual player scores
        this.playerScores[playerNumber] = playerScore;
      } else {
        // Team mode: team scores
        this.teamScores[team] = score;
      }
    });

    // Listen for nextRound from other clients (when they trigger a round end)
    connectionHandler.socket.on('nextRound', (data) => {
      this.handleRemoteNextRound(data);
    });

    // Listen for player disconnections
    connectionHandler.socket.on('playerDisconnected', ({ playerNumber }) => {
      this.playerConnected[playerNumber] = false;
      // Log disconnect event
      const playerName = this.playersData[playerNumber]?.username || `Player ${playerNumber}`;
      this.chatLog.logEvent(`${playerName} disconnected`, 'rgba(150, 80, 80, 0.7)');
    });

    // Set up minimap with team info
    this.renderer.teammates = this.teammates;
    this.renderer.playerTeam = this.playerTeam;
    this.renderer.minimapEnabled = this.options.minimap;

    // Pass friendly fire option to game map for projectile collision
    this.gameMap.friendlyFire = this.options.friendlyFire;
    this.gameMap.playerTeam = this.playerTeam;
    this.gameMap.teams = this.teams;
    this.gameMap.localPlayerNumber = activePlayerNumber;
    this.gameMap.isFFA = this.isFFA;

    this.init();
    this.gameLoop();
  }

  init() {
    window.addEventListener('blur', this.handleFocusLost.bind(this));
    window.addEventListener('focus', this.handleFocus.bind(this));
  }

  createCoordsDisplay() {
    const div = document.createElement('div');
    div.id = 'coords-display';
    div.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      padding: 4px 8px;
      font-family: monospace;
      font-size: 14px;
      border-radius: 4px;
      z-index: 100;
    `;
    document.body.appendChild(div);
    return div;
  }

  updateCoordsDisplay(x, y) {
    if (this.coordsDisplay) {
      this.coordsDisplay.textContent = `X: ${Math.round(x)}  Y: ${Math.round(y)}`;
    }
  }

  createGameHUD() {
    // Only show HUD for team games with more than 1 teammate
    const showTeammates = !this.isFFA && this.teammateNumbers.length > 0;

    const container = document.createElement('div');
    container.id = 'game-hud';
    container.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100;
    `;

    // Fullscreen button
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.id = 'fullscreen-btn';
    fullscreenBtn.textContent = 'Fullscreen';
    fullscreenBtn.style.cssText = `
      padding: 6px 12px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    container.appendChild(fullscreenBtn);

    // Score display (for non-1v1 games)
    if (this.gameMode !== '1v1') {
      const scoreDiv = document.createElement('div');
      scoreDiv.id = 'score-display';
      scoreDiv.style.cssText = `
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        padding: 8px 12px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 14px;
        text-align: center;
      `;
      container.appendChild(scoreDiv);
    }

    // Team list (only for team games with teammates)
    if (showTeammates) {
      const teamDiv = document.createElement('div');
      teamDiv.id = 'team-list';
      teamDiv.style.cssText = `
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
      `;

      const teamHeader = document.createElement('div');
      teamHeader.style.cssText = `
        font-weight: bold;
        margin-bottom: 6px;
        color: ${this.playerTeam === 0 ? '#6af' : '#6f6'};
      `;
      teamHeader.textContent = 'Your Team';
      teamDiv.appendChild(teamHeader);

      const playerList = document.createElement('div');
      playerList.id = 'team-player-list';
      teamDiv.appendChild(playerList);

      container.appendChild(teamDiv);
    }

    document.body.appendChild(container);
    return container;
  }

  updateGameHUD() {
    // Update score display
    const scoreDiv = document.getElementById('score-display');
    if (scoreDiv) {
      if (this.isFFA) {
        // FFA: show all players with scores and connection status
        const sorted = Object.entries(this.playerScores)
          .map(([pN, score]) => ({ pN: parseInt(pN), score }))
          .sort((a, b) => b.score - a.score);
        const lines = sorted.map(p => {
          const name = this.playersData[p.pN]?.username || `P${p.pN}`;
          const isYou = p.pN === this.playerNumber ? ' (You)' : '';
          const isConnected = this.playerConnected[p.pN];
          const tank = this.tanks[p.pN];
          const isDead = tank?.isDead;

          // Status icon: disconnected > dead > alive
          let statusIcon, statusColor;
          if (!isConnected) {
            statusIcon = 'DC';
            statusColor = '#888';
          } else if (isDead) {
            statusIcon = 'X';
            statusColor = '#f66';
          } else {
            statusIcon = 'O';
            statusColor = '#6f6';
          }

          const nameStyle = !isConnected ? 'color: #666; text-decoration: line-through;' : '';
          return `<div><span style="color:${statusColor}">${statusIcon}</span> <span style="${nameStyle}">${name}${isYou}</span>: ${p.score}</div>`;
        });
        scoreDiv.innerHTML = lines.join('');
      } else {
        // Team game: show team scores
        const blueScore = this.teamScores[0];
        const greenScore = this.teamScores[1];
        scoreDiv.innerHTML = `<span style="color:#6af">Blue: ${blueScore}</span> - <span style="color:#6f6">Green: ${greenScore}</span>`;
      }
    }

    // Update team list
    const playerList = document.getElementById('team-player-list');
    if (playerList && !this.isFFA) {
      // Include self + teammates
      const allTeammates = [this.playerNumber, ...this.teammateNumbers];
      const lines = allTeammates.map(pN => {
        const tank = this.tanks[pN];
        const name = this.playersData[pN]?.username || `P${pN}`;
        const isYou = pN === this.playerNumber ? ' (You)' : '';
        const isConnected = this.playerConnected[pN];

        // Status icon: disconnected > dead > alive
        let status, statusColor;
        if (!isConnected) {
          status = 'DC';
          statusColor = '#888';
        } else if (tank?.isDead) {
          status = 'X';
          statusColor = '#f66';
        } else {
          status = 'O';
          statusColor = '#6f6';
        }

        const nameStyle = !isConnected ? 'color: #666; text-decoration: line-through;' : '';
        return `<div><span style="color:${statusColor}">${status}</span> <span style="${nameStyle}">${name}${isYou}</span></div>`;
      });
      playerList.innerHTML = lines.join('');
    }
  }

  toggleFullscreen() {
    const gameCanvas = document.getElementById('gamecanvas');
    const statsCanvas = document.getElementById('gamestats');

    if (!document.fullscreenElement) {
      // Create a wrapper for fullscreen
      let wrapper = document.getElementById('fullscreen-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'fullscreen-wrapper';
        wrapper.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #000;
          width: 100%;
          height: 100%;
        `;
        gameCanvas.parentNode.insertBefore(wrapper, gameCanvas);
        wrapper.appendChild(gameCanvas);
        wrapper.appendChild(statsCanvas);
      }
      wrapper.requestFullscreen().catch(err => {
        console.log('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  isAnyPaused() {
    const objectKeys = Object.keys(this.pausedState);
    if (objectKeys.length === 0) return false;
    return objectKeys.some((key) => this.pausedState[key] === true);
  }

  handleFocusLost() {
    connectionHandler.updatePausedState({ paused: true, playerNumber: this.playerNumber });
  }
  handleFocus() {
    connectionHandler.updatePausedState({ paused: false, playerNumber: this.playerNumber });
  }

  isInBase(tank, tankTeam = null) {
    const team = tankTeam !== null ? tankTeam : this.playerTeam;
    for (let i = 0; i < this.allTanks.length; i++) {
      const otherTank = this.allTanks[i];
      const base = otherTank.base;
      if (tank.x >= base.x && tank.x < base.x + base.width - tank.width) {
        // assumes that tank is square
        if (tank.y >= base.y && tank.y <= base.y + base.height - tank.width) {
          // assumes that tank is square
          // Return the team of the base owner (0 = blue team, 1 = green team)
          const baseOwnerTeam = this.teams[0].includes(otherTank.playerNumber) ? 0 : 1;
          return { inBase: true, isOwnTeam: baseOwnerTeam === team, baseOwnerTeam };
        }
      }
    }
    return { inBase: false, isOwnTeam: false, baseOwnerTeam: null };
  }

  // Spectator mode methods
  enterSpectatorMode() {
    if (this.isSpectating) return;
    this.isSpectating = true;
    this.renderer.setMapMode();
    this.spectatorOverlay = new Overlay('You died! Press LEFT/RIGHT to spectate other players');
    this.spectatorOverlay.show();

    // Set up spectator controls
    this.spectatorKeyHandler = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.spectateNextPlayer(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.spectateNextPlayer(1);
      }
    };
    window.addEventListener('keydown', this.spectatorKeyHandler);
  }

  exitSpectatorMode() {
    if (!this.isSpectating) return;
    this.isSpectating = false;
    this.spectatingPlayer = null;
    if (this.spectatorOverlay) {
      this.spectatorOverlay.hide();
    }
    if (this.spectatorKeyHandler) {
      window.removeEventListener('keydown', this.spectatorKeyHandler);
    }
    this.renderer.setNormalMode();
    this.renderer.showMap = false;
    this.renderer.isMapRendered = false;
  }

  spectateNextPlayer(direction) {
    const alivePlayers = this.allTanks.filter(t => !t.isDead && t.playerNumber !== this.playerNumber);
    if (alivePlayers.length === 0) {
      this.spectatingPlayer = null;
      this.spectatorOverlay.setText('No players left to spectate');
      return;
    }

    if (this.spectatingPlayer === null) {
      this.spectatingPlayerIndex = 0;
    } else {
      this.spectatingPlayerIndex = (this.spectatingPlayerIndex + direction + alivePlayers.length) % alivePlayers.length;
    }

    this.spectatingPlayer = alivePlayers[this.spectatingPlayerIndex];
    this.spectatorOverlay.setText(`Spectating Player ${this.spectatingPlayer.playerNumber} (${this.spectatingPlayerIndex + 1}/${alivePlayers.length})`);

    // Switch to following this player's view
    this.renderer.showMap = false;
    this.renderer.isMapRendered = false;
    this.renderer.setNormalMode();
  }

  // Check if any tank on a team is in the enemy's base (for capture mode)
  isTeamCapturingEnemyBase(team) {
    const teamPlayerNumbers = this.teams[team];
    const enemyTeam = team === 0 ? 1 : 0;
    for (const playerNum of teamPlayerNumbers) {
      const tank = this.tanks[playerNum];
      if (!tank.isDead) {
        const baseStatus = this.isInBase(tank, team);
        if (baseStatus.inBase && baseStatus.baseOwnerTeam === enemyTeam) {
          return true;
        }
      }
    }
    return false;
  }

  async endGame() {
    this.isGameloopSuspended = true;
    this.exitSpectatorMode();
    this.renderer.setMapMode();
    this.renderer.render();

    let message;

    if (this.isFFA) {
      // FFA end game: show rankings with usernames
      const sortedScores = Object.entries(this.playerScores)
        .map(([pN, score]) => ({
          playerNumber: parseInt(pN),
          score,
          name: this.getPlayerUsername(pN)
        }))
        .sort((a, b) => b.score - a.score);

      const myRank = sortedScores.findIndex(p => p.playerNumber === this.playerNumber) + 1;

      const rankings = sortedScores
        .map((p, i) => `${i + 1}. ${p.name}: ${p.score} pts`)
        .join('\n');

      if (myRank === 1) {
        message = `Victory!\n\n${rankings}`;
      } else {
        message = `You finished #${myRank}\n\n${rankings}`;
      }
    } else {
      // Team game end
      const myTeamScore = this.teamScores[this.playerTeam];
      const enemyTeamScore = this.teamScores[this.enemyTeam];
      const myTeamName = this.playerTeam === 0 ? 'Blue' : 'Green';
      const enemyTeamName = this.playerTeam === 0 ? 'Green' : 'Blue';

      if (myTeamScore > enemyTeamScore) {
        message = `Victory!\n\n${myTeamName}: ${myTeamScore}\n${enemyTeamName}: ${enemyTeamScore}`;
      } else if (myTeamScore < enemyTeamScore) {
        message = `Defeat\n\n${myTeamName}: ${myTeamScore}\n${enemyTeamName}: ${enemyTeamScore}`;
      } else {
        message = `Draw!\n\n${myTeamName}: ${myTeamScore}\n${enemyTeamName}: ${enemyTeamScore}`;
      }
    }

    this.finalOverlay.setText(message);
    this.finalOverlay.addButton('Return to Lobby', () => {
      connectionHandler.socket.emit('returnToLobby');
    });
    this.finalOverlay.show();
  }

  // Check if any team has reached the winning score
  hasTeamWon() {
    if (this.isFFA) {
      return this.hasPlayerWon();
    }
    return this.teamScores[0] >= this.maxPoints || this.teamScores[1] >= this.maxPoints;
  }

  async endRound(message = null) {
    this.isRoundSwitching = true;
    connectionHandler.nextRound({ message });
    await this.performRoundReset(message);
  }

  // Handle nextRound event from another client (e.g., when they capture the flag)
  async handleRemoteNextRound(data = {}) {
    // Only process if we're not already switching rounds
    if (this.isRoundSwitching) return;
    await this.performRoundReset(data.message);
  }

  // Shared logic for resetting the round (used by both local and remote triggers)
  async performRoundReset(message = null) {
    this.isRoundSwitching = true;

    // Exit spectator mode if active
    this.exitSpectatorMode();

    // Reset all tanks
    this.allTanks.forEach(tank => tank.reset());

    // Check if game is over (in elimination mode, or if a team hit max points)
    const gameOver = this.options.gameType === 'elimination'
      ? this.currentRound === this.maxRounds
      : this.hasTeamWon();

    if (gameOver) {
      await this.endGame();
      return;
    }
    this.isGameloopSuspended = true;
    let counter = 3;

    // Build score text based on mode
    let scoreText;
    if (this.isFFA) {
      const sortedScores = Object.entries(this.playerScores)
        .map(([pN, score]) => ({ pN: parseInt(pN), score, name: this.getPlayerUsername(pN) }))
        .sort((a, b) => b.score - a.score);
      scoreText = sortedScores.map(p => `${p.name}: ${p.score}`).join(' | ');
    } else {
      scoreText = `Blue: ${this.teamScores[0]} - Green: ${this.teamScores[1]}`;
    }

    const roundMsg = message || `Round ${this.currentRound} complete`;
    this.midRoundOverlay.setText(`${roundMsg}\n${scoreText}\nNext round in ${counter}...`);
    this.midRoundOverlay.show();

    const countdown = () =>
      new Promise((resolve) => {
        const interval = setInterval(() => {
          counter -= 1;
          this.midRoundOverlay.setText(`${roundMsg}\n${scoreText}\nNext round in ${counter}...`);
          if (counter === 0) {
            resolve();
            clearInterval(interval);
          }
        }, 1000);
      });
    await countdown();
    this.midRoundOverlay.hide();
    this.currentRound++;
    this.isRoundSwitching = false;
    this.isGameloopSuspended = false;
  }

  // Check if an entire team is eliminated
  isTeamEliminated(teamNumber) {
    const teamPlayerNumbers = this.teams[teamNumber];
    if (!teamPlayerNumbers) return false;
    return teamPlayerNumbers.every(playerNum => this.tanks[playerNum].isDead);
  }

  isAnyTeamEliminated() {
    if (this.isFFA) {
      // In FFA, check if only one player remains alive
      return this.getAlivePlayersCount() <= 1;
    }
    return this.isTeamEliminated(0) || this.isTeamEliminated(1);
  }

  // FFA helper: count alive players
  getAlivePlayersCount() {
    return this.allTanks.filter(tank => !tank.isDead).length;
  }

  // FFA helper: get the last player standing (winner)
  getLastPlayerStanding() {
    const aliveTanks = this.allTanks.filter(tank => !tank.isDead);
    return aliveTanks.length === 1 ? aliveTanks[0] : null;
  }

  // FFA helper: check if a player has won (reached maxPoints)
  hasPlayerWon() {
    return Object.values(this.playerScores).some(score => score >= this.maxPoints);
  }

  // FFA helper: get the winner's player number
  getFFAWinner() {
    const entries = Object.entries(this.playerScores);
    const winner = entries.find(([pN, score]) => score >= this.maxPoints);
    return winner ? parseInt(winner[0]) : null;
  }

  // Legacy compatibility for 1v1
  isAnyTankDead() {
    return this.isAnyTeamEliminated();
  }

  // Get player username by player number
  getPlayerUsername(playerNumber) {
    const pNum = typeof playerNumber === 'string' ? parseInt(playerNumber) : playerNumber;
    return this.playersData[pNum]?.username || `Player ${pNum}`;
  }

  // Get player display color (CSS) by player number
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

  checkWinConditions(playerBaseStatus) {
    if (this.isRoundSwitching) return;

    const gameType = this.options.gameType;

    // FFA elimination: last player standing wins
    if (this.isFFA && gameType === 'elimination') {
      // Check for win by disconnect: only one connected player remains
      const connectedPlayers = this.allTanks.filter(t => this.playerConnected[t.playerNumber]);
      if (connectedPlayers.length === 1 && !this.isRoundSwitching) {
        this.isRoundSwitching = true;
        const winner = connectedPlayers[0];
        const winnerName = this.getPlayerUsername(winner.playerNumber);
        const winnerColor = this.getPlayerColor(winner.playerNumber);

        // Only the winner's client awards the point
        if (winner.playerNumber === this.playerNumber) {
          this.playerScores[winner.playerNumber] += 1;
          connectionHandler.emitPlayerScoreUpdate(winner.playerNumber, this.playerScores[winner.playerNumber]);
        }

        this.chatLog.logGameWin(winnerName, winnerColor, '(by disconnect)');

        // End the game immediately (not just the round)
        setTimeout(() => {
          this.endGame();
        }, 1500);
        return;
      }

      if (this.getAlivePlayersCount() <= 1) {
        this.isRoundSwitching = true;

        const winner = this.getLastPlayerStanding();
        if (winner) {
          const winnerName = this.getPlayerUsername(winner.playerNumber);
          const winnerColor = this.getPlayerColor(winner.playerNumber);

          // Only the winner's client awards the point to avoid double-counting
          if (winner.playerNumber === this.playerNumber) {
            this.playerScores[winner.playerNumber] += 1;
            connectionHandler.emitPlayerScoreUpdate(winner.playerNumber, this.playerScores[winner.playerNumber]);
          }

          // Log the round win
          this.chatLog.logRoundWin(winnerName, winnerColor);
        }

        setTimeout(() => {
          const winnerName = winner ? this.getPlayerUsername(winner.playerNumber) : null;
          this.endRound(winner ? `${winnerName} is the last one standing!` : 'Round over!');
        }, 1500);
      }
      return;
    }

    // FFA deathmatch: first to X kills wins
    if (this.isFFA && gameType === 'deathmatch') {
      // Check for win by disconnect: only one connected player remains
      const connectedPlayers = this.allTanks.filter(t => this.playerConnected[t.playerNumber]);
      if (connectedPlayers.length === 1 && !this.isRoundSwitching) {
        this.isRoundSwitching = true;
        const winner = connectedPlayers[0];
        const winnerName = this.getPlayerUsername(winner.playerNumber);
        const winnerColor = this.getPlayerColor(winner.playerNumber);

        // Only the winner's client awards the point
        if (winner.playerNumber === this.playerNumber) {
          this.playerScores[winner.playerNumber] += 1;
          connectionHandler.emitPlayerScoreUpdate(winner.playerNumber, this.playerScores[winner.playerNumber]);
        }

        this.chatLog.logGameWin(winnerName, winnerColor, '(by disconnect)');

        // End the game immediately (not just the round)
        setTimeout(() => {
          this.endGame();
        }, 1500);
        return;
      }

      // Check if any enemy died this frame
      this.enemies.forEach(enemy => {
        if (enemy.isDead && !enemy.deathCounted) {
          enemy.deathCounted = true;

          // Only award points if the enemy was connected (no points for killing DC'd players)
          if (this.playerConnected[enemy.playerNumber]) {
            this.playerScores[this.playerNumber] += 1;
            connectionHandler.emitPlayerScoreUpdate(this.playerNumber, this.playerScores[this.playerNumber]);

            // Log the kill
            const killerName = this.getPlayerUsername(this.playerNumber);
            const victimName = this.getPlayerUsername(enemy.playerNumber);
            const killerColor = this.getPlayerColor(this.playerNumber);
            const victimColor = this.getPlayerColor(enemy.playerNumber);
            this.chatLog.logKill(killerName, victimName, killerColor, victimColor);

            // Check if we won
            if (this.hasPlayerWon()) {
              this.isRoundSwitching = true;
              const winnerName = this.getPlayerUsername(this.playerNumber);
              setTimeout(() => {
                this.endRound(`${winnerName} wins!`);
              }, 1000);
            }
          } else {
            // Log disconnect kill (no points)
            const killerName = this.getPlayerUsername(this.playerNumber);
            const victimName = this.getPlayerUsername(enemy.playerNumber);
            const killerColor = this.getPlayerColor(this.playerNumber);
            const victimColor = this.getPlayerColor(enemy.playerNumber);
            this.chatLog.logEvent(`${killerName} eliminated disconnected ${victimName}`, 'rgba(100, 100, 100, 0.7)');
          }
        }
      });

      // Respawn dead players (including ourselves) - only respawn connected players
      this.allTanks.forEach(tank => {
        if (tank.isDead && !tank.respawnPending && !this.hasPlayerWon()) {
          // Only respawn connected players
          if (this.playerConnected[tank.playerNumber]) {
            tank.respawnPending = true;
            setTimeout(() => {
              tank.reset();
              tank.respawnPending = false;
            }, 1500);
          }
        }
      });
      return;
    }

    // Team-based modes below

    if (gameType === 'elimination') {
      // Original behavior: team elimination wins the round
      if (this.isAnyTeamEliminated()) {
        this.isRoundSwitching = true;

        // Only ONE player from winning team awards the point to avoid double-counting
        // Use the first player in the winning team's array
        if (this.isTeamEliminated(0)) {
          const winningTeamFirstPlayer = this.teams[1][0];
          if (this.playerNumber === winningTeamFirstPlayer) {
            this.teamScores[1] += 1;
            connectionHandler.emitScoreUpdate(1, this.teamScores[1]);
          }
          // Log team win
          this.chatLog.logTeamRoundWin('Green', TEAM_COLOR_NAMES[1]);
        }
        if (this.isTeamEliminated(1)) {
          const winningTeamFirstPlayer = this.teams[0][0];
          if (this.playerNumber === winningTeamFirstPlayer) {
            this.teamScores[0] += 1;
            connectionHandler.emitScoreUpdate(0, this.teamScores[0]);
          }
          // Log team win
          this.chatLog.logTeamRoundWin('Blue', TEAM_COLOR_NAMES[0]);
        }

        setTimeout(() => {
          this.endRound();
        }, 1500);
      }
    } else if (gameType === 'capture') {
      // Capture the flag: score when entering enemy base
      // Only the local player can trigger a capture (each client checks its own player)
      if (playerBaseStatus.inBase && !playerBaseStatus.isOwnTeam && !this.player.isDead) {
        // Player just captured enemy base!
        this.isRoundSwitching = true;
        this.teamScores[this.playerTeam] += 1;
        // Broadcast score to other clients
        connectionHandler.emitScoreUpdate(this.playerTeam, this.teamScores[this.playerTeam]);

        const playerName = this.getPlayerUsername(this.playerNumber);
        const playerColor = this.getPlayerColor(this.playerNumber);
        this.chatLog.logCapture(playerName, playerColor);

        const teamName = this.playerTeam === 0 ? 'Blue' : 'Green';
        setTimeout(() => {
          this.endRound(`${teamName} captured the flag!`);
        }, 1000);
      }

      // In capture mode, dead players just respawn - no round reset
      // Check each tank and respawn if dead
      this.allTanks.forEach(tank => {
        if (tank.isDead && !tank.respawnPending) {
          tank.respawnPending = true;
          setTimeout(() => {
            tank.reset();
            tank.respawnPending = false;
          }, 1500);
        }
      });
    } else if (gameType === 'deathmatch') {
      // Deathmatch: score when killing enemy, but don't end round
      // Individual kills are tracked - round resets when all of one team is dead

      // Check if any enemy died this frame (we track via wasDead flag)
      this.enemies.forEach(enemy => {
        if (enemy.isDead && !enemy.deathCounted) {
          enemy.deathCounted = true;

          // Only award points if the enemy was connected (no points for killing DC'd players)
          if (this.playerConnected[enemy.playerNumber]) {
            // Award point to our team (enemy died)
            this.teamScores[this.playerTeam] += 1;
            // Broadcast score to other clients
            connectionHandler.emitScoreUpdate(this.playerTeam, this.teamScores[this.playerTeam]);

            // Log the kill
            const killerName = this.getPlayerUsername(this.playerNumber);
            const victimName = this.getPlayerUsername(enemy.playerNumber);
            const killerColor = this.getPlayerColor(this.playerNumber);
            const victimColor = this.getPlayerColor(enemy.playerNumber);
            this.chatLog.logKill(killerName, victimName, killerColor, victimColor);

            // Check if game is won
            if (this.hasTeamWon()) {
              this.isRoundSwitching = true;
              setTimeout(() => {
                this.endRound();
              }, 1000);
            }
          } else {
            // Log disconnect kill (no points)
            const killerName = this.getPlayerUsername(this.playerNumber);
            const victimName = this.getPlayerUsername(enemy.playerNumber);
            this.chatLog.logEvent(`${killerName} eliminated disconnected ${victimName}`, 'rgba(100, 100, 100, 0.7)');
          }
        }
      });

      // Check if our player died
      if (this.player.isDead && !this.player.deathCounted) {
        this.player.deathCounted = true;
        this.teamScores[this.enemyTeam] += 1;
        // Broadcast score to other clients
        connectionHandler.emitScoreUpdate(this.enemyTeam, this.teamScores[this.enemyTeam]);

        // Log our death
        const myName = this.getPlayerUsername(this.playerNumber);
        const myColor = this.getPlayerColor(this.playerNumber);
        this.chatLog.logDeath(myName, myColor);

        if (this.hasTeamWon()) {
          this.isRoundSwitching = true;
          setTimeout(() => {
            this.endRound();
          }, 1000);
        }
      }

      // Reset round if all of one team is dead (respawn everyone)
      if (this.isAnyTeamEliminated() && !this.hasTeamWon()) {
        this.isRoundSwitching = true;
        setTimeout(() => {
          this.endRound('Respawning...');
        }, 1500);
      }
    }
  }

  shouldShowStatic() {
    if (this.player.energy < 20) {
      if (Math.random() * 20 > this.player.energy + 3) {
        this.renderer.showStatic = true;
        return;
      }
    }
    this.renderer.showStatic = false;
  }

  gameLoop() {
    window.requestAnimationFrame(this.gameLoop.bind(this));

    // Game no longer pauses for AFK players - tough luck!
    
    const now = Date.now();
    const elapsed = now - this.prevFrameTime;
    
    // --------------------------------
    if (elapsed > this.fpsInterval) {
      // fps limited gameloop starts here
      if(this.isGameloopSuspended) {
        // We need fresh network state for all network tanks
        [...this.teammates, ...this.enemies].forEach(tank => tank.update());
        return;
      };

      this.prevFrameTime = now - (elapsed % this.fpsInterval);

      const baseStatus = this.isInBase(this.player);
      this.player.isInAnyBase = baseStatus.inBase;

      //
      // recharging energy and shield
      //
      if (baseStatus.inBase) {
        if (baseStatus.isOwnTeam) {
          // Player in friendly base (own team) - full recharge
          this.player.receiveEnergy(0.7);
          this.player.receiveShield(0.35);
        } else {
          // Player in enemy base - only partial energy recharge
          this.player.receiveEnergy(0.27);
        }
      }

      //
      // Handle win conditions based on game type
      //
      this.checkWinConditions(baseStatus);

      // FFA spectator mode: enter when player dies in elimination mode
      if (this.isFFA && this.options.gameType === 'elimination' && this.player.isDead && !this.isSpectating && !this.isRoundSwitching) {
        this.enterSpectatorMode();
      }

      // Update local player
      this.player.update();
      this.shouldShowStatic();
      connectionHandler.updateGameState({ pN: this.playerNumber, ...this.player.getState() });

      // Mark area around player as explored for fog-of-war (for player's team only)
      this.gameMap.markAreaExploredByTeam(this.player.x + 3, this.player.y + 3, this.playerTeam, 12);

      // Update all network tanks (teammates and enemies)
      [...this.teammates, ...this.enemies].forEach(tank => tank.update());

      // Mark areas around teammates as explored too (same team)
      this.teammates.forEach(tank => {
        if (!tank.isDead) {
          this.gameMap.markAreaExploredByTeam(tank.x + 3, tank.y + 3, this.playerTeam, 12);
        }
      });

      this.gameMap.update();

      // Broadcast any tiles that were cleared this frame to other clients
      const clearedTiles = this.gameMap.getClearedTilesAndReset();
      connectionHandler.emitTilesCleared(clearedTiles);

      // Update viewport - follow spectated player if in spectator mode, otherwise follow local player
      const viewTarget = (this.isSpectating && this.spectatingPlayer) ? this.spectatingPlayer : this.player;
      this.viewport.update(
        viewTarget.x - this.viewport.width / 2,
        viewTarget.y - this.viewport.height / 2
      );
      this.renderer.render();
      if (this.options.minimap && !this.isSpectating) {
        this.renderer.renderMinimap(this.player.x, this.player.y);
      }
      this.statsDisplay.update(this.player.energy, this.player.shield);
      this.updateCoordsDisplay(this.player.x, this.player.y);
      this.updateGameHUD();
    }
  }
}
