export default class EventLog {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'event-log';
    this.container.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 280px;
      max-height: 200px;
      overflow: hidden;
      pointer-events: none;
      z-index: 100;
      font-family: monospace;
      font-size: 14px;
    `;
    document.body.appendChild(this.container);

    this.events = [];
    this.maxEvents = 8;
  }

  addEvent(message, type = 'info') {
    const event = document.createElement('div');
    event.style.cssText = `
      padding: 6px 10px;
      margin-bottom: 4px;
      border-radius: 4px;
      opacity: 1;
      transition: opacity 0.5s ease;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
    `;

    // Style based on event type
    switch (type) {
      case 'kill':
        event.style.backgroundColor = 'rgba(180, 50, 50, 0.85)';
        event.style.color = '#fff';
        break;
      case 'death':
        event.style.backgroundColor = 'rgba(80, 80, 80, 0.85)';
        event.style.color = '#ccc';
        break;
      case 'score':
        event.style.backgroundColor = 'rgba(50, 150, 50, 0.85)';
        event.style.color = '#fff';
        break;
      case 'round':
        event.style.backgroundColor = 'rgba(50, 100, 180, 0.85)';
        event.style.color = '#fff';
        break;
      default:
        event.style.backgroundColor = 'rgba(60, 60, 60, 0.85)';
        event.style.color = '#ddd';
    }

    event.innerHTML = message;
    this.container.insertBefore(event, this.container.firstChild);
    this.events.unshift(event);

    // Remove old events
    while (this.events.length > this.maxEvents) {
      const old = this.events.pop();
      old.remove();
    }

    // Fade out after delay
    setTimeout(() => {
      event.style.opacity = '0';
      setTimeout(() => {
        if (event.parentNode) {
          event.remove();
          this.events = this.events.filter(e => e !== event);
        }
      }, 500);
    }, 5000);
  }

  logKill(killerName, victimName, killerColor = '#fff', victimColor = '#fff') {
    const message = `<span style="color: ${killerColor}">${killerName}</span> killed <span style="color: ${victimColor}">${victimName}</span>`;
    this.addEvent(message, 'kill');
  }

  logDeath(playerName, playerColor = '#fff') {
    const message = `<span style="color: ${playerColor}">${playerName}</span> was eliminated`;
    this.addEvent(message, 'death');
  }

  logScore(playerName, points, playerColor = '#fff') {
    const message = `<span style="color: ${playerColor}">${playerName}</span> scored! (${points} pts)`;
    this.addEvent(message, 'score');
  }

  logRoundWin(winnerName, winnerColor = '#fff') {
    const message = `<span style="color: ${winnerColor}">${winnerName}</span> wins the round!`;
    this.addEvent(message, 'round');
  }

  logTeamRoundWin(teamName, teamColor = '#fff') {
    const message = `<span style="color: ${teamColor}">${teamName}</span> wins the round!`;
    this.addEvent(message, 'round');
  }

  logCapture(playerName, playerColor = '#fff') {
    const message = `<span style="color: ${playerColor}">${playerName}</span> captured the flag!`;
    this.addEvent(message, 'score');
  }

  clear() {
    this.events.forEach(e => e.remove());
    this.events = [];
  }

  destroy() {
    this.clear();
    this.container.remove();
  }
}
