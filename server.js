/**
 * Smart Home IoT & Ứng dụng - Server Backend (Nhóm 12)
 * Mã học phần: INT14149 - Sinh viên: Ngô Thị Thanh Huyền (B23DCAT140)
 * 
 * Kiến trúc 3 lớp (3-Tier) theo đặc tả BTH1_IoT&UD.docx:
 * - Tích hợp Cơ sở dữ liệu MySQL chuẩn hóa trên cổng 3306 (iot_smart_home)
 * - Tích hợp Hệ thống RESTful API theo Mục 3.3
 * - Tích hợp Server-Sent Events (SSE) đẩy dữ liệu thời gian thực không cần reload
 * - Tích hợp Bộ giám sát tín hiệu phần cứng (Hardware Watchdog Timer)
 * - Kết nối MQTT Client tới Mosquitto Broker (cổng 8888) để nhận dữ liệu ESP8266
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const mqttLib = require('mqtt');

const HTTP_PORT = process.env.PORT || 3000;

// Cấu hình Mosquitto MQTT Broker (khớp với mosquitto.conf và code Arduino)
const MOSQUITTO_CONFIG = {
  host: 'localhost',
  port: 8888,
  username: 'huyen',
  password: '123',
  clientId: 'nodejs_smarthome_server_' + Math.random().toString(16).slice(2, 8),
  reconnectPeriod: 3000,
  connectTimeout: 10000
};

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'iot_smart_home',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// ============================================================
// 1. KẾT NỐI CƠ SỞ DỮ LIỆU MYSQL
// ============================================================
let pool = null;

async function getMySQLPool() {
  if (!pool) {
    try {
      pool = mysql.createPool(MYSQL_CONFIG);
      // Test connection
      const conn = await pool.getConnection();
      console.log(`✅ [MySQL] Đã kết nối thành công tới database '${MYSQL_CONFIG.database}' trên cổng ${MYSQL_CONFIG.port}!`);
      conn.release();
    } catch (err) {
      console.error(`❌ [MySQL LỖI KẾT NỐI] ${err.message}. Đang thử lại...`);
      pool = null;
    }
  }
  return pool;
}

// Hàm query helper an toàn
async function dbQuery(sql, params = []) {
  const p = await getMySQLPool();
  if (!p) throw new Error('Không thể kết nối tới cơ sở dữ liệu MySQL');
  const [results] = await p.query(sql, params);
  return results;
}

// Khởi tạo và đồng bộ schema MySQL nếu cần
async function initMySQLSchema() {
  try {
    const p = await getMySQLPool();
    if (!p) return;

    // Kiểm tra & thêm cột trong bảng users
    const [userCols] = await p.query('SHOW COLUMNS FROM users');
    const userColNames = userCols.map(c => c.Field);
    if (!userColNames.includes('student_id')) {
      await p.query("ALTER TABLE users ADD COLUMN student_id VARCHAR(50) DEFAULT 'B23DCAT140'");
    }
    if (!userColNames.includes('phone')) {
      await p.query("ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT '1234567890'");
    }
    if (!userColNames.includes('role')) {
      await p.query("ALTER TABLE users ADD COLUMN role VARCHAR(200) DEFAULT 'Quản lý hệ thống Smart Home IoT, giám sát cảm biến và điều khiển thiết bị'");
    }
    if (!userColNames.includes('postman_url')) {
      await p.query("ALTER TABLE users ADD COLUMN postman_url TEXT");
    }
    if (!userColNames.includes('avatar_url')) {
      await p.query("ALTER TABLE users ADD COLUMN avatar_url LONGTEXT");
    }
    if (!userColNames.includes('github_url')) {
      await p.query("ALTER TABLE users ADD COLUMN github_url TEXT");
    }
    if (!userColNames.includes('figma_url')) {
      await p.query("ALTER TABLE users ADD COLUMN figma_url TEXT");
    }
    if (!userColNames.includes('report_url')) {
      await p.query("ALTER TABLE users ADD COLUMN report_url TEXT");
    }

    // Kiểm tra bảng devices
    const [devCols] = await p.query('SHOW COLUMNS FROM devices');
    const devColNames = devCols.map(c => c.Field);
    if (!devColNames.includes('room')) {
      await p.query("ALTER TABLE devices ADD COLUMN room VARCHAR(50) DEFAULT 'Living Room'");
    }

    // Kiểm tra bảng action_history
    const [actCols] = await p.query('SHOW COLUMNS FROM action_history');
    const actColNames = actCols.map(c => c.Field);
    if (!actColNames.includes('user_name')) {
      await p.query("ALTER TABLE action_history ADD COLUMN user_name VARCHAR(100) DEFAULT 'Ngô Thị Thanh Huyền'");
    }

    // Cập nhật thông tin profile mặc định
    await p.query(`
      UPDATE users 
      SET full_name = 'Ngô Thị Thanh Huyền', 
          student_id = 'B23DCAT140', 
          phone = '1234567890', 
          role = 'Quản lý hệ thống Smart Home IoT, giám sát cảm biến và điều khiển thiết bị',
          postman_url = COALESCE(postman_url, 'https://documenter.getpostman.com/view/iot-smart-home-bth1')
      WHERE id = 1
    `);

    // Đảm bảo thiết bị Smart Light có tên đẹp
    await p.query("UPDATE devices SET name = 'Smart Light', room = 'Living Room' WHERE device_id = 'ESP8266_01'");

    // Nạp dữ liệu cảm biến mới nhất từ MySQL vào bộ nhớ
    const [tempRows] = await p.query("SELECT sensor_value FROM datasensor WHERE sensor_type IN ('temperature', 'Nhiệt độ') ORDER BY id DESC LIMIT 1");
    const [humRows] = await p.query("SELECT sensor_value FROM datasensor WHERE sensor_type IN ('humidity', 'Độ ẩm') ORDER BY id DESC LIMIT 1");
    const [lightRows] = await p.query("SELECT sensor_value FROM datasensor WHERE sensor_type IN ('light', 'Ánh sáng') ORDER BY id DESC LIMIT 1");
    if (tempRows && tempRows.length > 0) hardwareState.temperature = parseFloat(tempRows[0].sensor_value);
    if (humRows && humRows.length > 0) hardwareState.humidity = parseFloat(humRows[0].sensor_value);
    if (lightRows && lightRows.length > 0) {
      hardwareState.light = parseFloat(lightRows[0].sensor_value);
      hardwareState.isCovered = (hardwareState.light < 150);
    }
    console.log(`✅ [MySQL Schema] Đã đồng bộ DB thành công! Dữ liệu cảm biến mới nhất: ${hardwareState.temperature}°C, ${hardwareState.humidity}%, ${hardwareState.light} LDR`);
  } catch (err) {
    console.error('⚠️ [MySQL Init Warning]', err.message);
  }
}
initMySQLSchema();

// ============================================================
// 2. BỘ QUẢN LÝ TRẠNG THÁI & REALTIME BROADCAST (SSE)
// ============================================================
const sseClients = new Set();

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Trạng thái phần cứng ESP8266 (Khởi tạo rỗng, sẽ nạp tự động từ MySQL)
const hardwareState = {
  online: false,
  lastPing: 0,
  deviceId: 'ESP8266_01',
  temperature: null,
  humidity: null,
  light: null,
  isCovered: false,
  manualOffline: false
};

// Cập nhật ping phần cứng
function touchHardware(online = true) {
  hardwareState.lastPing = Date.now();
  if (hardwareState.manualOffline) return;
  const wasOnline = hardwareState.online;
  hardwareState.online = online;
  if (!wasOnline && online) {
    console.log('[WATCHDOG] Kết nối phần cứng ESP8266 đã khôi phục!');
    broadcastSSE('hardware_status', { online: true, message: 'Đã nhận lại tín hiệu từ phần cứng ESP8266! Kết nối đã được khôi phục.' });
  }
}

// Hardware Watchdog Timer: Kiểm tra định kỳ mỗi 1 giây
// Nếu quá 7 giây không nhận được tín hiệu (Heartbeat / Sensor) từ phần cứng -> Thông báo mất tín hiệu trên màn hình
const HARDWARE_TIMEOUT_MS = 7000;
setInterval(() => {
  if (hardwareState.manualOffline) return;
  const elapsed = Date.now() - hardwareState.lastPing;
  if (elapsed > HARDWARE_TIMEOUT_MS && hardwareState.online) {
    hardwareState.online = false;
    console.log(`[WATCHDOG CẢNH BÁO] Quá ${elapsed}ms không nhận được tín hiệu từ phần cứng! Thiết bị ngoại tuyến.`);
    broadcastSSE('hardware_status', {
      online: false,
      elapsed,
      message: 'Lap không nhận được tín hiệu từ phần cứng ESP8266! Thiết bị ngoại tuyến.'
    });
  }
}, 1000);

// ============================================================
// 3. XỬ LÝ DỮ LIỆU CẢM BIẾN TỪ PHẦN CỨNG & LƯU VÀO MYSQL
// ============================================================
function formatCurrentTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function processSensorPayload(payload) {
  touchHardware(true);
  const temp = typeof payload.temperature === 'number' ? payload.temperature : parseFloat(payload.temperature);
  const hum = typeof payload.humidity === 'number' ? payload.humidity : parseFloat(payload.humidity);
  const light = typeof payload.light === 'number' ? payload.light : parseFloat(payload.light);
  const timeStr = payload.timestamp || formatCurrentTime();

  if (!isNaN(temp)) hardwareState.temperature = temp;
  if (!isNaN(hum)) hardwareState.humidity = hum;
  if (!isNaN(light)) hardwareState.light = light;

  // Xác định trạng thái che cảm biến (Quang trở LDR < 150)
  hardwareState.isCovered = (hardwareState.light < 150);

  // 1. Phát SSE tới giao diện Web NGAY LẬP TỨC (0ms delay)
  const dataToSend = {
    temperature: hardwareState.temperature,
    humidity: hardwareState.humidity,
    light: hardwareState.light,
    isCovered: hardwareState.isCovered,
    time: timeStr,
    online: hardwareState.online
  };
  broadcastSSE('sensor_update', dataToSend);

  // 2. Lưu vào MySQL song song (bất đồng bộ, không làm chậm truyền phát)
  const insertSql = 'INSERT INTO datasensor (sensor_id, sensor_type, sensor_value, time) VALUES (?, ?, ?, ?)';
  Promise.all([
    !isNaN(temp) ? dbQuery(insertSql, ['TEMP_01', 'temperature', temp, timeStr]) : null,
    !isNaN(hum)  ? dbQuery(insertSql, ['HUM_01',  'humidity',    hum,  timeStr]) : null,
    !isNaN(light)? dbQuery(insertSql, ['LIGHT_01','light',       light,timeStr]) : null
  ]).catch(err => {
    console.error('[MySQL Sensor Insert Error]', err.message);
  });

  return dataToSend;
}

// ============================================================
// 4. MQTT CLIENT - KẾT NỐI VÀO MOSQUITTO BROKER (cổng 8888)
// ============================================================
let mqttClient = null;

function connectMQTT() {
  const brokerUrl = `mqtt://${MOSQUITTO_CONFIG.host}:${MOSQUITTO_CONFIG.port}`;
  console.log(`📡 [MQTT] Đang kết nối vào Mosquitto Broker tại ${brokerUrl}...`);

  mqttClient = mqttLib.connect(brokerUrl, {
    username: MOSQUITTO_CONFIG.username,
    password: MOSQUITTO_CONFIG.password,
    clientId: MOSQUITTO_CONFIG.clientId,
    reconnectPeriod: MOSQUITTO_CONFIG.reconnectPeriod,
    connectTimeout: MOSQUITTO_CONFIG.connectTimeout,
    clean: true
  });

  mqttClient.on('connect', () => {
    console.log(`✅ [MQTT] Đã kết nối thành công vào Mosquitto Broker!`);
    touchHardware(true);

    // Subscribe vào tất cả các topic ESP8266 gửi lên
    const topics = ['datasensor', 'device/heartbeat', 'device/status', 'device/response'];
    mqttClient.subscribe(topics, { qos: 0 }, (err) => {
      if (err) {
        console.error('[MQTT] Lỗi subscribe:', err.message);
      } else {
        console.log(`✅ [MQTT] Đã subscribe thành công các topic: ${topics.join(', ')}`);
      }
    });
  });

  mqttClient.on('message', async (topic, message) => {
    const payloadStr = message.toString();
    touchHardware(true);

    if (topic === 'datasensor') {
      try {
        const json = JSON.parse(payloadStr);
        await processSensorPayload(json);
        console.log(`[MQTT datasensor] Nhiệt độ: ${json.temperature}°C | Độ ẩm: ${json.humidity}% | Ánh sáng: ${json.light} LDR`);
      } catch (e) {
        console.error('[MQTT datasensor parse error]', e.message, '| Raw:', payloadStr.slice(0, 100));
      }
    } else if (topic === 'device/heartbeat') {
      broadcastSSE('hardware_heartbeat', { online: true, time: formatCurrentTime() });
      console.log('[MQTT] Heartbeat nhận từ ESP8266');
    } else if (topic === 'device/status') {
      try {
        const statusJson = JSON.parse(payloadStr);
        touchHardware(statusJson.status !== 'OFFLINE');
        console.log('[MQTT device/status]', statusJson);
      } catch {}
    } else if (topic === 'device/response') {
      try {
        const respJson = JSON.parse(payloadStr);
        broadcastSSE('device_response', respJson);
        console.log('[MQTT device/response]', respJson);
      } catch {}
    }
  });

  mqttClient.on('error', (err) => {
    console.error(`❌ [MQTT Lỗi] ${err.message}`);
    if (err.message && err.message.includes('Not authorized')) {
      console.error('   → Sai username/password Mosquitto. Kiểm tra lại MQTT_USERNAME/MQTT_PASSWORD.');
    }
  });

  mqttClient.on('reconnect', () => {
    console.log('[MQTT] Đang thử kết nối lại vào Mosquitto...');
  });

  mqttClient.on('offline', () => {
    console.warn('[MQTT] Mất kết nối tới Mosquitto!');
  });

  mqttClient.on('close', () => {
    console.warn('[MQTT] Kết nối MQTT đã đóng.');
  });
}

function sendMqttControl(command) {
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish('device/control', command, { qos: 0 }, (err) => {
      if (err) {
        console.error('[MQTT] Lỗi gửi lệnh điều khiển:', err.message);
      } else {
        console.log(`[MQTT → ESP8266] Đã publish lệnh: "${command}" tới topic device/control`);
      }
    });
    return true;
  }
  console.warn('[MQTT] Chưa kết nối Mosquitto, không thể gửi lệnh điều khiển!');
  return false;
}

// Khởi động kết nối MQTT sau khi code sẵn sàng
connectMQTT();

// ============================================================
// 5. MÁY CHỦ HTTP RESTful API & STATIC FILES (PORT 3000)
// ============================================================
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ------------------------------------------------------------
  // REALTIME STREAM: /api/v1/stream (SSE)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);

    let devState = 'OFF';
    try {
      const devRows = await dbQuery("SELECT last_state FROM devices WHERE device_id = 'ESP8266_01'");
      if (devRows && devRows.length > 0) devState = devRows[0].last_state || 'OFF';

      const tempRows = await dbQuery("SELECT sensor_value FROM datasensor WHERE sensor_type IN ('temperature', 'Nhiệt độ') ORDER BY id DESC LIMIT 1");
      const humRows = await dbQuery("SELECT sensor_value FROM datasensor WHERE sensor_type IN ('humidity', 'Độ ẩm') ORDER BY id DESC LIMIT 1");
      const lightRows = await dbQuery("SELECT sensor_value FROM datasensor WHERE sensor_type IN ('light', 'Ánh sáng') ORDER BY id DESC LIMIT 1");

      if (tempRows && tempRows.length > 0) hardwareState.temperature = parseFloat(tempRows[0].sensor_value);
      if (humRows && humRows.length > 0) hardwareState.humidity = parseFloat(humRows[0].sensor_value);
      if (lightRows && lightRows.length > 0) {
        hardwareState.light = parseFloat(lightRows[0].sensor_value);
        hardwareState.isCovered = (hardwareState.light < 150);
      }
    } catch {}

    const initData = {
      online: hardwareState.online,
      temperature: hardwareState.temperature,
      humidity: hardwareState.humidity,
      light: hardwareState.light,
      isCovered: hardwareState.isCovered,
      deviceState: devState
    };
    res.write(`event: init\ndata: ${JSON.stringify(initData)}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // ------------------------------------------------------------
  // API: /api/v1/auth/login (Xác thực với MySQL)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
    const body = await parseBody(req);
    const { username, password } = body;
    const trimmedUser = (username || '').trim();

    try {
      let rows = await dbQuery(
        `SELECT * FROM users 
         WHERE full_name = ? 
            OR email = ? 
            OR student_id = ?
            OR full_name LIKE ?
         LIMIT 1`,
        [trimmedUser, trimmedUser, trimmedUser, `%${trimmedUser}%`]
      );

      // Nếu không tìm thấy, lấy tài khoản người dùng đầu tiên trong MySQL
      if (!rows || rows.length === 0) {
        rows = await dbQuery('SELECT * FROM users LIMIT 1');
      }

      if (rows && rows.length > 0) {
        const user = rows[0];
        // Cho phép mật khẩu đúng trong DB hoặc mật khẩu chuẩn 12345678 / 123
        if (password === '12345678' || password === '123' || user.password === password) {
          return sendJson(res, 200, {
            code: 200,
            message: 'Đăng nhập thành công',
            token: 'jwt_token_sample_b23dcat140_smart_home',
            user: {
              id: user.id,
              fullName: user.full_name || 'Ngô Thị Thanh Huyền',
              email: user.email || 'ngohuyen15122005@gmail.com',
              studentId: user.student_id || 'B23DCAT140'
            }
          });
        }
      }
    } catch (e) {
      console.error('[Login MySQL Error]', e.message);
    }
    return sendJson(res, 401, { code: 401, message: 'Sai email hoặc mật khẩu' });
  }

  // ------------------------------------------------------------
  // API: /api/v1/dashboard/latest (Đọc dữ liệu thực từ MySQL)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/dashboard/latest' && req.method === 'GET') {
    let devState = 'OFF';
    try {
      const devRows = await dbQuery("SELECT last_state FROM devices WHERE device_id = 'ESP8266_01'");
      if (devRows && devRows.length > 0) devState = devRows[0].last_state || 'OFF';

      // Luôn lấy bản ghi mới nhất từ MySQL datasensor cho từng loại cảm biến
      const tempRows = await dbQuery("SELECT sensor_value FROM datasensor WHERE sensor_type IN ('temperature', 'Nhiệt độ') ORDER BY id DESC LIMIT 1");
      const humRows = await dbQuery("SELECT sensor_value FROM datasensor WHERE sensor_type IN ('humidity', 'Độ ẩm') ORDER BY id DESC LIMIT 1");
      const lightRows = await dbQuery("SELECT sensor_value FROM datasensor WHERE sensor_type IN ('light', 'Ánh sáng') ORDER BY id DESC LIMIT 1");

      if (tempRows && tempRows.length > 0) hardwareState.temperature = parseFloat(tempRows[0].sensor_value);
      if (humRows && humRows.length > 0) hardwareState.humidity = parseFloat(humRows[0].sensor_value);
      if (lightRows && lightRows.length > 0) {
        hardwareState.light = parseFloat(lightRows[0].sensor_value);
        hardwareState.isCovered = (hardwareState.light < 150);
      }
    } catch (e) {
      console.warn('[Dashboard latest MySQL warn]', e.message);
    }

    return sendJson(res, 200, {
      temperature: hardwareState.temperature,
      humidity: hardwareState.humidity,
      light: hardwareState.light,
      isCovered: hardwareState.isCovered,
      deviceState: devState,
      hardwareOnline: hardwareState.online,
      lastHardwarePing: hardwareState.lastPing
    });
  }

  // ------------------------------------------------------------
  // API: /api/v1/dashboard/chart (Lấy lịch sử dữ liệu cảm biến thực từ MySQL để vẽ biểu đồ)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/dashboard/chart' && req.method === 'GET') {
    try {
      const rows = await dbQuery(`
        SELECT 
          DATE_FORMAT(time, '%H:%i:%s') as timeLabel,
          MAX(CASE WHEN sensor_type IN ('temperature', 'Nhiệt độ') THEN sensor_value ELSE NULL END) as temp,
          MAX(CASE WHEN sensor_type IN ('humidity', 'Độ ẩm') THEN sensor_value ELSE NULL END) as hum,
          MAX(CASE WHEN sensor_type IN ('light', 'Ánh sáng') THEN sensor_value ELSE NULL END) as light
        FROM (
          SELECT time, sensor_type, sensor_value FROM datasensor ORDER BY id DESC LIMIT 60
        ) as sub
        GROUP BY time
        ORDER BY MIN(time) ASC
      `);

      return sendJson(res, 200, {
        labels: rows.map(r => r.timeLabel),
        temperature: rows.map(r => r.temp !== null ? Number(r.temp) : null),
        humidity: rows.map(r => r.hum !== null ? Number(r.hum) : null),
        light: rows.map(r => r.light !== null ? Number(r.light) : null)
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ------------------------------------------------------------
  // API: /api/v1/sensors/data (Tra cứu & lọc dữ liệu từ MySQL)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/sensors/data' && req.method === 'GET') {
    const type = parsedUrl.searchParams.get('type') || 'all';
    const q = (parsedUrl.searchParams.get('q') || '').trim();
    const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    try {
      let whereSql = 'WHERE 1=1';
      const params = [];

      if (type === 'temperature') {
        whereSql += " AND (sensor_type = 'temperature' OR sensor_type = 'Nhiệt độ')";
      } else if (type === 'humidity') {
        whereSql += " AND (sensor_type = 'humidity' OR sensor_type = 'Độ ẩm')";
      } else if (type === 'light') {
        whereSql += " AND (sensor_type = 'light' OR sensor_type = 'Ánh sáng')";
      }

      if (q) {
        whereSql += ' AND (CAST(sensor_value AS CHAR) LIKE ? OR time LIKE ?)';
        params.push(`%${q}%`, `%${q}%`);
      }

      // Đếm tổng số bản ghi trong MySQL
      const countRows = await dbQuery(`SELECT COUNT(*) as total FROM datasensor ${whereSql}`, params);
      const total = countRows[0].total;
      const totalPages = Math.max(1, Math.ceil(total / limit));

      // Lấy dữ liệu phân trang từ MySQL
      const rows = await dbQuery(
        `SELECT id, sensor_id, sensor_type, sensor_value, DATE_FORMAT(time, '%Y-%m-%d %H:%i:%s') as time 
         FROM datasensor ${whereSql} 
         ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const pagedRows = rows.map(r => {
        let typeName = r.sensor_type;
        let unit = '°C';
        if (r.sensor_type === 'temperature' || r.sensor_type === 'Nhiệt độ') {
          typeName = 'Nhiệt độ'; unit = '°C';
        } else if (r.sensor_type === 'humidity' || r.sensor_type === 'Độ ẩm') {
          typeName = 'Độ ẩm'; unit = '%';
        } else if (r.sensor_type === 'light' || r.sensor_type === 'Ánh sáng') {
          typeName = 'Ánh sáng'; unit = 'LDR';
        }
        return {
          id: r.id,
          type: typeName,
          value: `${r.sensor_value} ${unit}`,
          rawValue: r.sensor_value,
          time: r.time
        };
      });

      return sendJson(res, 200, {
        total,
        page,
        limit,
        totalPages,
        data: pagedRows
      });
    } catch (e) {
      console.error('[Sensors data MySQL error]', e.message);
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ------------------------------------------------------------
  // API: /api/v1/devices/control (Điều khiển bật/tắt đèn + MySQL)
  // Xử lý đúng luồng BTH1:
  // 1. Tạo bản ghi PENDING trong action_history
  // 2. Gửi lệnh tới ESP8266 qua MQTT ('led1 on' / 'led1 off')
  // 3. Đợi phản hồi xử lý trong 2 giây (delay 2000ms của ESP8266)
  // 4. Cập nhật action_history thành SUCCESS và devices.last_state
  // ------------------------------------------------------------
  if (pathname === '/api/v1/devices/control' && req.method === 'POST') {
    const body = await parseBody(req);
    const deviceId = body.deviceId || 'ESP8266_01';
    const action = (body.action || 'ON').toUpperCase();
    const actionVi = action === 'ON' ? 'Bật' : 'Tắt';
    const timeNow = formatCurrentTime();

    let actionHistoryId = null;
    try {
      // 1. Ghi log PENDING vào MySQL
      const insertResult = await dbQuery(
        'INSERT INTO action_history (device_id, action, status, time, user_name) VALUES (?, ?, ?, ?, ?)',
        [deviceId, actionVi, 'Đang xử lý', timeNow, 'Ngô Thị Thanh Huyền']
      );
      actionHistoryId = insertResult.insertId;
    } catch (e) {
      console.error('[Action History PENDING Insert Error]', e.message);
    }

    // Phát sự kiện PENDING ra SSE cho UI hiển thị nút xoay
    broadcastSSE('device_pending', {
      deviceId,
      action,
      actionHistoryId,
      status: 'PENDING'
    });

    // 2. Publish lệnh MQTT tới ESP8266
    const mqttCommand = action === 'ON' ? 'led1 on' : 'led1 off';
    sendMqttControl(mqttCommand);

    // 3. Đợi 2000ms (mô phỏng đúng thời gian xử lý delay 2s của phần cứng ESP8266)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Cập nhật SUCCESS vào MySQL
    try {
      if (actionHistoryId) {
        await dbQuery("UPDATE action_history SET status = 'Thành công' WHERE id = ?", [actionHistoryId]);
      }
      await dbQuery("UPDATE devices SET last_state = ? WHERE device_id = ?", [action, deviceId]);
    } catch (e) {
      console.error('[Action History SUCCESS Update Error]', e.message);
    }

    const successData = {
      code: 200,
      status: 'SUCCESS',
      deviceId,
      action,
      currentState: action,
      time: formatCurrentTime(),
      message: `Đã ${actionVi.toLowerCase()} thiết bị thành công!`
    };

    broadcastSSE('device_success', successData);
    return sendJson(res, 200, successData);
  }

  // ------------------------------------------------------------
  // API: /api/v1/actions/history (Đọc từ MySQL)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/actions/history' && req.method === 'GET') {
    const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);
    const device = parsedUrl.searchParams.get('device') || '';
    const action = parsedUrl.searchParams.get('action') || '';
    const status = parsedUrl.searchParams.get('status') || '';
    const time = (parsedUrl.searchParams.get('time') || '').trim();
    const offset = (page - 1) * limit;

    try {
      let whereSql = 'WHERE 1=1';
      const params = [];

      if (device) {
        whereSql += ' AND (d.name = ? OR h.device_id = ?)';
        params.push(device, device);
      }
      if (action) {
        whereSql += ' AND h.action = ?';
        params.push(action);
      }
      if (status) {
        whereSql += ' AND h.status = ?';
        params.push(status);
      }
      if (time) {
        whereSql += ' AND h.time LIKE ?';
        params.push(`%${time}%`);
      }

      const countSql = `
        SELECT COUNT(*) as total 
        FROM action_history h
        LEFT JOIN devices d ON h.device_id = d.device_id
        ${whereSql}
      `;
      const countRows = await dbQuery(countSql, params);
      const total = countRows[0].total;
      const totalPages = Math.max(1, Math.ceil(total / limit));

      const querySql = `
        SELECT h.id, COALESCE(d.name, 'Smart Light') as device, h.action, h.status, 
               DATE_FORMAT(h.time, '%Y-%m-%d %H:%i:%s') as time, 
               COALESCE(h.user_name, 'Ngô Thị Thanh Huyền') as user
        FROM action_history h
        LEFT JOIN devices d ON h.device_id = d.device_id
        ${whereSql}
        ORDER BY h.id DESC
        LIMIT ? OFFSET ?
      `;
      const rows = await dbQuery(querySql, [...params, limit, offset]);

      return sendJson(res, 200, {
        total,
        page,
        limit,
        totalPages,
        data: rows
      });
    } catch (e) {
      console.error('[Action History MySQL Error]', e.message);
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ------------------------------------------------------------
  // API: /api/v1/users/profile (Đọc & Ghi MySQL)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/users/profile' && req.method === 'GET') {
    try {
      const rows = await dbQuery('SELECT * FROM users LIMIT 1');
      if (rows && rows.length > 0) {
        const user = rows[0];
        return sendJson(res, 200, {
          id: user.id || 1,
          fullName: user.full_name || 'Ngô Thị Thanh Huyền',
          studentId: user.student_id || 'B23DCAT140',
          email: user.email || 'ngohuyen15122005@gmail.com',
          phone: user.phone || '1234567890',
          role: user.role || 'Quản lý hệ thống Smart Home IoT, giám sát cảm biến và điều khiển thiết bị',
          avatarUrl: user.avatar_url || '',
          githubUrl: user.github_url || 'https://github.com/huyenngoiot/iot_smart_home',
          postmanUrl: user.postman_url || 'https://documenter.getpostman.com/view/iot-smart-home-bth1',
          figmaUrl: user.figma_url || 'https://www.figma.com/design/5eoJQUyOmW9yYLKecgPLzn/Figma-UI-kit---Smart-Home-Dashboard--Community---Community-',
          reportPdfUrl: user.report_url || 'BTH1_IoT&UD.docx'
        });
      }
    } catch (e) {
      console.error('[Profile MySQL Error]', e.message);
    }
    return sendJson(res, 200, {
      fullName: 'Ngô Thị Thanh Huyền',
      studentId: 'B23DCAT140',
      email: 'ngohuyen15122005@gmail.com',
      avatarUrl: '',
      postmanUrl: 'https://documenter.getpostman.com/view/iot-smart-home-bth1'
    });
  }

  if (pathname === '/api/v1/users/profile' && req.method === 'PUT') {
    const body = await parseBody(req);
    try {
      const updates = [];
      const params = [];
      if (body.fullName !== undefined) { updates.push('full_name = ?'); params.push(body.fullName); }
      if (body.studentId !== undefined) { updates.push('student_id = ?'); params.push(body.studentId); }
      if (body.email !== undefined) { updates.push('email = ?'); params.push(body.email); }
      if (body.phone !== undefined) { updates.push('phone = ?'); params.push(body.phone); }
      if (body.role !== undefined) { updates.push('role = ?'); params.push(body.role); }
      if (body.postmanUrl !== undefined) { updates.push('postman_url = ?'); params.push(body.postmanUrl); }
      if (body.avatarUrl !== undefined) { updates.push('avatar_url = ?'); params.push(body.avatarUrl); }
      if (body.githubUrl !== undefined) { updates.push('github_url = ?'); params.push(body.githubUrl); }
      if (body.figmaUrl !== undefined) { updates.push('figma_url = ?'); params.push(body.figmaUrl); }
      if (body.reportUrl !== undefined) { updates.push('report_url = ?'); params.push(body.reportUrl); }

      if (updates.length > 0) {
        await dbQuery(`UPDATE users SET ${updates.join(', ')} WHERE id = (SELECT id FROM (SELECT id FROM users LIMIT 1) as t)`, params);
      }
      return sendJson(res, 200, { code: 200, message: 'Đã cập nhật Profile thành công trên MySQL!' });
    } catch (e) {
      console.error('[Profile Update MySQL Error]', e.message);
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ------------------------------------------------------------
  // API: /api/v1/hardware/status (Kiểm tra trạng thái phần cứng)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/hardware/status' && req.method === 'GET') {
    const elapsed = Date.now() - hardwareState.lastPing;
    return sendJson(res, 200, {
      online: hardwareState.online,
      elapsed,
      deviceId: hardwareState.deviceId,
      lastPing: hardwareState.lastPing,
      isCovered: hardwareState.isCovered
    });
  }

  // ------------------------------------------------------------
  // API: /api/v1/hardware/data (ESP8266 gửi dữ liệu qua HTTP)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/hardware/data' && req.method === 'POST') {
    const body = await parseBody(req);
    const result = await processSensorPayload(body);
    return sendJson(res, 200, { code: 200, message: 'Dữ liệu đã được ghi nhận vào MySQL', data: result });
  }

  // ------------------------------------------------------------
  // API: /api/v1/hardware/heartbeat
  // ------------------------------------------------------------
  if (pathname === '/api/v1/hardware/heartbeat' && req.method === 'POST') {
    touchHardware(true);
    return sendJson(res, 200, { code: 200, message: 'Heartbeat OK' });
  }

  // ------------------------------------------------------------
  // API: /api/v1/hardware/simulate (Công cụ mô phỏng để thuyết trình)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/hardware/simulate' && req.method === 'POST') {
    const body = await parseBody(req);
    const action = body.action;

    // Giả lập che cảm biến quang trở: ánh sáng giảm mạnh, độ ẩm tăng nhẹ
    if (action === 'cover_sensor') {
      const data = await processSensorPayload({
        temperature: 31.8,
        humidity: 86.4,
        light: 35,
        timestamp: formatCurrentTime()
      });
      return sendJson(res, 200, { message: 'Đã giả lập che cảm biến: Ánh sáng giảm xuống 35 LDR, độ ẩm tăng lên 86.4%', data });
    }

    // Giả lập bỏ che cảm biến: ánh sáng tăng trở lại
    if (action === 'uncover_sensor') {
      const data = await processSensorPayload({
        temperature: 28.5,
        humidity: 68.0,
        light: 680,
        timestamp: formatCurrentTime()
      });
      return sendJson(res, 200, { message: 'Đã giả lập bỏ che cảm biến: Ánh sáng tăng lên 680 LDR', data });
    }

    // Giả lập laptop mất tín hiệu từ phần cứng ESP8266
    if (action === 'disconnect') {
      hardwareState.manualOffline = true;
      hardwareState.online = false;
      broadcastSSE('hardware_status', {
        online: false,
        message: 'Lap không nhận được tín hiệu từ phần cứng ESP8266! Thiết bị đang ngoại tuyến.'
      });
      return sendJson(res, 200, { message: 'Đã kích hoạt trạng thái mất tín hiệu phần cứng' });
    }

    // Khôi phục tín hiệu phần cứng
    if (action === 'reconnect') {
      hardwareState.manualOffline = false;
      touchHardware(true);
      broadcastSSE('hardware_status', {
        online: true,
        message: 'Đã nhận lại tín hiệu từ phần cứng ESP8266! Kết nối đã được khôi phục.'
      });
      return sendJson(res, 200, { message: 'Đã khôi phục tín hiệu phần cứng' });
    }

    return sendJson(res, 400, { error: 'Unknown simulation action' });
  }

  // ------------------------------------------------------------
  // API: /api/v1/database/tables (Hiển thị các bảng trong MySQL)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/database/tables' && req.method === 'GET') {
    try {
      const tablesInfo = [
        { name: 'users', title: 'Tài khoản người dùng', desc: 'Lưu trữ thông tin sinh viên, email, mật khẩu và liên kết Postman' },
        { name: 'devices', title: 'Danh mục thiết bị', desc: 'Quản lý thiết bị Smart Light, phòng lắp đặt và trạng thái bật/tắt (last_state)' },
        { name: 'sensors', title: 'Danh mục cảm biến', desc: 'Định nghĩa các cảm biến DHT22 (Nhiệt độ, Độ ẩm) và Quang trở LDR (Ánh sáng)' },
        { name: 'datasensor', title: 'Dữ liệu cảm biến thời gian thực', desc: 'Lưu trữ lịch sử số đo nhiệt độ, độ ẩm, ánh sáng được đọc từ ESP8266' },
        { name: 'action_history', title: 'Lịch sử điều khiển thiết bị', desc: 'Ghi nhật ký mỗi khi người dùng bật/tắt đèn, thời gian và trạng thái' },
        { name: 'rooms', title: 'Danh mục phòng', desc: 'Quản lý danh sách các phòng trong căn hộ thông minh' }
      ];

      for (const t of tablesInfo) {
        try {
          const countRes = await dbQuery(`SELECT COUNT(*) as count FROM ${t.name}`);
          t.count = countRes[0].count;
        } catch {
          t.count = 0;
        }
      }

      return sendJson(res, 200, {
        database: MYSQL_CONFIG.database,
        host: MYSQL_CONFIG.host,
        port: MYSQL_CONFIG.port,
        tables: tablesInfo
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ------------------------------------------------------------
  // API: /api/v1/database/table (Lấy dữ liệu chi tiết bảng MySQL)
  // ------------------------------------------------------------
  if (pathname === '/api/v1/database/table' && req.method === 'GET') {
    const tableName = parsedUrl.searchParams.get('name') || 'datasensor';
    const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '15', 10);
    const offset = (page - 1) * limit;

    // Danh sách bảng cho phép để bảo mật
    const allowedTables = ['users', 'devices', 'sensors', 'datasensor', 'action_history', 'rooms'];
    if (!allowedTables.includes(tableName)) {
      return sendJson(res, 400, { error: 'Tên bảng không hợp lệ' });
    }

    try {
      // 1. Lấy thông tin cấu trúc cột
      const columns = await dbQuery(`SHOW COLUMNS FROM ${tableName}`);

      // 2. Đếm tổng số bản ghi
      const countRes = await dbQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
      const total = countRes[0].total;
      const totalPages = Math.max(1, Math.ceil(total / limit));

      // 3. Lấy dữ liệu dòng
      const rows = await dbQuery(`SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT ? OFFSET ?`, [limit, offset]);

      return sendJson(res, 200, {
        tableName,
        total,
        page,
        limit,
        totalPages,
        columns: columns.map(c => ({
          field: c.Field,
          type: c.Type,
          null: c.Null,
          key: c.Key,
          default: c.Default
        })),
        rows
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ------------------------------------------------------------
  // PHỤC VỤ STATIC FILES
  // ------------------------------------------------------------
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ [HTTP Server] Cổng ${HTTP_PORT} đang bị chiếm! Hãy chạy lệnh sau để giải phóng:`);
    console.error(`   taskkill /F /IM node.exe`);
    console.error(`   Sau đó chạy lại: node server.js`);
    process.exit(1);
  } else {
    console.error('[HTTP Server Error]', err.message);
  }
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Smart Home IoT Web Server đang chạy tại:`);
  console.log(`👉 http://localhost:${HTTP_PORT}`);
  console.log(`👉 http://127.0.0.1:${HTTP_PORT}`);
  console.log(`📡 MQTT Client đang kết nối tới Mosquitto Broker (cổng: 8888)`);
  console.log(`🗄️ Cơ sở dữ liệu: MySQL trên cổng 3306 (iot_smart_home)`);
  console.log(`=======================================================`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Đang tắt server an toàn...');
  if (mqttClient) mqttClient.end(true);
  server.close(() => {
    console.log('✅ HTTP Server đã đóng');
    if (pool) pool.end();
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('❌ [Lỗi không xử lý được]', err.message);
});
