const { io } = require('socket.io-client');
const equal = require('fast-deep-equal');

// Socket URL
const getSocketUrl = () => {
  if (window.location.hostname === 'tunneler.boei.eu') {
    return 'https://tunnelerserver.boei.eu';
  }

  // Fallback for local development: same origin with port 3100
  const origin = window.location.origin;
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
