<script>
  export let gameInitData;
  export let lobbyAvailable = false;

  import { createEventDispatcher, getContext, onMount, onDestroy } from 'svelte';
  import SpectatorGame from '../SpectatorGame';

  const dispatch = createEventDispatcher();
  const { connectionHandler } = getContext('connectionHandler');

  let spectatorGame = null;

  function joinLobby() {
    dispatch('joinLobby');
  }

  onMount(() => {
    spectatorGame = new SpectatorGame(
      gameInitData.seed,
      gameInitData.players,
      gameInitData.gameMode || '1v1',
      gameInitData.teams || { 0: [0], 1: [1] },
      gameInitData.options || {},
      gameInitData.isFFA || false,
      gameInitData.clearedTiles || [],
      gameInitData.currentState || {}
    );
  });

  onDestroy(() => {
    if (spectatorGame) {
      spectatorGame.destroy();
    }
  });
</script>

<canvas id="gamecanvas"/>

{#if lobbyAvailable}
  <div id="spectator-join-prompt">
    <p>Game ended - Lobby is now open!</p>
    <button on:click={joinLobby}>Join Lobby</button>
  </div>
{/if}

<style>
  #spectator-join-prompt {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(50, 100, 50, 0.95);
    padding: 15px 25px;
    border-radius: 8px;
    text-align: center;
    z-index: 200;
  }

  #spectator-join-prompt p {
    margin: 0 0 10px 0;
    color: #fff;
  }

  #spectator-join-prompt button {
    background-color: #4a8a4a;
    color: white;
    border: none;
    padding: 10px 20px;
    font-size: 1.1rem;
    cursor: pointer;
    border-radius: 4px;
  }

  #spectator-join-prompt button:hover {
    background-color: #5abb5a;
  }
</style>
