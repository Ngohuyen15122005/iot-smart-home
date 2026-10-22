#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <time.h>

// ============================================================
// 1. CẤU HÌNH WIFI
// ============================================================

// TÊN WIFI CỦA BẠN
const char* WIFI_SSID = "Minh Khoi";

// MẬT KHẨU WIFI CỦA BẠN
const char* WIFI_PASSWORD = "12345678";


// ============================================================
// 2. CẤU HÌNH MQTT
// ============================================================

const char* MQTT_SERVER = "192.168.1.35";

const int MQTT_PORT = 8888;

//  Mosquitto  username/password:
const char* MQTT_USERNAME = "huyen";
const char* MQTT_PASSWORD = "123";

// Thong tin user/password dua vao datasensor.
const char* DATA_USER = "huyen";
const char* DATA_PASSWORD = "123";


// 3. THÔNG TIN THIẾT BỊ

const char* DEVICE_ID = "ESP8266_01";


// 4. MQTT TOPIC

// ESP8266 -> MQTT
const char* TOPIC_SENSOR = "datasensor";

// Terminal/Backend -> ESP8266
const char* TOPIC_CONTROL = "device/control";

// ESP8266 -> Terminal/Backend
const char* TOPIC_RESPONSE = "device/response";

// ESP8266 -> Terminal/Backend
const char* TOPIC_STATUS = "device/status";

// ESP8266 -> Terminal/Backend
const char* TOPIC_HEARTBEAT = "device/heartbeat";

// 5. KHAI BÁO CHÂN PHẦN CỨNG

// DHT22
#define DHT_PIN D4
#define DHT_TYPE DHT22

// LED1
#define LED1_PIN D1

// LDR
#define LDR_PIN A0

DHT dht(DHT_PIN, DHT_TYPE);


// 6. MQTT + WIFI

WiFiClient espClient;
PubSubClient mqttClient(espClient);


// 7. THỜI GIAN

// Đọc sensor mỗi 2 giây
const unsigned long SENSOR_INTERVAL = 2000;

// Heartbeat mỗi 5 giây
const unsigned long HEARTBEAT_INTERVAL = 5000;

unsigned long lastSensorTime = 0;
unsigned long lastHeartbeatTime = 0;


// 8. TRẠNG THÁI LED

bool led1State = false;

// Lenh dieu khien gan nhat de hien thi trong datasensor
String lastControlCommand = "";


// 9. HÀM LẤY TRẠNG THÁI LED

String getLEDState()
{
  if (digitalRead(LED1_PIN) == HIGH)
  {
    return "ON";
  }

  return "OFF";
}

// 10. HÀM LẤY TIMESTAMP

String getTimestamp()
{
  time_t now = time(nullptr);

  // Nếu chưa đồng bộ được NTP
  if (now < 100000)
  {
    return "N/A";
  }

  struct tm* timeinfo = localtime(&now);

  char buffer[30];

  strftime(
    buffer,
    sizeof(buffer),
    "%Y-%m-%d %H:%M:%S",
    timeinfo
  );

  return String(buffer);
}


// 11. KẾT NỐI WIFI

void connectWiFi()
{
  Serial.println();
  Serial.println("=================================");
  Serial.println("KET NOI WIFI");
  Serial.println("=================================");

  Serial.print("SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);

    Serial.print(".");
  }

  Serial.println();
  Serial.println("WIFI CONNECTED!");
  Serial.print("ESP8266 IP: ");
  Serial.println(WiFi.localIP());

  Serial.print("ESP8266 IP: ");
  Serial.println(WiFi.localIP());

  Serial.print("Gateway: ");
  Serial.println(WiFi.gatewayIP());

  Serial.print("Subnet: ");
  Serial.println(WiFi.subnetMask());
}


// 12. ĐỒNG BỘ THỜI GIAN NTP

void setupTime()
{
  // GMT+7 cho Việt Nam
  configTime(
    7 * 3600,
    0,
    "pool.ntp.org",
    "time.nist.gov"
  );

  Serial.println();
  Serial.println("Dang dong bo thoi gian NTP...");

  time_t now = time(nullptr);

  int retry = 0;

  while (now < 100000 && retry < 20)
  {
    delay(500);

    Serial.print(".");

    now = time(nullptr);

    retry++;
  }

  Serial.println();

  if (now >= 100000)
  {
    Serial.print("NTP OK: ");
    Serial.println(getTimestamp());
  }
  else
  {
    Serial.println("Khong dong bo duoc NTP.");
    Serial.println("Timestamp se hien thi N/A.");
  }
}


