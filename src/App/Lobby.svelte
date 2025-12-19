<script>
  import { getContext, onMount, onDestroy } from 'svelte';
  const { connectionHandler } = getContext('connectionHandler');

  export let playerNumber;
  export let username;
  export let isHost;

  let lobbyState = null;
  let errorMsg = '';
  let errorTimeout;
  let editingUsername = false;
  let newUsername = username;

  onMount(() => {
    connectionHandler.socket.on('lobbyUpdate', (state) => {
      lobbyState = state;
    });

    connectionHandler.socket.on('error', ({ message }) => {
      errorMsg = message;
      clearTimeout(errorTimeout);
      errorTimeout = setTimeout(() => {
        errorMsg = '';
      }, 3000);
    });
  });

  onDestroy(() => {
    clearTimeout(errorTimeout);
  });

  function switchTeam() {
    connectionHandler.socket.emit('switchTeam');
  }

  function updateOption(key, value) {
    connectionHandler.socket.emit('updateGameOptions', { [key]: value });
  }

  function startGame() {
    connectionHandler.socket.emit('startGame');
  }

  function startEditUsername() {
    newUsername = username;
    editingUsername = true;
  }

  function saveUsername() {
    if (newUsername.trim() && newUsername !== username) {
      connectionHandler.socket.emit('updateUsername', newUsername.trim());
      username = newUsername.trim();
    }
    editingUsername = false;
  }

  function cancelEditUsername() {
    editingUsername = false;
    newUsername = username;
  }

  // Reactive team player lists
  $: blueTeamPlayers = lobbyState ? Object.values(lobbyState.players).filter(p => p.team === 0) : [];
  $: greenTeamPlayers = lobbyState ? Object.values(lobbyState.players).filter(p => p.team === 1) : [];

  $: myTeam = lobbyState?.players[playerNumber]?.team;
  $: otherTeam = myTeam === 0 ? 1 : 0;
  $: isFFA = lobbyState?.isFFA || false;
  $: isTeamGame = lobbyState?.gameMode !== '1v1' && !isFFA;
  $: showGameTypeOptions = true; // Game type available for all modes including 1v1

  // In dynamic teams, allow switching if it won't create imbalance
  $: canSwitchTeam = (() => {
    if (!lobbyState || isFFA) return false;
    const myTeamSize = myTeam === 0 ? blueTeamPlayers.length : greenTeamPlayers.length;
    const otherTeamSize = myTeam === 0 ? greenTeamPlayers.length : blueTeamPlayers.length;
    return otherTeamSize < myTeamSize; // Can only switch to smaller team
  })();

  // FFA: All players in a flat list
  $: ffaPlayers = lobbyState ? Object.values(lobbyState.players).sort((a, b) => a.playerNumber - b.playerNumber) : [];

  // Can start game based on min players
  $: canStartGame = lobbyState
    ? lobbyState.currentPlayers >= lobbyState.minPlayers &&
      (isFFA || (blueTeamPlayers.length >= 1 && greenTeamPlayers.length >= 1))
    : false;

  // FFA player colors for display
  const FFA_COLORS = ['#4a8aff', '#4aff4a', '#ff8c00', '#aa44ff', '#44dddd', '#ff44aa'];

  const gameTypes = [
    { value: 'elimination', label: 'Last Man Standing', description: 'Eliminate the entire enemy team' },
    { value: 'capture', label: 'Capture the Flag', description: 'Enter the enemy base to score' },
    { value: 'deathmatch', label: 'Deathmatch', description: 'First team to X kills wins' },
  ];

  // Available game types (FFA doesn't support capture)
  $: availableGameTypes = isFFA
    ? gameTypes.filter(t => t.value !== 'capture')
    : gameTypes;

  function getGameTypeLabel(type) {
    const found = gameTypes.find(t => t.value === type);
    return found ? found.label : type;
  }
</script>

