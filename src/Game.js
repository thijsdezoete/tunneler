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

const blueTankColors = [5, 4, 12, 6];
const greenTankColors = [8, 7, 13, 9];

export default class Game {
  constructor(seed, playersData, activePlayerNumber, gameMode = '1v1', teams = { 0: [0], 1: [1] }, options = {}) {
    this.pausedState = {};
    this.paused = false;
    this.currentRound = 1;
    this.isRoundSwitching = false;
    this.isGameloopSuspended = false;
    this.playerNumber = activePlayerNumber;
    this.gameMode = gameMode;
    this.teams = teams;

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

    // Determine player's team (0 = blue, 1 = green)
    this.playerTeam = playersData[activePlayerNumber].team;
    this.enemyTeam = this.playerTeam === 0 ? 1 : 0;

    // Get all teammate and enemy player numbers
    this.teammateNumbers = teams[this.playerTeam].filter(n => n !== activePlayerNumber);
    this.enemyNumbers = teams[this.enemyTeam];

    this.playerTankColors = this.playerTeam === 0 ? blueTankColors : greenTankColors;
    this.enemyTankColors = this.playerTeam === 0 ? greenTankColors : blueTankColors;

    this.overlay = new Overlay(
      'A player has minimized the game. Please wait till they open the window again.'
    );
    this.midRoundOverlay = new Overlay();
    this.finalOverlay = new Overlay();

    this.fps = 18;
    this.fpsInterval = 1000 / this.fps;
    this.prevFrameTime = Date.now();
    this.statsDisplay = new StatsDisplay();
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

    // Create teammate tanks (same team, controlled by network)
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
      const tank = new Tank(
        false,
        playersData[playerNum].x,
        playersData[playerNum].y,
        3,
        this.gameMap,
        ...this.enemyTankColors,
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
    connectionHandler.socket.on('scoreUpdate', ({ team, score }) => {
      this.teamScores[team] = score;
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

    this.init();
    this.gameLoop();
  }

  init() {
    window.addEventListener('blur', this.handleFocusLost.bind(this));
    window.addEventListener('focus', this.handleFocus.bind(this));
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
    this.renderer.setMapMode();
    this.renderer.render();
    const myTeamScore = this.teamScores[this.playerTeam];
    const enemyTeamScore = this.teamScores[this.enemyTeam];
    let message = "It's a draw!";
    if (myTeamScore > enemyTeamScore) {
      message = `Your team won! Score: ${myTeamScore} - ${enemyTeamScore}`;
    } else if (myTeamScore < enemyTeamScore) {
      message = `Your team lost! Score: ${myTeamScore} - ${enemyTeamScore}`;
    }
    this.finalOverlay.setText(message);
    this.finalOverlay.show();
    await delay(5000);
    this.finalOverlay.hide();
  }

  // Check if any team has reached the winning score
  hasTeamWon() {
    return this.teamScores[0] >= this.maxPoints || this.teamScores[1] >= this.maxPoints;
  }

  async endRound(message = null) {
    connectionHandler.nextRound();
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
    const scoreText = `Blue: ${this.teamScores[0]} - Green: ${this.teamScores[1]}`;
    const roundMsg = message || `Round ${this.currentRound} over!`;
    this.midRoundOverlay.setText(`${roundMsg} ${scoreText}\nNext round in ${counter} seconds...`);
    this.midRoundOverlay.show();

    const countdown = () =>
      new Promise((resolve) => {
        const interval = setInterval(() => {
          counter -= 1;
          this.midRoundOverlay.setText(`${roundMsg} ${scoreText}\nNext round in ${counter} seconds...`);
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
    return teamPlayerNumbers.every(playerNum => this.tanks[playerNum].isDead);
  }

  isAnyTeamEliminated() {
    return this.isTeamEliminated(0) || this.isTeamEliminated(1);
  }

  // Legacy compatibility for 1v1
  isAnyTankDead() {
    return this.isAnyTeamEliminated();
  }

  checkWinConditions(playerBaseStatus) {
    if (this.isRoundSwitching) return;

    const gameType = this.options.gameType;

    if (gameType === 'elimination') {
      // Original behavior: team elimination wins the round
      if (this.isAnyTeamEliminated()) {
        this.isRoundSwitching = true;

        if (this.isTeamEliminated(0)) {
          this.teamScores[1] += 1;
          console.log('Team Green (1) wins the round!');
        }
        if (this.isTeamEliminated(1)) {
          this.teamScores[0] += 1;
          console.log('Team Blue (0) wins the round!');
        }

        console.log('Team scores:', this.teamScores);
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
        console.log(`Team ${this.playerTeam} captured the flag!`);

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
          // Award point to our team (enemy died)
          this.teamScores[this.playerTeam] += 1;
          // Broadcast score to other clients
          connectionHandler.emitScoreUpdate(this.playerTeam, this.teamScores[this.playerTeam]);
          console.log(`Kill! Team ${this.playerTeam} scores. Total: ${this.teamScores[this.playerTeam]}`);

          // Check if game is won
          if (this.hasTeamWon()) {
            this.isRoundSwitching = true;
            setTimeout(() => {
              this.endRound();
            }, 1000);
          }
        }
      });

      // Check if our player died
      if (this.player.isDead && !this.player.deathCounted) {
        this.player.deathCounted = true;
        this.teamScores[this.enemyTeam] += 1;
        // Broadcast score to other clients
        connectionHandler.emitScoreUpdate(this.enemyTeam, this.teamScores[this.enemyTeam]);
        console.log(`Death! Team ${this.enemyTeam} scores. Total: ${this.teamScores[this.enemyTeam]}`);

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

      this.viewport.update(
        this.player.x - this.viewport.width / 2,
        this.player.y - this.viewport.height / 2
      );
      this.renderer.render();
      if (this.options.minimap) {
        this.renderer.renderMinimap(this.player.x, this.player.y);
      }
      this.statsDisplay.update(this.player.energy, this.player.shield);
    }
  }
}
