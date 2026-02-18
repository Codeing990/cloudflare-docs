const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const message = document.getElementById('message');

async function submitAuth(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Auth failed');
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  location.href = '/game.html';
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = new FormData(loginForm);
      await submitAuth('/api/auth/login', Object.fromEntries(form.entries()));
    } catch (err) {
      message.textContent = err.message;
    }
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const form = new FormData(registerForm);
      await submitAuth('/api/auth/register', Object.fromEntries(form.entries()));
    } catch (err) {
      message.textContent = err.message;
    }
  });
}