<div class="lobby">
  <div class="lobby-header">
    <h1>Game Lobby</h1>
    <div class="game-code">
      <span class="label">Code:</span>
      <span class="code">{lobbyState?.code || '...'}</span>
    </div>
    <div class="game-mode">
      {#if lobbyState?.gameMode === '1v1'}
        1v1 Classic
      {:else if lobbyState?.gameMode === 'teams'}
        Team Battle
      {:else if lobbyState?.gameMode === 'ffa'}
        Free-for-All
      {:else}
        {lobbyState?.gameMode || '...'}
      {/if}
      ({lobbyState?.currentPlayers || 0}/{lobbyState?.maxPlayers || '?'} players)
    </div>
  </div>

  {#if errorMsg}
    <div class="error">{errorMsg}</div>
  {/if}

  <div class="your-info" class:team-blue-bg={!isFFA && myTeam === 0} class:team-green-bg={!isFFA && myTeam === 1}>
    {#if editingUsername}
      <input
        type="text"
        class="username-input"
        bind:value={newUsername}
        on:keydown={(e) => e.key === 'Enter' && saveUsername()}
        maxlength="20"
      />
      <button class="username-btn save" on:click={saveUsername}>Save</button>
      <button class="username-btn cancel" on:click={cancelEditUsername}>Cancel</button>
    {:else}
      <span class="your-name">{username}</span>
      <button class="edit-btn" on:click={startEditUsername}>Edit</button>
    {/if}
    {#if !isFFA}
      <span class="your-team">
        {#if myTeam === 0}Blue Team{:else if myTeam === 1}Green Team{:else}...{/if}
      </span>
    {/if}
  </div>

  {#if isFFA}
    <!-- FFA Player List -->
    <div class="ffa-players">
      <h2>Players ({ffaPlayers.length}/{lobbyState?.maxPlayers || '?'})</h2>
      <div class="ffa-player-grid">
        {#each ffaPlayers as player, index}
          <div class="ffa-player-slot" class:is-you={player.playerNumber === playerNumber}>
            <span class="ffa-color-indicator" style="background-color: {FFA_COLORS[index % FFA_COLORS.length]}"></span>
            <span class="player-name">{player.username}</span>
            {#if player.isHost}
              <span class="host-badge">HOST</span>
            {/if}
            {#if player.playerNumber === playerNumber}
              <span class="you-badge">YOU</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <!-- Team Player Lists -->
    <div class="teams-container">
    <div class="team team-blue">
      <h2>Blue Team ({blueTeamPlayers.length})</h2>
      <div class="team-slots">
        {#each blueTeamPlayers as player}
          <div class="player-slot" class:is-you={player.playerNumber === playerNumber}>
            <span class="player-name">{player.username}</span>
            {#if player.isHost}
              <span class="host-badge">HOST</span>
            {/if}
          </div>
        {/each}
        {#if blueTeamPlayers.length === 0}
          <div class="player-slot empty">
            <span class="waiting">Empty</span>
          </div>
        {/if}
      </div>
      {#if myTeam !== 0 && canSwitchTeam}
        <button class="join-team-btn" on:click={switchTeam}>Join Blue</button>
      {/if}
    </div>

    <div class="vs">VS</div>

    <div class="team team-green">
      <h2>Green Team ({greenTeamPlayers.length})</h2>
      <div class="team-slots">
        {#each greenTeamPlayers as player}
          <div class="player-slot" class:is-you={player.playerNumber === playerNumber}>
            <span class="player-name">{player.username}</span>
            {#if player.isHost}
              <span class="host-badge">HOST</span>
            {/if}
          </div>
        {/each}
        {#if greenTeamPlayers.length === 0}
          <div class="player-slot empty">
            <span class="waiting">Empty</span>
          </div>
        {/if}
      </div>
      {#if myTeam !== 1 && canSwitchTeam}
        <button class="join-team-btn" on:click={switchTeam}>Join Green</button>
      {/if}
    </div>
  </div>
  {/if}

  <div class="game-options">
    <h3>Game Settings</h3>

    <div class="option">
      <label for="gameType">Game Type:</label>
      {#if isHost}
        <select id="gameType" value={lobbyState?.options?.gameType || 'elimination'} on:change={(e) => updateOption('gameType', e.target.value)}>
          {#each availableGameTypes as type}
            <option value={type.value}>{type.label}</option>
          {/each}
        </select>
      {:else}
        <span class="option-value">{getGameTypeLabel(lobbyState?.options?.gameType)}</span>
      {/if}
    </div>

    <div class="option">
      <label for="maxPoints">{lobbyState?.options?.gameType === 'capture' ? 'Captures to Win:' : 'Points to Win:'}</label>
      {#if isHost}
        <select id="maxPoints" value={String(lobbyState?.options?.maxPoints || 5)} on:change={(e) => updateOption('maxPoints', parseInt(e.target.value))}>
          {#if lobbyState?.options?.gameType === 'capture'}
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="5">5</option>
          {:else}
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="7">7</option>
            <option value="10">10</option>
          {/if}
        </select>
      {:else}
        <span class="option-value">{lobbyState?.options?.maxPoints || 5}</span>
      {/if}
    </div>

    {#if isTeamGame || isFFA}
      <div class="option">
        <label for="minimap">Minimap:</label>
        {#if isHost}
          <input type="checkbox" id="minimap" checked={lobbyState?.options?.minimap !== false} on:change={(e) => updateOption('minimap', e.target.checked)} />
        {:else}
          <span class="option-value">{lobbyState?.options?.minimap !== false ? 'On' : 'Off'}</span>
        {/if}
      </div>
    {/if}

    {#if isTeamGame}
      <div class="option">
        <label for="friendlyFire">Friendly Fire:</label>
        {#if isHost}
          <input type="checkbox" id="friendlyFire" checked={lobbyState?.options?.friendlyFire !== false} on:change={(e) => updateOption('friendlyFire', e.target.checked)} />
        {:else}
          <span class="option-value">{lobbyState?.options?.friendlyFire !== false ? 'On' : 'Off'}</span>
        {/if}
      </div>
    {/if}
  </div>

  {#if isHost}
    <button class="start-btn" disabled={!canStartGame} on:click={startGame}>
      {#if canStartGame}
        Start Game
      {:else if isFFA}
        Need at least 3 players
      {:else}
        Need players on both teams
      {/if}
    </button>
  {:else}
    <div class="waiting-host">Waiting for host to start...</div>
  {/if}
</div>

<style>
  .lobby {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem;
    background-color: #375284;
    min-height: 100vh;
    gap: 1rem;
  }

  .lobby-header {
    text-align: center;
  }

  .lobby-header h1 {
    margin: 0 0 0.5rem 0;
  }

  .game-code {
    font-size: 1.2rem;
    margin-bottom: 0.25rem;
  }

  .game-code .label {
    color: #aaa;
  }

  .game-code .code {
    font-family: monospace;
    font-size: 1.5rem;
    background-color: #00000044;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    letter-spacing: 2px;
  }

  .game-mode {
    font-size: 1.1rem;
    color: #aaffaa;
  }

  .error {
    background-color: #ff4444;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  .your-info {
    background-color: #4a6fa5;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .your-info.team-blue-bg {
    background-color: #2a4a7a;
    border: 3px solid #4a8aff;
  }

  .your-info.team-green-bg {
    background-color: #2a5a2a;
    border: 3px solid #4aff4a;
  }

  .your-name {
    font-weight: bold;
    font-size: 1.3rem;
  }

  .your-team {
    font-size: 1rem;
    padding: 0.2rem 0.6rem;
    border-radius: 4px;
    background-color: #00000044;
  }

  .edit-btn {
    padding: 0.2rem 0.5rem;
    font-size: 0.8rem;
    background-color: #666;
    border: none;
    color: white;
    cursor: pointer;
    border-radius: 3px;
  }

  .edit-btn:hover {
    background-color: #888;
  }

  .username-input {
    font-size: 1.1rem;
    padding: 0.3rem 0.5rem;
    border: none;
    border-radius: 4px;
    width: 150px;
  }

  .username-btn {
    padding: 0.3rem 0.6rem;
    font-size: 0.9rem;
    border: none;
    cursor: pointer;
    border-radius: 3px;
  }

  .username-btn.save {
    background-color: #4a4;
    color: white;
  }

  .username-btn.cancel {
    background-color: #a44;
    color: white;
  }

  .teams-container {
    display: flex;
    gap: 1rem;
    align-items: center;
    width: 100%;
    max-width: 700px;
  }

  .team {
    flex: 1;
    padding: 1rem;
    border-radius: 8px;
    text-align: center;
  }

  .team-blue {
    background-color: #2a4a7a;
    border: 2px solid #4a8aff;
  }

  .team-green {
    background-color: #2a5a2a;
    border: 2px solid #4aff4a;
  }

  .team h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.2rem;
  }

  .team-blue h2 {
    color: #4a8aff;
  }

  .team-green h2 {
    color: #4aff4a;
  }

  .vs {
    font-size: 1.5rem;
    font-weight: bold;
    color: #888;
  }

  .team-slots {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .player-slot {
    background-color: #00000033;
    padding: 0.5rem;
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .player-slot.is-you {
    border: 2px solid #ffaa00;
  }

  .player-slot.empty {
    border: 2px dashed #666;
    background-color: transparent;
  }

  .player-name {
    font-weight: bold;
  }

  .waiting {
    color: #888;
    font-style: italic;
  }

  .host-badge {
    background-color: #ffaa00;
    color: #000;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: bold;
  }

  .you-badge {
    background-color: #44aaff;
    color: #000;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: bold;
  }

  /* FFA Player List Styles */
  .ffa-players {
    background-color: #3a4a6a;
    padding: 1rem;
    border-radius: 8px;
    width: 100%;
    max-width: 400px;
  }

  .ffa-players h2 {
    margin: 0 0 0.75rem 0;
    text-align: center;
    color: #aaffaa;
  }

  .ffa-player-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .ffa-player-slot {
    background-color: #00000033;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .ffa-player-slot.is-you {
    border: 2px solid #ffaa00;
  }

  .ffa-color-indicator {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .join-team-btn {
    padding: 0.3rem 0.8rem;
    font-size: 0.9rem;
    cursor: pointer;
    background-color: #555;
    border: none;
    color: white;
    border-radius: 4px;
  }

  .join-team-btn:hover {
    background-color: #777;
  }

  .game-options {
    background-color: #2a3a5a;
    padding: 1rem;
    border-radius: 8px;
    width: 100%;
    max-width: 300px;
  }

  .game-options h3 {
    margin: 0 0 0.75rem 0;
    text-align: center;
  }

  .option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .option label {
    color: #ccc;
  }

  .option select {
    font-size: 1rem;
    padding: 0.3rem 0.5rem;
    background-color: #4a5a7a;
    color: white;
    border: 1px solid #6a7a9a;
    border-radius: 4px;
    min-width: 80px;
  }

  .option input[type="checkbox"] {
    width: 1.2rem;
    height: 1.2rem;
  }

  .option-value {
    font-weight: bold;
    color: #aaffaa;
  }

  .start-btn {
    padding: 1rem 2rem;
    font-size: 1.3rem;
    cursor: pointer;
    background-color: #4aff4a;
    color: #000;
    border: none;
    border-radius: 8px;
    font-weight: bold;
  }

  .start-btn:disabled {
    background-color: #555;
    color: #888;
    cursor: not-allowed;
  }

  .start-btn:not(:disabled):hover {
    background-color: #6aff6a;
  }

  .waiting-host {
    font-size: 1.2rem;
    color: #aaa;
    font-style: italic;
  }
</style>
