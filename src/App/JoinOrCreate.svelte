<script>
  import { getContext, onMount } from 'svelte';
  const { connectionHandler } = getContext('connectionHandler');

  let gameCode;
  let selectedMode = '1v1';
  let openGames = [];

  // Game options
  let maxPoints = 5;
  let minimap = true;
  let friendlyFire = true;
  let gameType = 'elimination';

  const gameModes = [
    { value: '1v1', label: '1v1 (Classic)' },
    { value: '2v2', label: '2v2 (Team)' },
    { value: '3v3', label: '3v3 (Team)' }
  ];

  const gameTypes = [
    { value: 'elimination', label: 'Last Man Standing', description: 'Eliminate the entire enemy team' },
    { value: 'capture', label: 'Capture the Flag', description: 'Enter the enemy base to score' },
    { value: 'deathmatch', label: 'Deathmatch', description: 'First team to X kills wins' },
  ];

  function createGame() {
    const options = {
      maxPoints,
      minimap,
      friendlyFire,
      gameType
    };
    connectionHandler.socket.emit('createGame', { gameMode: selectedMode, options });
    // Route to lobby happens automatically when 'joined' event is received
  }

  function handleInput() {
    // Only emit if we have a valid-looking code (5 chars)
    if (gameCode && gameCode.length >= 5) {
      connectionHandler.socket.emit('gameCodeInput', gameCode);
    }
  }

  function joinGame(code) {
    connectionHandler.socket.emit('gameCodeInput', code);
  }

  function refreshGames() {
    connectionHandler.socket.emit('getOpenGames');
  }

  onMount(() => {
    connectionHandler.socket.on('openGamesList', (games) => {
      openGames = games;
    });
    refreshGames();
    // Refresh every 3 seconds
    const interval = setInterval(refreshGames, 3000);
    return () => clearInterval(interval);
  });

  $: isTeamGame = selectedMode !== '1v1';

  // Reset maxPoints to sensible defaults when game type changes
  $: if (gameType === 'capture' && maxPoints > 5) {
    maxPoints = 3;
  } else if (gameType !== 'capture' && maxPoints < 3) {
    maxPoints = 5;
  }
</script>

<div id="form">
  <h1>Let's play Tunneler</h1>

  {#if openGames.length > 0}
    <div class="open-games">
      <h2>Open Games</h2>
      <div class="games-list">
        {#each openGames as game}
          <button class="game-item" on:click={() => joinGame(game.code)}>
            <span class="game-mode">{game.gameMode}</span>
            <span class="game-players">{game.currentPlayers}/{game.totalPlayers} players</span>
            <span class="game-code">{game.code}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <p>Or enter a game code</p>
  <!-- svelte-ignore a11y-autofocus -->
  <input autofocus bind:value={gameCode} on:input={handleInput} on:keydown={(e) => e.key === 'Enter' && gameCode && joinGame(gameCode)} type="text" id="code" placeholder="abc123" />

  <div class="create-section">
    <h2>Create a new game</h2>

    <div class="mode-selector">
      <label for="gamemode">Game Mode:</label>
      <select id="gamemode" bind:value={selectedMode}>
        {#each gameModes as mode}
          <option value={mode.value}>{mode.label}</option>
        {/each}
      </select>
    </div>

    <div class="options-row">
      <label for="gameType">Game Type:</label>
      <select id="gameType" bind:value={gameType}>
        {#each gameTypes as type}
          <option value={type.value}>{type.label}</option>
        {/each}
      </select>
    </div>

    <div class="options-row">
      <label for="maxPoints">{gameType === 'capture' ? 'Captures to Win:' : 'Points to Win:'}</label>
      <select id="maxPoints" bind:value={maxPoints}>
        {#if gameType === 'capture'}
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={5}>5</option>
        {:else}
          <option value={3}>3</option>
          <option value={5}>5</option>
          <option value={7}>7</option>
          <option value={10}>10</option>
        {/if}
      </select>
    </div>

    {#if isTeamGame}
      <div class="options-row">
        <label>
          <input type="checkbox" bind:checked={minimap} />
          Enable Minimap
        </label>
      </div>

      <div class="options-row">
        <label>
          <input type="checkbox" bind:checked={friendlyFire} />
          Friendly Fire
        </label>
      </div>
    {/if}

    <button on:click={createGame}>Create Game</button>
  </div>
</div>

<style>
  input[type="text"] {
    font-size: 1.5rem;
    max-width: 200px;
    text-align: center;
  }

  input[type="text"]:focus {
    outline: none;
  }

  input[type="checkbox"] {
    width: 1.2rem;
    height: 1.2rem;
    margin-right: 0.5rem;
  }

  #form {
    display: flex;
    gap: 1rem;
    flex-direction: column;
    align-items: center;
    background-color: #375284;
    padding: 1rem;
  }

  .create-section {
    background-color: #2a4a6a;
    padding: 1rem;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 300px;
  }

  .create-section h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  .mode-selector,
  .options-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    justify-content: space-between;
  }

  .options-row label {
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  select {
    font-size: 1.1rem;
    padding: 0.3rem 0.5rem;
  }

  .open-games {
    width: 100%;
    max-width: 400px;
  }

  .open-games h2 {
    text-align: center;
    margin-bottom: 0.5rem;
  }

  .games-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .game-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: #4a6fa5;
    border: none;
    cursor: pointer;
    font-size: 1rem;
  }

  .game-item:hover {
    background-color: #5a8fc5;
  }

  .game-mode {
    font-weight: bold;
  }

  .game-players {
    color: #aaffaa;
  }

  .game-code {
    font-family: monospace;
    background-color: #00000044;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
  }

  button {
    padding: 0.6rem 1.2rem;
    font-size: 1.1rem;
    cursor: pointer;
    background-color: #4aaa4a;
    border: none;
    color: white;
    border-radius: 4px;
  }

  button:hover {
    background-color: #5abb5a;
  }
</style>
