import connectionHandler from './ConnectionHandler';

// Chat visibility types
const CHAT_TYPE = {
  SPECTATOR: 'spectator',  // Only visible to spectators
  TEAM: 'team',            // Only visible to same team
  ALL: 'all',              // Visible to everyone (FFA chat, events)
  EVENT: 'event',          // Game events (kills, scores) - visible to all
};

export default class ChatLog {
  constructor(options = {}) {
    this.isSpectator = options.isSpectator || false;
    this.playerTeam = options.playerTeam || 0;
    this.playerNumber = options.playerNumber;
    this.isFFA = options.isFFA || false;
    this.username = options.username || 'Player';

    this.createContainer();
    this.setupInput();
    this.setupNetworkListeners();

    this.messages = [];
    this.maxMessages = 50;
    this.inputEnabled = true;
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'chat-log';
    this.container.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      width: 350px;
      max-height: 180px;
      z-index: 100;
      font-family: monospace;
      font-size: 13px;
      display: flex;
      flex-direction: column;
    `;
    document.body.appendChild(this.container);

    // Messages container (scrollable)
    this.messagesContainer = document.createElement('div');
    this.messagesContainer.id = 'chat-messages';
    this.messagesContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      max-height: 140px;
      padding: 5px;
      background-color: rgba(0, 0, 0, 0.5);
      border-radius: 4px 4px 0 0;
    `;
    this.container.appendChild(this.messagesContainer);
  }

