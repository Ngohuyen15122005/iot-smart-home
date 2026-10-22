function setActivePage(page) {
  document.querySelectorAll('.side-nav a').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });
}

function logout() {
  localStorage.removeItem('iotLoggedIn');
  window.location.href = 'index.html';
}

// Hiển thị tên người dùng từ phiên đăng nhập (đồng bộ từ MySQL / localStorage)
const storedUser = localStorage.getItem('iotUsername') || 'Ngô Thị Thanh Huyền';
const displayShortName = storedUser.split(' ').pop() || 'Huyền';
document.querySelectorAll('#topUsername').forEach(el => {
  el.textContent = displayShortName;
});
