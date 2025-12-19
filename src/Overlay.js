export default class Overlay {
  constructor(text) {
    this.body = document.querySelector('body');
    this.overlay = document.createElement('div');
    this.overlay.style.display = 'none';
    this.overlay.classList.add('overlay');

    this.heading = document.createElement('h1');
    this.heading.textContent = text;
    this.overlay.appendChild(this.heading);

    // Optional button container
    this.buttonContainer = document.createElement('div');
    this.buttonContainer.style.marginTop = '20px';
    this.overlay.appendChild(this.buttonContainer);

    this.body.appendChild(this.overlay);
  }

  setText(text) {
    this.heading.textContent = text;
  }

  addButton(text, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.padding = '10px 20px';
    button.style.fontSize = '1.2rem';
    button.style.cursor = 'pointer';
    button.style.marginTop = '10px';
    button.onclick = onClick;
    this.buttonContainer.appendChild(button);
    return button;
  }

  clearButtons() {
    this.buttonContainer.innerHTML = '';
  }

  show() {
    this.overlay.style.display = 'flex';
  }
  hide() {
    this.overlay.style.display = 'none';
    this.clearButtons();
  }
}
