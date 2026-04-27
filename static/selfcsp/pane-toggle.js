document.addEventListener('DOMContentLoaded', () => {
  const toggleButtons = document.querySelectorAll('.pane-toggle-button');

  toggleButtons.forEach(button => {
    const pane = button.closest('.pane');
    const content = pane.querySelector('.pane-content');
    const savedState = localStorage.getItem(`pane-${pane.id}`);

    if (savedState === 'collapsed') {
      content.classList.add('collapsed');
      button.textContent = '+';
    } else {
      button.textContent = '−';
    }

    button.addEventListener('click', (e) => {
      e.preventDefault();
      content.classList.toggle('collapsed');
      button.textContent = content.classList.contains('collapsed') ? '+' : '−';

      localStorage.setItem(
        `pane-${pane.id}`,
        content.classList.contains('collapsed') ? 'collapsed' : 'expanded'
      );
    });
  });
});
