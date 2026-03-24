// Theme toggle
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('omh-theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'light' ? '\u2600' : '\u263E';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// Load saved theme (default: dark)
const savedTheme = localStorage.getItem('omh-theme');
setTheme(savedTheme || 'dark');

// Attach click handler
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.addEventListener('click', toggleTheme);

  // Sidebar section collapse
  document.querySelectorAll('.sidebar-section-title').forEach(title => {
    title.addEventListener('click', () => {
      title.parentElement.classList.toggle('collapsed');
    });
  });

  // Active sidebar link
  const currentHash = window.location.hash;
  if (currentHash) {
    const activeLink = document.querySelector(`.sidebar-link[href="${currentHash}"]`);
    if (activeLink) activeLink.classList.add('active');
  }
});