// 13. GỬI RESPONSE MQTT

void publishResponse(
  const String& deviceName,
  const String& previousState,
  const String& action,
  const String& status,
  const String& currentState
)
{
  String timestamp = getTimestamp();

  // JSON gửi qua MQTT được format nhiều dòng để terminal dễ đọc.
  // Xuống dòng và khoảng trắng vẫn là JSON hợp lệ.
  String payload = "{\n";
  payload += "  \"device\": \"" + String(DEVICE_ID) + "\",\n";
  payload += "  \"device_name\": \"" + deviceName + "\",\n";
  payload += "  \"previous_state\": \"" + previousState + "\",\n";
  payload += "  \"action\": \"" + action + "\",\n";
  payload += "  \"status\": \"" + status + "\",\n";
  payload += "  \"current_state\": \"" + currentState + "\",\n";
  payload += "  \"timestamp\": \"" + timestamp + "\"\n";
  payload += "}";

  mqttClient.publish(
    TOPIC_RESPONSE,
    payload.c_str()
  );

  // Hiển thị Serial Monitor theo từng dòng
  Serial.println();
  Serial.println("========== MQTT RESPONSE ==========");
  Serial.println(payload);
  Serial.println("==================================");
}

// 14. XỬ LÝ LỆNH ĐIỀU KHIỂN

void handleControlCommand(String command)
{
  command.trim();
  command.toLowerCase();

  Serial.println();
  Serial.println("=================================");
  Serial.println("NHAN LENH DIEU KHIEN");
  Serial.println("=================================");
  Serial.print("Command: ");
  Serial.println(command);

  // LỆNH LED1 ON
  if (command == "led1 on")
  {
    String previousState = getLEDState();
    String action = "ON";
    lastControlCommand = "led1 on";

    // Gửi PROCESSING trước
    publishResponse(
      "led1",
      previousState,
      action,
      "PROCESSING",
      previousState
    );

    // Giữ PROCESSING trong 2 giây trước khi thực hiện hành động
    Serial.println();
    Serial.println("Dang xu ly lenh...");
    Serial.println("Cho 2 giay truoc khi bat LED...");
    delay(2000);

    // Thực hiện bật LED
    digitalWrite(LED1_PIN, HIGH);
    delay(50);

    // Đọc lại trạng thái thực tế
    String currentState = getLEDState();

    if (currentState == "ON")
    {
      led1State = true;
      publishResponse(
        "led1",
        previousState,
        action,
        "SUCCESS",
        currentState
      );
    }
    else
    {
      publishResponse(
        "led1",
        previousState,
        action,
        "ERROR",
        currentState
      );
    }

    return;
  }

  // LỆNH LED1 OFF
  if (command == "led1 off")
  {
    String previousState = getLEDState();
    String action = "OFF";
    lastControlCommand = "led1 off";

    // Gửi PROCESSING trước
    publishResponse(
      "led1",
      previousState,
      action,
      "PROCESSING",
      previousState
    );

    // Giữ PROCESSING trong 2 giây trước khi thực hiện hành động
    Serial.println();
    Serial.println("Dang xu ly lenh...");
    Serial.println("Cho 2 giay truoc khi tat LED...");
    delay(2000);

    // Thực hiện tắt LED
    digitalWrite(LED1_PIN, LOW);
    delay(50);

    // Đọc lại trạng thái thực tế
    String currentState = getLEDState();

    if (currentState == "OFF")
    {
      led1State = false;
      publishResponse(
        "led1",
        previousState,
        action,
        "SUCCESS",
        currentState
      );
    }
    else
    {
      publishResponse(
        "led1",
        previousState,
        action,
        "ERROR",
        currentState
      );
    }

    return;
  }
  // LỆNH KHÔNG HỢP LỆ
  Serial.println("LENH KHONG HOP LE!");

  publishResponse(
    "unknown",
    "UNKNOWN",
    "UNKNOWN",
    "ERROR",
    "UNKNOWN"
  );
}


