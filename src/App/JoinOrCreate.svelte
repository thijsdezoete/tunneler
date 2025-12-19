<script>
  import { getContext, onMount } from 'svelte';
  const { connectionHandler } = getContext('connectionHandler');

  let gameCode;
  let selectedMode = 'teams';
  let openGames = [];

  // Game options
  let maxPoints = 5;
  let minimap = true;
  let friendlyFire = true;
  let gameType = 'elimination';

  // Simplified game modes
  const gameModes = [
    { value: '1v1', label: '1v1', description: 'Classic head-to-head' },
    { value: 'teams', label: 'Teams', description: '2-6 players, auto-balanced' },
    { value: 'ffa', label: 'Free-for-All', description: '2-6 players, everyone for themselves' },
  ];

  const gameTypes = [
    { value: 'elimination', label: 'Last Man Standing' },
    { value: 'capture', label: 'Capture the Flag' },
    { value: 'deathmatch', label: 'Deathmatch' },
  ];

  function createGame() {
    const options = {
      maxPoints,
      minimap,
      friendlyFire,
      gameType
    };
    connectionHandler.socket.emit('createGame', { gameMode: selectedMode, options });
  }

  function handleInput() {
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
    const interval = setInterval(refreshGames, 3000);
    return () => clearInterval(interval);
  });

  $: isTeamGame = selectedMode === 'teams';
  $: isFFA = selectedMode === 'ffa';
  $: is1v1 = selectedMode === '1v1';

  // Available game types (FFA doesn't support capture, 1v1 is always elimination)
  $: availableGameTypes = isFFA
    ? gameTypes.filter(t => t.value !== 'capture')
    : gameTypes;

  // Reset game type if capture was selected and user switches to FFA
  $: if (isFFA && gameType === 'capture') {
    gameType = 'elimination';
  }

  // 1v1 forces elimination
  $: if (is1v1) {
    gameType = 'elimination';
  }

  // Reset maxPoints to sensible defaults when game type changes
  $: if (gameType === 'capture' && maxPoints > 5) {
    maxPoints = 3;
  } else if (gameType !== 'capture' && maxPoints < 3) {
    maxPoints = 5;
  }

  function getModeLabel(mode) {
    if (mode === '1v1') return '1v1';
    if (mode === 'teams') return 'Teams';
    if (mode === 'ffa') return 'FFA';
    // Legacy modes
    if (mode.startsWith('ffa')) return 'FFA';
    return mode.toUpperCase();
  }
</script>

<div id="form">
  <h1>Let's play Tunneler</h1>

  {#if openGames.length > 0}
    <div class="open-games">
      <h2>Available Games</h2>
      <div class="games-list">
        {#each openGames as game}
          <button class="game-item" class:playing={game.status === 'playing'} on:click={() => joinGame(game.code)}>
            <span class="game-mode">{getModeLabel(game.gameMode)}</span>
            <span class="game-players">
              {#if game.status === 'playing'}
                {game.currentPlayers} playing
                {#if game.spectatorCount > 0}
                  + {game.spectatorCount} watching
                {/if}
              {:else}
                {game.currentPlayers}/{game.maxPlayers} players
              {/if}
            </span>
            <span class="game-status" class:live={game.status === 'playing'}>
              {game.status === 'playing' ? 'LIVE' : 'LOBBY'}
            </span>
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

    <div class="mode-buttons">
      {#each gameModes as mode}
        <button
          class="mode-btn"
          class:selected={selectedMode === mode.value}
          on:click={() => selectedMode = mode.value}
        >
          <span class="mode-label">{mode.label}</span>
          <span class="mode-desc">{mode.description}</span>
        </button>
      {/each}
    </div>

    {#if !is1v1}
      <div class="options-row">
        <label for="gameType">Game Type:</label>
        <select id="gameType" bind:value={gameType}>
          {#each availableGameTypes as type}
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

      <div class="options-row">
        <label>
          <input type="checkbox" bind:checked={minimap} />
          Minimap
        </label>
      </div>

      {#if isTeamGame}
        <div class="options-row">
          <label>
            <input type="checkbox" bind:checked={friendlyFire} />
            Friendly Fire
          </label>
        </div>
      {/if}
    {/if}

    <button class="create-btn" on:click={createGame}>Create Game</button>
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
    max-width: 350px;
  }

  .create-section h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  .mode-buttons {
    display: flex;
    gap: 0.5rem;
    width: 100%;
  }

  .mode-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.6rem 0.4rem;
    background-color: #3a5a8a;
    border: 2px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    color: white;
    transition: all 0.15s ease;
  }

  .mode-btn:hover {
    background-color: #4a6a9a;
  }

  .mode-btn.selected {
    background-color: #4a8a4a;
    border-color: #6aba6a;
  }

  .mode-label {
    font-size: 1rem;
    font-weight: bold;
  }

  .mode-desc {
    font-size: 0.7rem;
    opacity: 0.8;
    text-align: center;
  }

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
    font-size: 1rem;
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

  .game-status {
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    background-color: #666;
    color: #fff;
  }

  .game-status.live {
    background-color: #c44;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .game-item.playing {
    background-color: #6a5a85;
    border-left: 3px solid #c44;
  }

  .game-item.playing:hover {
    background-color: #7a6a95;
  }

  .create-btn {
    padding: 0.7rem 1.5rem;
    font-size: 1.1rem;
    cursor: pointer;
    background-color: #4aaa4a;
    border: none;
    color: white;
    border-radius: 4px;
    margin-top: 0.5rem;
  }

  .create-btn:hover {
    background-color: #5abb5a;
  }
</style>
