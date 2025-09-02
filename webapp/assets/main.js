export function mount() {
  const app = document.getElementById('app');
  const p = document.createElement('p');
  p.textContent = `Loaded at ${new Date().toLocaleTimeString()}`;
  app.appendChild(p);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
