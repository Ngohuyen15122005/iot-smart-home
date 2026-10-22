setActivePage('database');

let currentTable = 'datasensor';
let currentPage = 1;
let perPage = 10;
let tableMetadata = [];

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
  }, 3500);
}

// 1. Lấy danh sách các bảng từ MySQL
async function loadTablesSummary() {
  const container = document.getElementById('dbTableCards');
  try {
    const res = await fetch('/api/v1/database/tables');
    if (res.ok) {
      const data = await res.json();
      tableMetadata = data.tables || [];
      renderTableCards();
    }
  } catch (err) {
    console.error('[MySQL tables error]', err);
  }
}

function renderTableCards() {
  const container = document.getElementById('dbTableCards');
  if (!container || !tableMetadata.length) return;

  container.innerHTML = tableMetadata.map(t => `
    <div class="db-card ${t.name === currentTable ? 'active' : ''}" onclick="switchTable('${t.name}')">
      <div class="db-card-name">
        <span>${t.name}</span>
        <span class="db-card-badge">${t.count}</span>
      </div>
      <div class="db-card-desc">${t.desc || t.title}</div>
    </div>
  `).join('');
}

// 2. Chuyển đổi bảng
window.switchTable = function(tableName) {
  currentTable = tableName;
  currentPage = 1;
  renderTableCards();
  loadTableData();
};

window.refreshCurrentTable = function() {
  showToast('Đang làm mới dữ liệu từ MySQL...', 'info');
  loadTablesSummary();
  loadTableData();
};

// 3. Lấy dữ liệu và cấu trúc cột của bảng hiện tại
async function loadTableData() {
  const titleEl = document.getElementById('currentTableTitle');
  const countBadgeEl = document.getElementById('currentTableCountBadge');
  const schemaTagsEl = document.getElementById('dbSchemaTags');
  const thead = document.getElementById('dbTableHead');
  const tbody = document.getElementById('dbTableBody');
  const recordsText = document.getElementById('dbRecordsText');
  const pagesContainer = document.getElementById('dbPages');

  if (titleEl) titleEl.textContent = `Bảng MySQL: ${currentTable}`;

  try {
    const res = await fetch(`/api/v1/database/table?name=${currentTable}&page=${currentPage}&limit=${perPage}`);
    if (!res.ok) throw new Error('Không thể tải dữ liệu bảng');
    const data = await res.json();

    if (countBadgeEl) countBadgeEl.textContent = `${data.total} bản ghi`;

    // Render cấu trúc cột
    if (schemaTagsEl && data.columns) {
      schemaTagsEl.innerHTML = data.columns.map(col => `
        <span class="db-schema-tag">
          <strong>${col.field}</strong>: ${col.type} ${col.key ? '(' + col.key + ')' : ''}
        </span>
      `).join(' ');
    }

    // Render thead
    if (thead && data.columns) {
      thead.innerHTML = `<tr>${data.columns.map(c => `<th>${c.field}</th>`).join('')}</tr>`;
    }

    // Render tbody
    if (tbody) {
      if (!data.rows || data.rows.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="${data.columns.length || 1}">Bảng hiện chưa có dữ liệu nào.</td></tr>`;
      } else {
        tbody.innerHTML = data.rows.map(row => `
          <tr>
            ${data.columns.map(c => {
              let val = row[c.field];
              if (val === null || val === undefined) val = '<em style="color:#64748b;">NULL</em>';
              else if (typeof val === 'object') val = JSON.stringify(val);
              return `<td>${val}</td>`;
            }).join('')}
          </tr>
        `).join('');
      }
    }

    // Render footer
    const start = (currentPage - 1) * perPage;
    const from = data.total ? start + 1 : 0;
    const to = Math.min(start + (data.rows ? data.rows.length : 0), data.total);
    if (recordsText) recordsText.textContent = `${from}-${to} / ${data.total} dòng trong MySQL`;

    // Render pagination
    if (pagesContainer) {
      const totalPages = data.totalPages || 1;
      pagesContainer.innerHTML = `
        <button class="page-btn" data-page="prev" ${currentPage <= 1 ? 'disabled style="opacity:0.4"' : ''}>&lt;</button>
        ${Array.from({length: totalPages}, (_, i) => `
          <button class="page-btn ${currentPage === i + 1 ? 'active' : ''}" data-page="${i + 1}">${i + 1}</button>
        `).join('')}
        <button class="page-btn" data-page="next" ${currentPage >= totalPages ? 'disabled style="opacity:0.4"' : ''}>&gt;</button>
      `;

      pagesContainer.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.dataset.page;
          if (target === 'prev' && currentPage > 1) currentPage--;
          else if (target === 'next' && currentPage < totalPages) currentPage++;
          else if (!isNaN(target)) currentPage = Number(target);
          loadTableData();
        });
      });
    }

  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444; padding:20px;">Lỗi kết nối MySQL: ${err.message}</td></tr>`;
  }
}

const linesSelect = document.getElementById('dbLinesSelect');
if (linesSelect) {
  linesSelect.addEventListener('change', () => {
    perPage = Number(linesSelect.value);
    currentPage = 1;
    loadTableData();
  });
}

// Khởi chạy
loadTablesSummary();
loadTableData();
