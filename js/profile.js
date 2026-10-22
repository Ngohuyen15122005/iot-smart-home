setActivePage('profile');

const DEFAULT_POSTMAN_URL = 'https://documenter.getpostman.com/view/iot-smart-home-bth1';

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-message ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

let profileData = {
  fullName: 'Ngô Thị Thanh Huyền',
  studentId: 'B23DCAT140',
  email: 'ngohuyen15122005@gmail.com',
  phone: '1234567890',
  role: 'Quản lý hệ thống Smart Home IoT, giám sát cảm biến và điều khiển thiết bị',
  avatarUrl: '',
  githubUrl: 'https://github.com/huyenngoiot/iot_smart_home',
  postmanUrl: DEFAULT_POSTMAN_URL,
  figmaUrl: 'https://www.figma.com/design/5eoJQUyOmW9yYLKecgPLzn/Figma-UI-kit---Smart-Home-Dashboard--Community---Community-',
  reportPdfUrl: 'BTH1_IoT&UD.docx'
};

// 1. Tải thông tin Profile từ MySQL Server
async function loadProfileData() {
  try {
    const res = await fetch('/api/v1/users/profile');
    if (res.ok) {
      const data = await res.json();
      profileData = { ...profileData, ...data };
    }
  } catch (err) {
    console.warn('[Profile fetch warn]', err);
  }

  // Fallback từ localStorage nếu có
  const localAvatar = localStorage.getItem('iot_avatar_url');
  if (localAvatar && !profileData.avatarUrl) {
    profileData.avatarUrl = localAvatar;
  }

  renderProfileUI();
}

function renderProfileUI() {
  // Họ tên
  const fnLeft = document.getElementById('profileFullNameLeft');
  const fnInfo = document.getElementById('profileFullName');
  if (fnLeft) fnLeft.textContent = profileData.fullName;
  if (fnInfo) fnInfo.textContent = profileData.fullName;

  // Mã sinh viên
  const stLeft = document.getElementById('profileStudentIdLeft');
  const stInfo = document.getElementById('profileStudentId');
  if (stLeft) stLeft.textContent = profileData.studentId;
  if (stInfo) stInfo.textContent = profileData.studentId;

  // Email & Phone & Role
  const emailEl = document.getElementById('profileEmail');
  const phoneEl = document.getElementById('profilePhone');
  const roleEl = document.getElementById('profileRoleLeft');
  if (emailEl) emailEl.textContent = profileData.email;
  if (phoneEl) phoneEl.textContent = profileData.phone;
  if (roleEl) roleEl.textContent = profileData.role;

  // Avatar
  const avatarDisplay = document.getElementById('avatarDisplay');
  if (avatarDisplay) {
    if (profileData.avatarUrl) {
      avatarDisplay.innerHTML = `<img src="${profileData.avatarUrl}" alt="Avatar">`;
    } else {
      avatarDisplay.innerHTML = `<span>Avatar</span>`;
    }
  }

  // Postman Link
  const postmanDocLink = document.getElementById('postmanDocLink');
  const postmanUrlText = document.getElementById('postmanUrlText');
  const pUrl = profileData.postmanUrl || DEFAULT_POSTMAN_URL;
  if (postmanDocLink) postmanDocLink.href = pUrl;
  if (postmanUrlText) postmanUrlText.textContent = pUrl;

  // Github Link
  const ghLink = document.getElementById('githubLink');
  if (ghLink && profileData.githubUrl) ghLink.href = profileData.githubUrl;

  // Figma Link
  const figmaLink = document.getElementById('figmaLink');
  if (figmaLink && profileData.figmaUrl) figmaLink.href = profileData.figmaUrl;

  // Report Link
  const reportLink = document.getElementById('reportLink');
  const reportSub = document.getElementById('reportSubText');
  if (reportLink && profileData.reportPdfUrl) {
    reportLink.href = profileData.reportPdfUrl;
    reportLink.download = profileData.reportPdfUrl;
    if (reportSub) reportSub.textContent = profileData.reportPdfUrl;
  }
}
loadProfileData();

// ------------------------------------------------------------
// 2. CHÈN / ĐỔI ẢNH ĐẠI DIỆN AVATAR
// ------------------------------------------------------------
const avatarFileInput = document.getElementById('avatarFileInput');
if (avatarFileInput) {
  avatarFileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Vui lòng chọn file hình ảnh hợp lệ (.png, .jpg, .jpeg, .webp)!', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Img = reader.result;
      profileData.avatarUrl = base64Img;
      localStorage.setItem('iot_avatar_url', base64Img);
      renderProfileUI();

      try {
        await fetch('/api/v1/users/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarUrl: base64Img })
        });
        showToast('Đã cập nhật ảnh đại diện thành công!', 'success');
      } catch {
        showToast('Đã lưu ảnh đại diện trên trình duyệt!', 'info');
      }
    };
    reader.readAsDataURL(file);
  });
}

// ------------------------------------------------------------
// 3. MODAL CHỈNH SỬA THÔNG TIN CÁ NHÂN & LIÊN KẾT
// ------------------------------------------------------------
const editProfileModal = document.getElementById('editProfileModal');
const btnOpenEditProfileModal = document.getElementById('btnOpenEditProfileModal');
const btnCloseEditProfileModal = document.getElementById('btnCloseEditProfileModal');
const btnCancelEditProfileModal = document.getElementById('btnCancelEditProfileModal');
const btnSaveProfileInfo = document.getElementById('btnSaveProfileInfo');

