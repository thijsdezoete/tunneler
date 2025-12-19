<script>
  export let gameInitData
  import Game from '../Game';
  import { getContext } from 'svelte';
  import { onMount } from 'svelte';

  const { connectionHandler } = getContext('connectionHandler');

  function startGame() {
    const game = new Game(
      gameInitData.seed,
      gameInitData.players,
      gameInitData.playerNumber,
      gameInitData.gameMode || '1v1',
      gameInitData.teams || { 0: [0], 1: [1] },
      gameInitData.options || {},
      gameInitData.isFFA || false
    );
  }

  onMount(async () => {
    startGame();
	});
</script>

<canvas id="gamecanvas"/>

<style>
  /* #gamecanvas {
    width: 500px;
  } */
</style>