// 15. CALLBACK MQTT

void mqttCallback(
  char* topic,
  byte* payload,
  unsigned int length
)
{
  Serial.println();
  Serial.println("========== MQTT MESSAGE ==========");

  Serial.print("Topic: ");
  Serial.println(topic);

  String message = "";

  for (unsigned int i = 0; i < length; i++)
  {
    message += (char)payload[i];
  }

  Serial.print("Message: ");
  Serial.println(message);

  Serial.println("==================================");


  // Nếu nhận command
  if (String(topic) == TOPIC_CONTROL)
  {
    handleControlCommand(message);
  }
}


// 16. KẾT NỐI MQTT

void connectMQTT()
{
  while (!mqttClient.connected())
  {
    Serial.println();
    Serial.println("=================================");
    Serial.println("KET NOI MQTT");
    Serial.println("=================================");

    String clientID = String(DEVICE_ID) + "_" + String(ESP.getChipId());

    Serial.print("Client ID: ");
    Serial.println(clientID);

    bool connected = false;


    // MQTT KHÔNG CÓ USERNAME/PASSWORD

    if (
      strlen(MQTT_USERNAME) == 0 &&
      strlen(MQTT_PASSWORD) == 0
    )
    {
      connected = mqttClient.connect(
        clientID.c_str(),

        // Last Will Topic
        TOPIC_STATUS,

        // QoS
        0,

        // Retain
        true,

        // Last Will Message
        "{\"device\":\"ESP8266_01\",\"status\":\"OFFLINE\"}"
      );
    }

    // --------------------------------------------------------
    // MQTT CÓ USERNAME/PASSWORD
    // --------------------------------------------------------

    else
    {
      connected = mqttClient.connect(
        clientID.c_str(),

        MQTT_USERNAME,
        MQTT_PASSWORD,

        TOPIC_STATUS,
        0,
        true,

        "{\"device\":\"ESP8266_01\",\"status\":\"OFFLINE\"}"
      );
    }

    // CONNECTED

    if (connected)
    {
      Serial.println("MQTT CONNECTED!");

      // Subscribe topic điều khiển
      mqttClient.subscribe(TOPIC_CONTROL);

      Serial.print("Subscribed: ");
      Serial.println(TOPIC_CONTROL);


      // Gửi ONLINE
      String onlinePayload = "{";

      onlinePayload += "\"device\":\"";
      onlinePayload += DEVICE_ID;
      onlinePayload += "\",";

      onlinePayload += "\"status\":\"ONLINE\",";

      onlinePayload += "\"timestamp\":\"";
      onlinePayload += getTimestamp();
      onlinePayload += "\"";

      onlinePayload += "}";

      mqttClient.publish(
        TOPIC_STATUS,
        onlinePayload.c_str(),
        true
      );


      Serial.println("[DEVICE STATUS]");
      Serial.println(onlinePayload);
    }

    else
    {
      Serial.print("MQTT FAILED, rc=");
      Serial.println(mqttClient.state());

      Serial.println("Thu lai sau 2 giay...");

      delay(2000);
    }
  }
}


// 17. GỬI DỮ LIỆU SENSOR

