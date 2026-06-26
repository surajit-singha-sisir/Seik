fetch('/api/health')
  .then((r) => r.json())
  .then((data) => {
    const dot = document.getElementById('health-dot');
    const text = document.getElementById('health-text');
    const meta = document.getElementById('health-meta');
    dot.className = 'dot dot-ok';
    text.textContent = `${data.app} API is running`;
    meta.textContent = 'GET /api/health → 200 OK';
  })
  .catch(() => {
    const dot = document.getElementById('health-dot');
    const text = document.getElementById('health-text');
    dot.className = 'dot dot-fail';
    text.textContent = 'API unreachable';
  });
