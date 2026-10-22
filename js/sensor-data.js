setActivePage('sensor');

let sensorData = [];

let filtered = [...sensorData];
let currentPage = 1;
let perPage = 10;
let totalServerRecords = 0;

const queryInput = document.getElementById('sensorQuery');
const filterSelect = document.getElementById('sensorFilter');
const linesSelect = document.getElementById('sensorLines');

function normalize(text) {
  return String(text).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function fetchSensorDataFromServer() {
  const mode = filterSelect.value;
  const q = queryInput.value.trim();

  try {
    const params = new URLSearchParams({
      type: mode,
      q: q,
      page: currentPage,
      limit: perPage
    });
    const res = await fetch(`/api/v1/sensors/data?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      totalServerRecords = data.total;
      renderTableRows(data.data, data.total, data.totalPages);
      return true;
    }
  } catch {}
  return false;
}

function renderTableRows(rows, totalCount, totalPagesCount) {
  const tbody = document.getElementById('sensorRows');
  tbody.innerHTML = rows.length
    ? rows.map(row => `<tr><td>#${row.id}</td><td>${row.type}</td><td>${row.value}</td><td>${row.time}</td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="4">Không có dữ liệu phù hợp.</td></tr>';

  const start = (currentPage - 1) * perPage;
  const from = totalCount ? start + 1 : 0;
  const to = Math.min(start + rows.length, totalCount);
  document.getElementById('sensorRecords').textContent = `${from}-${to}/${totalCount}`;

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
  const pages = document.getElementById('sensorPages');
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
          loadSensorData();
        }
      } else if (target === 'next') {
        if (currentPage < totalPages) {
          currentPage++;
          loadSensorData();
        }
      } else {
        const pageNum = Number(target);
        if (pageNum !== currentPage) {
          currentPage = pageNum;
          loadSensorData();
        }
      }
    });
  });
}

function renderLocalSensor() {
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * perPage;
  const rows = filtered.slice(start, start + perPage);
  renderTableRows(rows, filtered.length, totalPages);
}

async function loadSensorData() {
  const ok = await fetchSensorDataFromServer();
  if (!ok) {
    applyLocalSensorFilter();
  }
}

function applyLocalSensorFilter() {
  const mode = filterSelect.value;
  const q = normalize(queryInput.value);

  filtered = sensorData.filter(row => {
    const typeMatches = {
      temperature: row.type === 'Nhiệt độ',
      humidity: row.type === 'Độ ẩm',
      light: row.type === 'Ánh sáng'
    };
    if (mode === 'temperature' || mode === 'humidity' || mode === 'light') {
      return typeMatches[mode] && (!q || normalize(row.rawValue).includes(q) || normalize(row.value).includes(q));
    }
    if (mode === 'time') return normalize(row.time).includes(q);
    return !q || [row.type, row.value, row.rawValue, row.time].some(value => normalize(value).includes(q));
  });

  renderLocalSensor();
}

document.getElementById('sensorSearch').addEventListener('click', () => {
  currentPage = 1;
  loadSensorData();
});
queryInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    currentPage = 1;
    loadSensorData();
  }
});
linesSelect.addEventListener('change', () => {
  perPage = Number(linesSelect.value);
  currentPage = 1;
  loadSensorData();
});
document.getElementById('sensorReset').addEventListener('click', () => {
  filterSelect.value = 'all';
  queryInput.value = '';
  currentPage = 1;
  loadSensorData();
});

// Kết nối realtime SSE để tự động cập nhật bảng khi cảm biến nhận dữ liệu mới
if (window.EventSource) {
  const sse = new EventSource('/api/v1/stream');
  sse.addEventListener('sensor_update', (e) => {
    try {
      const data = JSON.parse(e.data);
      loadSensorData();
    } catch {}
  });
}

loadSensorData();