void publishSensorData()
{
  float temperature = dht.readTemperature();

  float humidity = dht.readHumidity();

  int light = analogRead(LDR_PIN);


  // KIỂM TRA DHT22

  if (isnan(temperature) || isnan(humidity))
  {
    Serial.println();
    Serial.println("ERROR: Khong doc duoc DHT22!");

    return;
  }


  // TẠO JSON

  String timestamp = getTimestamp();

  // JSON datasensor them user, password va lenh dieu khien gan nhat.
  // LUU Y: Khong nen gui password that qua MQTT trong moi truong thuc te.
  String payload = "{\n";
  payload += "  \"device\": \"" + String(DEVICE_ID) + "\",\n";
  // payload += "  \"user\": \"" + String(DATA_USER) + "\",\n";
  // payload += "  \"password\": \"" + String(DATA_PASSWORD) + "\",\n";
  payload += "  \"temperature\": " + String(temperature, 1) + ",\n";
  payload += "  \"humidity\": " + String(humidity, 1) + ",\n";
  payload += "  \"light\": " + String(light) + ",\n";
  payload += "  \"command\": \"" + lastControlCommand + "\",\n";
  payload += "  \"timestamp\": \"" + timestamp + "\"\n";
  payload += "}";


  // GỬI MQTT

  mqttClient.publish(
    TOPIC_SENSOR,
    payload.c_str()
  );


  // HIỂN THỊ SERIAL

  Serial.println();
  Serial.println("=================================");
  Serial.println("SENSOR DATA");
  Serial.println("=================================");

  Serial.print("Device      : ");
  Serial.println(DEVICE_ID);

  Serial.print("User        : ");
  Serial.println(DATA_USER);

  Serial.print("Password    : ");
  Serial.println(DATA_PASSWORD);

  Serial.print("Temperature : ");
  Serial.print(temperature, 1);
  Serial.println(" C");

  Serial.print("Humidity    : ");
  Serial.print(humidity, 1);
  Serial.println(" %");

  Serial.print("Light       : ");
  Serial.print(light);
  Serial.println(" ADC");

  Serial.print("Command     : ");
  Serial.println(lastControlCommand);

  Serial.print("Time        : ");
  Serial.println(timestamp);

  Serial.println();

  Serial.println("[MQTT]");
  Serial.println(payload);

  Serial.println("=================================");
}

// 18. HEARTBEAT

void publishHeartbeat()
{
  String payload = "{";

  payload += "\"device\":\"";
  payload += DEVICE_ID;
  payload += "\",";

  payload += "\"status\":\"ONLINE\",";

  payload += "\"timestamp\":\"";
  payload += getTimestamp();
  payload += "\"";

  payload += "}";

  mqttClient.publish(
    TOPIC_HEARTBEAT,
    payload.c_str()
  );

  Serial.print("[HEARTBEAT] ");
  Serial.println(payload);
}


// ============================================================
// 19. SETUP
// ============================================================

void setup()
{
  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println();
  Serial.println("=================================");
  Serial.println("     SMART HOME ESP8266");
  Serial.println("=================================");


  // ----------------------------------------------------------
  // LED
  // ----------------------------------------------------------

  pinMode(LED1_PIN, OUTPUT);

  // Ban đầu LED OFF
  digitalWrite(LED1_PIN, LOW);

  led1State = false;


  // ----------------------------------------------------------
  // DHT22
  // ----------------------------------------------------------

  dht.begin();


  // ----------------------------------------------------------
  // WIFI
  // ----------------------------------------------------------

  connectWiFi();


  // NTP

  setupTime();


  // ----------------------------------------------------------
  // MQTT


  mqttClient.setServer(
    MQTT_SERVER,
    MQTT_PORT
  );

  mqttClient.setCallback(
    mqttCallback
  );


  connectMQTT();


  Serial.println();
  Serial.println("=================================");
  Serial.println("SYSTEM READY!");
  Serial.println("=================================");

  Serial.println("LED1 command:");
  Serial.println("  led1 on");
  Serial.println("  led1 off");

  Serial.println();
}


// ============================================================
// 20. LOOP
// ============================================================

void loop()
{
  // ----------------------------------------------------------
  // WIFI
  // ----------------------------------------------------------

  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("WIFI LOST!");

    connectWiFi();
  }


  // ----------------------------------------------------------
  // MQTT
  // ----------------------------------------------------------

  if (!mqttClient.connected())
  {
    connectMQTT();
  }

  mqttClient.loop();


  // ----------------------------------------------------------
  // SENSOR MỖI 2 GIÂY
  // ----------------------------------------------------------

  unsigned long currentMillis = millis();

  if (
    currentMillis - lastSensorTime >= SENSOR_INTERVAL
  )
  {
    lastSensorTime = currentMillis;

    publishSensorData();
  }


  // ----------------------------------------------------------
  // HEARTBEAT MỖI 5 GIÂY
  // ----------------------------------------------------------

  if (
    currentMillis - lastHeartbeatTime >= HEARTBEAT_INTERVAL
  )
  {
    lastHeartbeatTime = currentMillis;

    publishHeartbeat();
  }
}