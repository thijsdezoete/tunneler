const { io } = require('socket.io-client');
const equal = require('fast-deep-equal');

// Determine socket URL - will be replaced at build time by webpack DefinePlugin
// Falls back to deriving from current origin (replace port with 3100)
const getSocketUrl = () => {
  // Check if SOCKET_URL was injected at build time
  if (typeof __SOCKET_URL__ !== 'undefined' && __SOCKET_URL__) {
    return __SOCKET_URL__;
  }
  // Fallback: derive from current page URL
  const origin = window.location.origin;
  // If on port 80 or 443, append :3100, otherwise replace port
  if (origin.match(/:\d+$/)) {
    return origin.replace(/:\d+$/, ':3100');
  }
  return origin + ':3100';
};

const SOCKET_URL = getSocketUrl();

class ConnectionHandler {
  constructor() {
    console.log('Connecting to socket server:', SOCKET_URL);
    this.socket = io(SOCKET_URL);
    this.socket.on('init', (msg) => console.log(msg));

    this.seed = null;
    this.code = null;
    this.previousSentState = {};
  }

  startNewGame(gameMode = '1v1', options = {}) {
    this.socket.emit('createGame', { gameMode, options });
  }

  nextRound() {
    this.socket.emit('nextRound')
  }

  updateGameState(state) {
    if (equal(this.previousSentState, state)) return;
    this.socket.emit('updateGameState', state);
    this.previousSentState = state;
  }


  updatePausedState(state) {
    this.socket.emit('updatePausedState', state);
  }

  emitTilesCleared(tiles) {
    if (tiles.length > 0) {
      this.socket.emit('tilesCleared', tiles);
    }
  }

  emitScoreUpdate(team, score) {
    this.socket.emit('scoreUpdate', { team, score });
  }
}

const connectionHandler = new ConnectionHandler();

export default connectionHandler;