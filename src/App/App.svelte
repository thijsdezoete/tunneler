<script>
  import connectionHandler from '../ConnectionHandler';
  import ChooseType from './JoinOrCreate.svelte';
  import Lobby from './Lobby.svelte';
  import Game from './Game.svelte';
  import Spectator from './Spectator.svelte';
  import { setContext } from 'svelte';

  let gameInitData = {};
  let playerInfo = {
    playerNumber: null,
    username: '',
    isHost: false
  };
  let isSpectator = false;
  let lobbyAvailable = false;

  connectionHandler.socket.on(
    'joined',
    ({ playerNumber, team, username, isHost }) => {
      playerInfo.playerNumber = playerNumber;
      playerInfo.username = username;
      playerInfo.isHost = isHost;
      gameInitData.playerNumber = playerNumber;
      gameInitData.team = team;
      isSpectator = false;
      // Route to lobby when successfully joined
      route = 'lobby';
    }
  );

  connectionHandler.socket.on('gameInitialization', (data) => {
    gameInitData = { ...gameInitData, ...data };
    console.log('Game initialized:', gameInitData);
    route = 'game';
  });

  // Handle joining as spectator
  connectionHandler.socket.on('spectatorJoined', (data) => {
    gameInitData = { ...data, isSpectator: true };
    isSpectator = true;
    lobbyAvailable = false;
    console.log('Joined as spectator:', gameInitData);
    route = 'spectator';
  });

  // Handle lobby becoming available for spectators
  connectionHandler.socket.on('lobbyAvailable', () => {
    lobbyAvailable = true;
  });

  // Handle return to lobby after game ends
  connectionHandler.socket.on('backToLobby', ({ isHost }) => {
    playerInfo.isHost = isHost;
    isSpectator = false;
    route = 'lobby';
    cleanupGameElements();
  });

  // Handle game ended (all players left)
  connectionHandler.socket.on('gameEnded', () => {
    isSpectator = false;
    lobbyAvailable = false;
    route = 'home';
    cleanupGameElements();
  });

  function cleanupGameElements() {
    const minimap = document.getElementById('minimap');
    if (minimap) minimap.remove();
    const coordsDisplay = document.getElementById('coords-display');
    if (coordsDisplay) coordsDisplay.remove();
    const gameHUD = document.getElementById('game-hud');
    if (gameHUD) gameHUD.remove();
    const fullscreenWrapper = document.getElementById('fullscreen-wrapper');
    if (fullscreenWrapper) fullscreenWrapper.remove();
    const overlays = document.querySelectorAll('.overlay');
    overlays.forEach(o => o.remove());
    const eventLog = document.getElementById('event-log');
    if (eventLog) eventLog.remove();
    const chatLog = document.getElementById('chat-log');
    if (chatLog) chatLog.remove();
    const spectatorHUD = document.getElementById('spectator-hud');
    if (spectatorHUD) spectatorHUD.remove();
  }

  function requestJoinLobby() {
    connectionHandler.socket.emit('spectatorJoinLobby');
  }

  setContext('connectionHandler', {
    connectionHandler: connectionHandler,
  });

  let route = 'home';
</script>

<div id="content">
  {#if route === 'home'}
    <ChooseType />
  {:else if route === 'lobby'}
    <Lobby
      playerNumber={playerInfo.playerNumber}
      username={playerInfo.username}
      isHost={playerInfo.isHost}
    />
  {:else if route === 'game'}
    <Game {gameInitData} />
  {:else if route === 'spectator'}
    <Spectator {gameInitData} {lobbyAvailable} on:joinLobby={requestJoinLobby} />
  {/if}
  <canvas id="gamestats" />
</div>

<style>
  :global(button) {
    font-size: 1.5rem;
    padding: 0.5rem 1rem;
    border: none;
    cursor: pointer;
  }

  :global(p) {
    font-size: 20px;
  }

  :global(h1) {
    font-size: 3rem;
    margin: 0.5rem 0;
  }

  :global(h2) {
    font-size: 1.5rem;
    margin: 0.5rem 0;
  }
</style>
