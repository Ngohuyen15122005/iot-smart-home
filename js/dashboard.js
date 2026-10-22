/**
 * Smart Home IoT - Dashboard Script (Nhóm 12)
 * Sinh viên: Ngô Thị Thanh Huyền (B23DCAT140)
 * 
 * - Hoàn toàn sử dụng dữ liệu thực từ MySQL và phần cứng ESP8266 qua REST API & SSE
 * - Không sử dụng dữ liệu tĩnh gán cứng (hardcoded)
 * - Nút xoay loading (spinner) khi bật/tắt thiết bị theo yêu cầu BTH1 (2000ms delay)
 * - Realtime push SSE cho cảm biến, trạng thái thiết bị và cảnh báo mất tín hiệu
 */

setActivePage('dashboard');

// Hiển thị tên người dùng đã đăng nhập
const savedUsername = localStorage.getItem('iotUsername') || 'Ngô Thị Thanh Huyền';
const topUserEl = document.getElementById('topUsername');
if (topUserEl) topUserEl.textContent = savedUsername.split(' ').pop() || 'Huyền';

// ------------------------------------------------------------
// 1. HÀM THÔNG BÁO TOAST NOTIFICATION
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// 2. KHỞI TẠO BIỂU ĐỒ SENSOR CHART VỚI DỮ LIỆU ĐỘNG TỪ MYSQL
// ------------------------------------------------------------
let sensorChart = null;

const axisArrowsPlugin = {
  id: 'axisArrows',
  afterDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.y || !scales.y1) return;

    ctx.save();
    const topY = chartArea.top - 20;
    const arrowH = 7;
    const arrowW = 4;

    // Trục trái: °C / %
    const leftX = chartArea.left;
    ctx.strokeStyle = '#d6e2ec';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(leftX, chartArea.top);
    ctx.lineTo(leftX, topY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(leftX - arrowW, topY + arrowH);
    ctx.lineTo(leftX, topY);
    ctx.lineTo(leftX + arrowW, topY + arrowH);
    ctx.stroke();

    ctx.font = '700 12px Arial, Helvetica, sans-serif';
    ctx.textBaseline = 'bottom';
    const degC = '°C';
    const slash = ' / ';
    const pct = '%';
    const wC = ctx.measureText(degC).width;
    const wSlash = ctx.measureText(slash).width;
    const startX = leftX - 18;
    ctx.textAlign = 'left';

    ctx.fillStyle = '#f39a1f';
    ctx.fillText(degC, startX, topY - 4);
    ctx.fillStyle = '#78889b';
    ctx.fillText(slash, startX + wC, topY - 4);
    ctx.fillStyle = '#2f80ed';
    ctx.fillText(pct, startX + wC + wSlash, topY - 4);

    // Trục phải: LDR
    const rightX = chartArea.right;
    ctx.beginPath();
    ctx.moveTo(rightX, chartArea.top);
    ctx.lineTo(rightX, topY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rightX - arrowW, topY + arrowH);
    ctx.lineTo(rightX, topY);
    ctx.lineTo(rightX + arrowW, topY + arrowH);
    ctx.stroke();

    ctx.font = '700 12px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e5a823';
    ctx.fillText('LDR', rightX + 8, topY - 4);
    ctx.restore();
  }
};