const inputEditFullName = document.getElementById('inputEditFullName');
const inputEditStudentId = document.getElementById('inputEditStudentId');
const inputEditEmail = document.getElementById('inputEditEmail');
const inputEditPhone = document.getElementById('inputEditPhone');
const inputEditRole = document.getElementById('inputEditRole');
const inputEditGithub = document.getElementById('inputEditGithub');
const inputEditFigma = document.getElementById('inputEditFigma');
const inputEditReport = document.getElementById('inputEditReport');

function openEditModal() {
  if (!editProfileModal) return;
  if (inputEditFullName) inputEditFullName.value = profileData.fullName || '';
  if (inputEditStudentId) inputEditStudentId.value = profileData.studentId || '';
  if (inputEditEmail) inputEditEmail.value = profileData.email || '';
  if (inputEditPhone) inputEditPhone.value = profileData.phone || '';
  if (inputEditRole) inputEditRole.value = profileData.role || '';
  if (inputEditGithub) inputEditGithub.value = profileData.githubUrl || '';
  if (inputEditFigma) inputEditFigma.value = profileData.figmaUrl || '';
  if (inputEditReport) inputEditReport.value = profileData.reportPdfUrl || '';

  editProfileModal.classList.add('open');
}

function closeEditModal() {
  if (editProfileModal) editProfileModal.classList.remove('open');
}

if (btnOpenEditProfileModal) btnOpenEditProfileModal.addEventListener('click', openEditModal);
if (btnCloseEditProfileModal) btnCloseEditProfileModal.addEventListener('click', closeEditModal);
if (btnCancelEditProfileModal) btnCancelEditProfileModal.addEventListener('click', closeEditModal);

if (editProfileModal) {
  editProfileModal.addEventListener('click', (e) => {
    if (e.target === editProfileModal) closeEditModal();
  });
}

if (btnSaveProfileInfo) {
  btnSaveProfileInfo.addEventListener('click', async () => {
    const updated = {
      fullName: (inputEditFullName?.value || '').trim() || profileData.fullName,
      studentId: (inputEditStudentId?.value || '').trim() || profileData.studentId,
      email: (inputEditEmail?.value || '').trim() || profileData.email,
      phone: (inputEditPhone?.value || '').trim() || profileData.phone,
      role: (inputEditRole?.value || '').trim() || profileData.role,
      githubUrl: (inputEditGithub?.value || '').trim() || profileData.githubUrl,
      figmaUrl: (inputEditFigma?.value || '').trim() || profileData.figmaUrl,
      reportUrl: (inputEditReport?.value || '').trim() || profileData.reportPdfUrl
    };

    profileData = { ...profileData, ...updated, reportPdfUrl: updated.reportUrl };
    localStorage.setItem('iotUsername', updated.fullName);

    try {
      await fetch('/api/v1/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast('Đã lưu thông tin hồ sơ vào MySQL thành công!', 'success');
    } catch {
      showToast('Đã lưu thông tin vào bộ nhớ tạm!', 'info');
    }

    renderProfileUI();
    closeEditModal();
  });
}

// ------------------------------------------------------------
// 4. MODAL GẮN LINK POSTMAN
// ------------------------------------------------------------
const postmanModal = document.getElementById('postmanModal');
const postmanInput = document.getElementById('postmanInput');
const btnOpenPostmanModal = document.getElementById('btnOpenPostmanModal');
const btnClosePostmanModal = document.getElementById('btnClosePostmanModal');
const btnCancelPostmanModal = document.getElementById('btnCancelPostmanModal');
const btnSavePostmanLink = document.getElementById('btnSavePostmanLink');

function openPostmanModal() {
  if (!postmanModal || !postmanInput) return;
  postmanInput.value = profileData.postmanUrl || DEFAULT_POSTMAN_URL;
  postmanModal.classList.add('open');
  postmanInput.focus();
}

function closePostmanModal() {
  if (postmanModal) postmanModal.classList.remove('open');
}

if (btnOpenPostmanModal) btnOpenPostmanModal.addEventListener('click', openPostmanModal);
if (btnClosePostmanModal) btnClosePostmanModal.addEventListener('click', closePostmanModal);
if (btnCancelPostmanModal) btnCancelPostmanModal.addEventListener('click', closePostmanModal);

if (postmanModal) {
  postmanModal.addEventListener('click', (e) => {
    if (e.target === postmanModal) closePostmanModal();
  });
}

if (btnSavePostmanLink) {
  btnSavePostmanLink.addEventListener('click', async () => {
    let url = (postmanInput.value || '').trim();
    if (!url) url = DEFAULT_POSTMAN_URL;

    profileData.postmanUrl = url;
    localStorage.setItem('postman_doc_url', url);

    try {
      await fetch('/api/v1/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postmanUrl: url })
      });
      showToast('Đã gắn liên kết Postman Documentation thành công!', 'success');
    } catch {
      showToast('Đã lưu liên kết Postman!', 'info');
    }

    renderProfileUI();
    closePostmanModal();
  });
}