  setupInput() {
    // Input container
    this.inputContainer = document.createElement('div');
    this.inputContainer.style.cssText = `
      display: flex;
      background-color: rgba(0, 0, 0, 0.7);
      border-radius: 0 0 4px 4px;
      padding: 4px;
    `;

    // Chat type indicator/selector
    this.chatTypeLabel = document.createElement('span');
    this.updateChatTypeLabel();
    this.chatTypeLabel.style.cssText = `
      padding: 4px 8px;
      font-size: 11px;
      border-radius: 3px;
      margin-right: 4px;
      cursor: pointer;
      user-select: none;
    `;
    this.chatTypeLabel.title = 'Click to change chat mode';
    this.chatTypeLabel.addEventListener('click', () => this.cycleChatType());
    this.inputContainer.appendChild(this.chatTypeLabel);

    // Text input
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Press Enter to chat...';
    this.input.maxLength = 100;
    this.input.style.cssText = `
      flex: 1;
      background-color: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      padding: 4px 8px;
      color: #fff;
      font-family: monospace;
      font-size: 12px;
      outline: none;
    `;

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.input.value.trim()) {
        this.sendMessage(this.input.value.trim());
        this.input.value = '';
        this.input.blur();
      } else if (e.key === 'Escape') {
        this.input.blur();
      }
      // Prevent game input while typing
      e.stopPropagation();
    });

    this.input.addEventListener('focus', () => {
      this.inputEnabled = false;
    });

    this.input.addEventListener('blur', () => {
      this.inputEnabled = true;
    });

    this.inputContainer.appendChild(this.input);
    this.container.appendChild(this.inputContainer);

    // Global Enter key to focus input
    this.keyHandler = (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.input) {
        e.preventDefault();
        this.input.focus();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  updateChatTypeLabel() {
    if (this.isSpectator) {
      this.currentChatType = CHAT_TYPE.SPECTATOR;
      this.chatTypeLabel.textContent = '[SPEC]';
      this.chatTypeLabel.style.backgroundColor = 'rgba(128, 128, 128, 0.8)';
      this.chatTypeLabel.style.color = '#fff';
    } else if (this.isFFA) {
      this.currentChatType = CHAT_TYPE.ALL;
      this.chatTypeLabel.textContent = '[ALL]';
      this.chatTypeLabel.style.backgroundColor = 'rgba(100, 100, 180, 0.8)';
      this.chatTypeLabel.style.color = '#fff';
    } else {
      // Team mode - default to team chat
      if (!this.currentChatType || this.currentChatType === CHAT_TYPE.SPECTATOR) {
        this.currentChatType = CHAT_TYPE.TEAM;
      }
      if (this.currentChatType === CHAT_TYPE.TEAM) {
        this.chatTypeLabel.textContent = '[TEAM]';
        this.chatTypeLabel.style.backgroundColor = this.playerTeam === 0
          ? 'rgba(50, 50, 200, 0.8)'
          : 'rgba(50, 180, 50, 0.8)';
        this.chatTypeLabel.style.color = '#fff';
      } else {
        this.chatTypeLabel.textContent = '[ALL]';
        this.chatTypeLabel.style.backgroundColor = 'rgba(100, 100, 180, 0.8)';
        this.chatTypeLabel.style.color = '#fff';
      }
    }
  }

  cycleChatType() {
    if (this.isSpectator) {
      // Spectators can only use spectator chat
      return;
    }
    if (this.isFFA) {
      // FFA only has all chat
      return;
    }
    // Team mode: toggle between team and all
    this.currentChatType = this.currentChatType === CHAT_TYPE.TEAM ? CHAT_TYPE.ALL : CHAT_TYPE.TEAM;
    this.updateChatTypeLabel();
  }

  sendMessage(text) {
    connectionHandler.socket.emit('chatMessage', {
      text,
      type: this.currentChatType,
      playerNumber: this.playerNumber,
      team: this.playerTeam,
      username: this.username,
      isSpectator: this.isSpectator,
    });
  }

  setupNetworkListeners() {
    this.chatHandler = (data) => {
      // Filter messages based on visibility rules
      if (this.shouldShowMessage(data)) {
        this.addChatMessage(data);
      }
    };
    connectionHandler.socket.on('chatMessage', this.chatHandler);
  }

  shouldShowMessage(data) {
    // Events are always visible
    if (data.type === CHAT_TYPE.EVENT) {
      return true;
    }

    // Spectator messages only visible to spectators
    if (data.type === CHAT_TYPE.SPECTATOR) {
      return this.isSpectator;
    }

    // Team messages only visible to same team (and not to spectators)
    if (data.type === CHAT_TYPE.TEAM) {
      if (this.isSpectator) return false;
      return data.team === this.playerTeam;
    }

    // All chat visible to everyone except spectators (unless from spectator)
    if (data.type === CHAT_TYPE.ALL) {
      // Spectators can see all chat
      return true;
    }

    return true;
  }

  addChatMessage(data) {
    const msg = document.createElement('div');
    msg.style.cssText = `
      padding: 3px 6px;
      margin-bottom: 2px;
      border-radius: 3px;
      word-wrap: break-word;
    `;

    let prefix = '';
    let bgColor = 'rgba(60, 60, 60, 0.6)';

    if (data.type === CHAT_TYPE.SPECTATOR) {
      prefix = '<span style="color: #888;">[SPEC]</span> ';
      bgColor = 'rgba(80, 80, 80, 0.6)';
    } else if (data.type === CHAT_TYPE.TEAM) {
      prefix = '<span style="color: #8af;">[TEAM]</span> ';
      bgColor = data.team === 0
        ? 'rgba(40, 40, 120, 0.6)'
        : 'rgba(40, 120, 40, 0.6)';
    } else if (data.type === CHAT_TYPE.EVENT) {
      // Events have special styling
      msg.style.backgroundColor = data.eventColor || 'rgba(100, 60, 60, 0.7)';
      msg.innerHTML = data.text;
      this.appendMessage(msg);
      return;
    }

    msg.style.backgroundColor = bgColor;

    const nameColor = data.nameColor || '#fff';
    msg.innerHTML = `${prefix}<span style="color: ${nameColor}; font-weight: bold;">${this.escapeHtml(data.username)}:</span> <span style="color: #ddd;">${this.escapeHtml(data.text)}</span>`;

    this.appendMessage(msg);
  }

  appendMessage(msgElement) {
    this.messagesContainer.appendChild(msgElement);
    this.messages.push(msgElement);

    // Remove old messages
    while (this.messages.length > this.maxMessages) {
      const old = this.messages.shift();
      old.remove();
    }

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Game event methods (replaces EventLog)
  logEvent(message, eventColor = 'rgba(100, 60, 60, 0.7)') {
    this.addChatMessage({
      type: CHAT_TYPE.EVENT,
      text: message,
      eventColor,
    });
  }

  logKill(killerName, victimName, killerColor = '#fff', victimColor = '#fff') {
    const message = `<span style="color: ${killerColor}">${killerName}</span> killed <span style="color: ${victimColor}">${victimName}</span>`;
    this.logEvent(message, 'rgba(180, 50, 50, 0.7)');
  }

  logDeath(playerName, playerColor = '#fff') {
    const message = `<span style="color: ${playerColor}">${playerName}</span> was eliminated`;
    this.logEvent(message, 'rgba(80, 80, 80, 0.7)');
  }

  logScore(playerName, points, playerColor = '#fff') {
    const message = `<span style="color: ${playerColor}">${playerName}</span> scored! (${points} pts)`;
    this.logEvent(message, 'rgba(50, 150, 50, 0.7)');
  }

  logRoundWin(winnerName, winnerColor = '#fff') {
    const message = `<span style="color: ${winnerColor}">${winnerName}</span> wins the round!`;
    this.logEvent(message, 'rgba(50, 100, 180, 0.7)');
  }

  logGameWin(winnerName, winnerColor = '#fff', reason = '') {
    const reasonText = reason ? ` ${reason}` : '';
    const message = `<span style="color: ${winnerColor}">${winnerName}</span> wins the game!${reasonText}`;
    this.logEvent(message, 'rgba(180, 150, 50, 0.8)');
  }

  logTeamRoundWin(teamName, teamColor = '#fff') {
    const message = `<span style="color: ${teamColor}">${teamName}</span> wins the round!`;
    this.logEvent(message, 'rgba(50, 100, 180, 0.7)');
  }

  logCapture(playerName, playerColor = '#fff') {
    const message = `<span style="color: ${playerColor}">${playerName}</span> captured the flag!`;
    this.logEvent(message, 'rgba(50, 150, 50, 0.7)');
  }

  clear() {
    this.messages.forEach(m => m.remove());
    this.messages = [];
  }

  destroy() {
    this.clear();
    window.removeEventListener('keydown', this.keyHandler);
    connectionHandler.socket.off('chatMessage', this.chatHandler);
    this.container.remove();
  }

  // Check if input is focused (for game input blocking)
  isInputFocused() {
    return document.activeElement === this.input;
  }
}

export { CHAT_TYPE };