function initChart() {
  const canvas = document.getElementById('sensorChart');
  if (!canvas || !window.Chart) return;

  sensorChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temperature',
          data: [],
          yAxisID: 'y',
          borderColor: '#f39a1f',
          backgroundColor: '#f39a1f',
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#f39a1f',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: 2
        },
        {
          label: 'Humidity',
          data: [],
          yAxisID: 'y',
          borderColor: '#2f80ed',
          backgroundColor: '#2f80ed',
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#2f80ed',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: 2
        },
        {
          label: 'Light',
          data: [],
          yAxisID: 'y1',
          borderColor: '#e5a823',
          backgroundColor: '#e5a823',
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#e5a823',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: 2
        }
      ]
    },
    plugins: [axisArrowsPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'center',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 24,
            font: { size: 12, weight: '700', family: 'Arial, sans-serif' }
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleColor: '#ffffff',
          bodyColor: '#e2e8f0',
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 12 },
          padding: 10,
          callbacks: {
            title: (items) => 'Thời gian: ' + items[0].label,
            label: (context) => {
              const label = context.dataset.label || '';
              const val = context.parsed.y;
              if (val === null || val === undefined) return ` ${label}: Không có`;
              if (label === 'Temperature') return ` Nhiệt độ: ${val.toFixed(1)} °C`;
              if (label === 'Humidity') return ` Độ ẩm: ${val.toFixed(1)} %`;
              if (label === 'Light') return ` Ánh sáng: ${Math.round(val)} LDR`;
              return ` ${label}: ${val}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#ebf1f6' },
          ticks: {
            maxTicksLimit: 8,
            color: '#1e293b',
            font: { size: 11, weight: '500' }
          },
          border: { display: true, color: '#d6e2ec', width: 1.2 }
        },
        y: {
          type: 'linear',
          position: 'left',
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            color: '#1e293b',
            font: { size: 11, weight: '500' }
          },
          grid: { color: '#ebf1f6' },
          border: { display: true, color: '#d6e2ec', width: 1.2 }
        },
        y1: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 1000,
          ticks: {
            stepSize: 200,
            color: '#1e293b',
            font: { size: 11, weight: '500' }
          },
          grid: { drawOnChartArea: false },
          border: { display: true, color: '#d6e2ec', width: 1.2 }
        }
      }
    }
  });
}
initChart();

// Nạp dữ liệu biểu đồ từ MySQL
async function loadChartData() {
  try {
    const res = await fetch('/api/v1/dashboard/chart');
    if (!res.ok) return;
    const data = await res.json();
    if (sensorChart && data.labels && data.labels.length > 0) {
      sensorChart.data.labels = data.labels;
      sensorChart.data.datasets[0].data = data.temperature;
      sensorChart.data.datasets[1].data = data.humidity;
      sensorChart.data.datasets[2].data = data.light;
      sensorChart.update('none');
    }
  } catch (err) {
    console.warn('[Dashboard Chart load error]', err);
  }
}

// ------------------------------------------------------------
// 3. CẬP NHẬT GIAO DIỆN THÔNG SỐ CẢM BIẾN & THIẾT BỊ
// ------------------------------------------------------------
function updateSensorUI(temp, hum, light, isCovered) {
  const tempEl = document.getElementById('tempNow');
  const humEl = document.getElementById('humNow');
  const lightEl = document.getElementById('lightNow');

  const tempStatus = document.getElementById('tempStatus');
  const humStatus = document.getElementById('humStatus');
  const lightStatus = document.getElementById('lightStatus');

  if (temp !== null && temp !== undefined && !isNaN(temp)) {
    tempEl.textContent = Number(temp).toFixed(1);
    if (temp > 35) {
      tempStatus.textContent = 'High';
      tempStatus.className = 'status-badge critical';
    } else if (temp < 18) {
      tempStatus.textContent = 'Low';
      tempStatus.className = 'status-badge warning';
    } else {
      tempStatus.textContent = 'Normal';
      tempStatus.className = 'status-badge normal';
    }
  }

  if (hum !== null && hum !== undefined && !isNaN(hum)) {
    humEl.textContent = Number(hum).toFixed(1);
    if (hum > 80) {
      humStatus.textContent = 'High';
      humStatus.className = 'status-badge warning';
    } else if (hum < 40) {
      humStatus.textContent = 'Dry';
      humStatus.className = 'status-badge warning';
    } else {
      humStatus.textContent = 'Normal';
      humStatus.className = 'status-badge normal';
    }
  }

  if (light !== null && light !== undefined && !isNaN(light)) {
    lightEl.textContent = Math.round(light);
    if (isCovered || light < 150) {
      lightStatus.textContent = 'Covered (Tối)';
      lightStatus.className = 'status-badge warning';
    } else {
      lightStatus.textContent = 'Normal';
      lightStatus.className = 'status-badge normal';
    }
  }
}

function updateDeviceUI(state, isLoading = false) {
  const lightSwitch = document.getElementById('lightSwitch');
  const stateText = document.getElementById('deviceStateText');
  const bulb = document.getElementById('deviceBulbLight');

  if (!lightSwitch || !stateText) return;

  if (isLoading) {
    lightSwitch.className = 'switch loading';
    lightSwitch.disabled = true;
    stateText.className = 'device-state pending';
    stateText.innerHTML = '<span class="state-spinner"></span> Đang xử lý...';
    return;
  }

  lightSwitch.disabled = false;
  const isTurnedOn = (state === 'ON');

  lightSwitch.className = 'switch ' + (isTurnedOn ? 'on' : 'off');
  stateText.className = 'device-state ' + (isTurnedOn ? 'on' : 'off');
  stateText.textContent = isTurnedOn ? 'ON' : 'OFF';

  if (bulb) {
    bulb.className = 'device-bulb ' + (isTurnedOn ? 'on' : 'off');
  }
}

function updateHardwareStatusUI(online, message) {
  const pill = document.getElementById('hardwareStatusPill');
  const pillText = document.getElementById('hardwareStatusText');
  const banner = document.getElementById('hardwareAlertBanner');
  const bannerMsg = document.getElementById('hardwareAlertMsg');

  const cards = [document.getElementById('tempCard'), document.getElementById('humCard'), document.getElementById('lightCard')];

  if (online) {
    if (pill) {
      pill.className = 'hardware-status-pill online';
      if (pillText) pillText.textContent = 'ESP8266: Trực tuyến';
    }
    if (banner) {
      banner.classList.remove('show');
    }
    cards.forEach(card => card && card.classList.remove('offline-card'));
  } else {
    if (pill) {
      pill.className = 'hardware-status-pill offline';
      if (pillText) pillText.textContent = 'ESP8266: Mất tín hiệu';
    }
    if (banner) {
      banner.classList.add('show');
      if (bannerMsg && message) bannerMsg.textContent = message;
    }
    cards.forEach(card => card && card.classList.add('offline-card'));
  }
}

// ------------------------------------------------------------
// 4. ĐIỀU KHIỂN BẬT / TẮT ĐÈN VỚI HIỆU ỨNG LOADING (2000MS DELAY)
// ------------------------------------------------------------
let isDeviceProcessing = false;

async function controlLight() {
  if (isDeviceProcessing) {
    showToast('Thiết bị đang trong quá trình xử lý lệnh, vui lòng đợi!', 'warning');
    return;
  }

  const lightSwitch = document.getElementById('lightSwitch');
  const currentState = lightSwitch.classList.contains('on') ? 'ON' : 'OFF';
  const nextAction = (currentState === 'ON') ? 'OFF' : 'ON';

  isDeviceProcessing = true;
  updateDeviceUI(nextAction, true); // Hiển thị nút xoay loading ngay lập tức

  try {
    const res = await fetch('/api/v1/devices/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'ESP8266_01',
        action: nextAction
      })
    });

    const data = await res.json();
    isDeviceProcessing = false;

    if (res.ok && data.status === 'SUCCESS') {
      updateDeviceUI(data.action, false);
      showToast(data.message || `Đã ${nextAction === 'ON' ? 'bật' : 'tắt'} thiết bị thành công!`, 'success');
    } else {
      updateDeviceUI(currentState, false);
      showToast(data.message || 'Lỗi khi điều khiển thiết bị!', 'error');
    }
  } catch (err) {
    isDeviceProcessing = false;
    updateDeviceUI(currentState, false);
    showToast('Không thể kết nối đến máy chủ để điều khiển!', 'error');
  }
}

const lightSwitchBtn = document.getElementById('lightSwitch');
if (lightSwitchBtn) {
  lightSwitchBtn.addEventListener('click', controlLight);
}

// ------------------------------------------------------------
// 5. TẢI DỮ LIỆU BAN ĐẦU TỪ MYSQL QUA API
// ------------------------------------------------------------
async function loadLatestDashboard() {
  try {
    const res = await fetch('/api/v1/dashboard/latest');
    if (!res.ok) return;
    const data = await res.json();

    updateSensorUI(data.temperature, data.humidity, data.light, data.isCovered);
    updateDeviceUI(data.deviceState || 'OFF', false);
    updateHardwareStatusUI(data.hardwareOnline !== false, 'Lap không nhận được tín hiệu từ phần cứng ESP8266! Thiết bị đang ngoại tuyến.');
  } catch (err) {
    console.warn('[Dashboard load latest error]', err);
  }
}

// Gọi tải dữ liệu thực từ MySQL ngay khi mở trang
loadLatestDashboard();
loadChartData();
// Tự động kiểm tra đồng bộ dữ liệu mỗi 2 giây
setInterval(loadLatestDashboard, 2000);

// ------------------------------------------------------------
// 6. KẾT NỐI SERVER-SENT EVENTS (SSE) CHO DỮ LIỆU REALTIME
// ------------------------------------------------------------
function connectSSE() {
  const evtSource = new EventSource('/api/v1/stream');

  evtSource.addEventListener('init', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateSensorUI(data.temperature, data.humidity, data.light, data.isCovered);
      updateDeviceUI(data.deviceState || 'OFF', false);
      updateHardwareStatusUI(data.online !== false);
    } catch {}
  });

  evtSource.addEventListener('sensor_update', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateSensorUI(data.temperature, data.humidity, data.light, data.isCovered);
      updateHardwareStatusUI(true);

      // Thêm điểm dữ liệu thời gian thực vào biểu đồ
      if (sensorChart && data.time) {
        const timeLabel = data.time.split(' ')[1] || data.time;
        sensorChart.data.labels.push(timeLabel);
        sensorChart.data.datasets[0].data.push(data.temperature);
        sensorChart.data.datasets[1].data = data.humidity;
        sensorChart.data.datasets[2].data = data.light;

        // Giữ tối đa 30 điểm
        if (sensorChart.data.labels.length > 30) {
          sensorChart.data.labels.shift();
          sensorChart.data.datasets.forEach(ds => ds.data.shift());
        }
        sensorChart.update('none');
      }

      if (data.isCovered) {
        showToast('⚠️ Cảm biến quang trở đang bị che! Ánh sáng giảm mạnh.', 'warning');
      }
    } catch {}
  });

  evtSource.addEventListener('device_pending', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateDeviceUI(data.action, true);
    } catch {}
  });

  evtSource.addEventListener('device_success', (e) => {
    try {
      const data = JSON.parse(e.data);
      isDeviceProcessing = false;
      updateDeviceUI(data.action, false);
    } catch {}
  });

  evtSource.addEventListener('hardware_status', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateHardwareStatusUI(data.online, data.message);
      if (!data.online) {
        showToast('⚠️ CẢNH BÁO: Lap không nhận được tín hiệu từ phần cứng ESP8266!', 'error');
      } else {
        showToast('✅ Đã nhận lại tín hiệu từ phần cứng ESP8266!', 'success');
      }
    } catch {}
  });

  evtSource.onerror = () => {
    console.warn('[SSE] Mất kết nối SSE stream, tự động kết nối lại sau 3 giây...');
  };
}
connectSSE();

// ------------------------------------------------------------
// 7. CÁC HÀM MÔ PHÒNG KIỂM THỬ THUYẾT TRÌNH
// ------------------------------------------------------------
async function simulateAction(action) {
  try {
    const res = await fetch('/api/v1/hardware/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, action.includes('disconnect') ? 'error' : 'success');
    }
  } catch {
    showToast('Lỗi khi gửi lệnh mô phỏng!', 'error');
  }
}

async function checkHardwareStatus() {
  try {
    const res = await fetch('/api/v1/hardware/status');
    const data = await res.json();
    updateHardwareStatusUI(data.online, 'Lap không nhận được tín hiệu từ phần cứng ESP8266! Thiết bị đang ngoại tuyến.');
    if (data.online) {
      showToast('Phần cứng ESP8266 đang hoạt động bình thường!', 'success');
    } else {
      showToast('ESP8266 chưa gửi tín hiệu trong hơn 7 giây!', 'error');
    }
  } catch {
    showToast('Không thể kết nối đến máy chủ!', 'error');
  }
}
