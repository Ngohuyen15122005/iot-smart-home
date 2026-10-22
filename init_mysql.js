const mysql = require('mysql2/promise');

async function initMySQL() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'iot_smart_home'
  });
  console.log('Connected to MySQL successfully!');

  // Check columns of users
  const [userCols] = await conn.query('SHOW COLUMNS FROM users');
  const userColNames = userCols.map(c => c.Field);
  
  if (!userColNames.includes('student_id')) {
    await conn.query("ALTER TABLE users ADD COLUMN student_id VARCHAR(50) DEFAULT 'B23DCAT140'");
  }
  if (!userColNames.includes('phone')) {
    await conn.query("ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT '1234567890'");
  }
  if (!userColNames.includes('role')) {
    await conn.query("ALTER TABLE users ADD COLUMN role VARCHAR(200) DEFAULT 'Quản lý hệ thống Smart Home IoT, giám sát cảm biến và điều khiển thiết bị'");
  }
  if (!userColNames.includes('postman_url')) {
    await conn.query("ALTER TABLE users ADD COLUMN postman_url TEXT");
  }

  // Check devices
  const [devCols] = await conn.query('SHOW COLUMNS FROM devices');
  const devColNames = devCols.map(c => c.Field);
  if (!devColNames.includes('room')) {
    await conn.query("ALTER TABLE devices ADD COLUMN room VARCHAR(50) DEFAULT 'Living Room'");
  }

  // Check action_history
  const [actCols] = await conn.query('SHOW COLUMNS FROM action_history');
  const actColNames = actCols.map(c => c.Field);
  if (!actColNames.includes('user_name')) {
    await conn.query("ALTER TABLE action_history ADD COLUMN user_name VARCHAR(100) DEFAULT 'Ngô Thị Thanh Huyền'");
  }

  // Update user info
  await conn.query(`
    UPDATE users 
    SET full_name = 'Ngô Thị Thanh Huyền', 
        student_id = 'B23DCAT140', 
        phone = '1234567890', 
        role = 'Quản lý hệ thống Smart Home IoT, giám sát cảm biến và điều khiển thiết bị',
        postman_url = 'https://documenter.getpostman.com/view/iot-smart-home-bth1'
    WHERE id = 1
  `);

  // Ensure devices has sample devices with room_id = 'R001'
  const [devs] = await conn.query('SELECT * FROM devices');
  const devIds = devs.map(d => d.device_id);
  if (!devIds.includes('DEVICE_02')) {
    await conn.query("INSERT INTO devices (device_id, name, device_type, control_name, room_id, room, last_state) VALUES ('DEVICE_02', 'Quạt thông minh', 'FAN', 'fan1', 'R001', 'Living Room', 'OFF')");
  }
  if (!devIds.includes('DEVICE_03')) {
    await conn.query("INSERT INTO devices (device_id, name, device_type, control_name, room_id, room, last_state) VALUES ('DEVICE_03', 'Điều hòa', 'AC', 'ac1', 'R001', 'Bed Room', 'OFF')");
  }

  // Update device 1 name to Smart Light
  await conn.query("UPDATE devices SET name = 'Smart Light', room = 'Living Room' WHERE device_id = 'ESP8266_01'");

  console.log('MySQL schema verification finished successfully!');
  await conn.end();
}

initMySQL().catch(err => {
  console.error('MySQL init error:', err);
});
