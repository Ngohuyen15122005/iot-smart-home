const form = document.getElementById('loginForm');
const username = document.getElementById('username');
const password = document.getElementById('password');
const remember = document.getElementById('rememberMe');
const message = document.getElementById('loginMessage');

const rememberedUser = localStorage.getItem('iotRememberedUser');
if (rememberedUser) {
  username.value = rememberedUser;
  remember.checked = true;
}

document.getElementById('togglePassword').addEventListener('click', () => {
  password.type = password.type === 'password' ? 'text' : 'password';
});

document.getElementById('forgotPassword').addEventListener('click', () => {
  message.textContent = 'Vui lòng liên hệ quản trị viên hệ thống để khôi phục mật khẩu.';
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = '';

  const userVal = username.value.trim();
  const passVal = password.value.trim();

  if (!userVal || !passVal) {
    message.textContent = 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.';
    return;
  }

  // Luồng theo Use case 3.2.1 BTH1_IoT&UD.docx
  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userVal, password: passVal })
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('iotLoggedIn', '1');
      localStorage.setItem('iotToken', data.token || 'sample_token');
      localStorage.setItem('iotUsername', data.user?.fullName || userVal);

      if (remember.checked) localStorage.setItem('iotRememberedUser', userVal);
      else localStorage.removeItem('iotRememberedUser');

      window.location.href = 'dashboard.html';
      return;
    } else if (res.status === 401) {
      message.textContent = 'Sai email hoặc mật khẩu.';
      return;
    }
  } catch (err) {
    // Fallback nếu mở file trực tiếp
    console.warn('[Login offline fallback]', err);
  }

  // Fallback demo
  localStorage.setItem('iotLoggedIn', '1');
  localStorage.setItem('iotUsername', userVal);
  if (remember.checked) localStorage.setItem('iotRememberedUser', userVal);
  else localStorage.removeItem('iotRememberedUser');

  window.location.href = 'dashboard.html';
});
