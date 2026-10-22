setActivePage('history');

let historyData = [];

// Nạp thêm các hành động mới phát sinh từ localStorage nếu có
try {
  const localItems = JSON.parse(localStorage.getItem('iot_action_history') || '[]');
  if (localItems.length) {
    historyData = [...localItems, ...historyData];
  }
} catch {}

let filtered = [...historyData];
let currentPage = 1;
let perPage = 10;

const deviceSelect = document.getElementById('historyDevice');
const actionSelect = document.getElementById('historyAction');
const statusSelect = document.getElementById('historyStatus');
const timeInput = document.getElementById('historyTime');
const linesSelect = document.getElementById('historyLines');

function normalize(text) {
  return String(text).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function statusDot(status) {
  const cls = status === 'Thành công' ? 'success' : status === 'Lỗi' ? 'error' : 'pending';
  return `<span class="history-status"><i class="${cls}"></i>${status}</span>`;
}

async function fetchHistoryFromServer() {
  const device = deviceSelect.value;
  const action = actionSelect.value;
  const status = statusSelect.value;
  const time = timeInput.value.trim();

  try {
    const params = new URLSearchParams({
      device,
      action,
      status,
      time,
      page: currentPage,
      limit: perPage
    });
    const res = await fetch(`/api/v1/actions/history?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      renderTableRows(data.data, data.total, data.totalPages);
      return true;
    }
  } catch {}
  return false;
}

//Hiển thị bảng lịch sử
function renderTableRows(rows, totalCount, totalPagesCount) {
  const tbody = document.getElementById('historyRows');
  tbody.innerHTML = rows.length
    ? rows.map(row => `<tr><td>#${row.id}</td><td>${row.device}</td><td>${row.action}</td><td>${statusDot(row.status)}</td><td>${row.time}</td><td>${row.user || 'Ngô Thị Thanh Huyền'}</td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="6">Không có lịch sử phù hợp.</td></tr>';

  const start = (currentPage - 1) * perPage;
  const from = totalCount ? start + 1 : 0;
  const to = Math.min(start + rows.length, totalCount);
  document.getElementById('historyRecords').textContent = `${from}-${to}/${totalCount}`;

  renderPagination(totalPagesCount);
}

function generatePaginationItems(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, '...', total];
  } else if (current >= total - 3) {
    return [1, '...', total - 3, total - 2, total - 1, total];
  } else {
    return [1, '...', current - 1, current, current + 1, '...', total];
  }
}

function renderPagination(totalPages) {
  const pages = document.getElementById('historyPages');
  if (!pages) return;
  if (totalPages <= 1) {
    pages.innerHTML = '';
    return;
  }

  const items = generatePaginationItems(currentPage, totalPages);
  let html = `<button class="page-btn" data-page="prev" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Trang trước">&lt;</button>`;

  items.forEach(item => {
    if (item === '...') {
      html += `<span class="page-dots">...</span>`;
    } else {
      const activeCls = (item === currentPage) ? 'active' : '';
      html += `<button class="page-btn ${activeCls}" data-page="${item}">${item}</button>`;
    }
  });

  html += `<button class="page-btn" data-page="next" ${currentPage >= totalPages ? 'disabled' : ''} aria-label="Trang sau">&gt;</button>`;
  pages.innerHTML = html;

  pages.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const target = btn.dataset.page;
      if (target === 'prev') {
        if (currentPage > 1) {
          currentPage--;
          loadHistoryData();
        }
      } else if (target === 'next') {
        if (currentPage < totalPages) {
          currentPage++;
          loadHistoryData();
        }
      } else {
        const pageNum = Number(target);
        if (pageNum !== currentPage) {
          currentPage = pageNum;
          loadHistoryData();
        }
      }
    });
  });
}

function renderLocalHistory() {
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * perPage;
  const rows = filtered.slice(start, start + perPage);
  renderTableRows(rows, filtered.length, totalPages);
}

async function loadHistoryData() {
  const ok = await fetchHistoryFromServer();
  if (!ok) {
    applyLocalHistoryFilter();
  }
}

function applyLocalHistoryFilter() {
  const device = deviceSelect.value;
  const action = actionSelect.value;
  const status = statusSelect.value;
  const time = normalize(timeInput.value);

  filtered = historyData.filter(row =>
    (!device || row.device === device) &&
    (!action || row.action === action) &&
    (!status || row.status === status) &&
    (!time || normalize(row.time).includes(time))
  );

  renderLocalHistory();
}

document.getElementById('historySearch').addEventListener('click', () => {
  currentPage = 1;
  loadHistoryData();
});
timeInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    currentPage = 1;
    loadHistoryData();
  }
});
linesSelect.addEventListener('change', () => {
  perPage = Number(linesSelect.value);
  currentPage = 1;
  loadHistoryData();
});
document.getElementById('historyReset').addEventListener('click', () => {
  deviceSelect.value = '';
  actionSelect.value = '';
  statusSelect.value = '';
  timeInput.value = '';
  currentPage = 1;
  loadHistoryData();
});

loadHistoryData();
