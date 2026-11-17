#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <time.h>

// MFRC522 och PubSubClient i Arduino IDE.

// 1. Börja med false för att testa RFID, RGB och buzzer utan AWS.
const bool USE_AWS = true;

// Wi-Fi och AWS-uppgifter finns i den separata fliken secrets.h.
#include "secrets.h"
#include "pins.h"
#include "DeviceShadow.h"

// 3. Läs kortets UID i Serial Monitor och skriv det här.
// Versaler utan mellanslag. Tom sträng innebär att alla kort nekas.
const String APPROVED_UID = "43FE3C16";
// Valfri extra tagg: fyll i dess UID. Tom sträng ger ingen extra behörighet.
const String APPROVED_TAG_UID = "";

// false = RGB med gemensam katod (GND), true = gemensam anod (3V3).
const bool RGB_COMMON_ANODE = false;
const unsigned long DENIED_LIGHT_TIME = 1500;
byte deniedAttempts = 0;  // Tre nekade försök i rad ger varning.
unsigned long feedbackStarted = 0;
bool feedbackActive = false;

const unsigned long GRANTED_LIGHT_TIME = 5000;

MFRC522 rfid(SS_PIN, RST_PIN);
WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);
DoorLockShadow deviceShadow(mqtt, BUZZER_PIN);

unsigned long lastAttempt = 0;
unsigned long lastWiFiAttempt = 0;
unsigned long eventNumber = 0;
String bootId;
String pendingLog;

void connectAWS() {
  // Visa väntestatus högst var tionde sekund, utan lösenord/certifikat.
  static unsigned long lastStatus = millis() - 10000;
  static bool wifiReported = false;
  if (WiFi.status() != WL_CONNECTED) {
    wifiReported = false;
    if (millis() - lastStatus >= 10000) {
      lastStatus = millis();
      Serial.print("Vantar pa Wi-Fi. Statuskod: ");
      Serial.println((int)WiFi.status());
    }
    if (millis() - lastWiFiAttempt >= 15000) {
      lastWiFiAttempt = millis();
      WiFi.reconnect();
    }
    return;
  }
  if (!wifiReported) {
    Serial.print("Wi-Fi anslutet. IP: ");
    Serial.println(WiFi.localIP());
    wifiReported = true;
  }
  if (time(nullptr) < 1700000000) {
    if (millis() - lastStatus >= 10000) {
      lastStatus = millis();
      Serial.println("Vantar pa NTP-tid. TLS till AWS behover korrekt tid.");
    }
    return;
  }
  if (!mqtt.connected() && millis() - lastAttempt >= 10000) {
    lastAttempt = millis();
    Serial.println("Ansluter till AWS via MQTT/TLS...");
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println("AWS ansluten!");
      deviceShadow.onConnected();
    }
    else {
      Serial.print("AWS kunde inte ansluta. MQTT-status: ");
      Serial.println(mqtt.state());
      char tlsError[160] = {};
      int tlsCode = secureClient.lastError(tlsError, sizeof(tlsError));
      Serial.printf("TLS-status: %d %s\n", tlsCode, tlsError);
    }
  }
  if (mqtt.connected()) {
    mqtt.loop();
    deviceShadow.loop();
    if (pendingLog.length() && mqtt.publish(TOPIC, pendingLog.c_str())) {
      pendingLog = "";
    }
  }
}

// Skriv s i Serial Monitor for en kontroll utan upprepade statusrader.
void printReaderStatus() {
  Serial.println("DoorLock kontroll S1");
  Serial.print("Programmet kor. Drifttid i sekunder: ");
  Serial.println(millis() / 1000);
  Serial.print("RC522 version: 0x");
  Serial.println(rfid.PCD_ReadRegister(MFRC522::VersionReg), HEX);
  Serial.print("Pinvarden SS/RST/SCK/MISO/MOSI: ");
  Serial.print(SS_PIN); Serial.print(" / ");
  Serial.print(RST_PIN); Serial.print(" / ");
  Serial.print(SCK_PIN); Serial.print(" / ");
  Serial.print(MISO_PIN); Serial.print(" / ");
  Serial.println(MOSI_PIN);
}

void setRGB(bool red, bool green, bool blue) {
  digitalWrite(RED_PIN, (red != RGB_COMMON_ANODE) ? HIGH : LOW);
  digitalWrite(GREEN_PIN, (green != RGB_COMMON_ANODE) ? HIGH : LOW);
  digitalWrite(BLUE_PIN, (blue != RGB_COMMON_ANODE) ? HIGH : LOW);
}

void showAccessFeedback(bool approved) {
  feedbackStarted = millis();
  feedbackActive = true;
  if (approved) {
    deniedAttempts = 0;
    setRGB(false, true, false);  // Grönt: godkänd.
    if (deviceShadow.buzzerEnabled()) tone(BUZZER_PIN, 2200, 150);
  } else {
    if (deniedAttempts < 3) deniedAttempts++;
    Serial.print("Nekade forsok i rad: ");
    Serial.println(deniedAttempts);
    if (deniedAttempts >= 3) {
      setRGB(true, true, false);  // Gult: varning från tredje försöket.
      if (deviceShadow.buzzerEnabled()) tone(BUZZER_PIN, 1000, 1000);
      Serial.println("VARNING: minst 3 nekade forsok i rad!");
    } else {
      setRGB(true, false, false);  // Rött: nekad.
      if (deviceShadow.buzzerEnabled()) tone(BUZZER_PIN, 400, 400);
    }
  }
}

void updateAccessFeedback() {
  // Gul varning ligger kvar tills ett godkänt kort visas eller kortet startas om.
  if (!feedbackActive || deniedAttempts >= 3) return;
  unsigned long duration = deniedAttempts == 0 ? GRANTED_LIGHT_TIME : DENIED_LIGHT_TIME;
  if (millis() - feedbackStarted >= duration) {
    setRGB(false, false, false);
    feedbackActive = false;
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  setRGB(false, false, false);

  // Ge USB tid att ansluta till Serial Monitor, men starta även utan dator.
  unsigned long serialWaitStarted = millis();
  while (!Serial && millis() - serialWaitStarted < 5000) delay(10);
  delay(100);
  Serial.println("DoorLock startar. Testar RC522...");
  Serial.println(USE_AWS ? "AWS aktiverat." : "Lokalt test: AWS avstangt.");

  // SPI-pinnarna finns i pins.h.
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  rfid.PCD_Init();
  byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.print("RC522 versionsregister: 0x");
  Serial.println(version, HEX);
  if (version == 0 || version == 255) {
    while (true) {
      Serial.println("RC522 svarar inte.");
      delay(2000);
    }
  }

  bootId = String((uint32_t)esp_random(), HEX) + String((uint32_t)esp_random(), HEX);
  deviceShadow.begin(DEVICE_ID, bootId);

  if (USE_AWS) {
    WiFi.begin(WIFI_NAME, WIFI_PASSWORD);
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    secureClient.setCACert(ROOT_CA);
    secureClient.setCertificate(DEVICE_CERT);
    secureClient.setPrivateKey(PRIVATE_KEY);
    secureClient.setHandshakeTimeout(5);
    mqtt.setServer(AWS_ENDPOINT, 8883);
    mqtt.setSocketTimeout(5);
    if (!mqtt.setBufferSize(4096)) Serial.println("Kunde inte reservera MQTT-buffer for Shadow.");
    mqtt.setCallback([](char* topic, byte* payload, unsigned int length) {
      deviceShadow.onMessage(topic, payload, length);
    });
  }
  Serial.println("Status: Vantar pa RFID-kort. Skriv s + Enter for kontroll (S1).");
}

void loop() {
  updateAccessFeedback();
  if (Serial.available()) {
    char command = Serial.read();
    if (command == 's' || command == 'S') printReaderStatus();
  }

  if (USE_AWS) connectAWS();

  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 16) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  bool approved = (APPROVED_UID.length() > 0 && uid == APPROVED_UID) ||
                  (APPROVED_TAG_UID.length() > 0 && uid == APPROVED_TAG_UID);
  Serial.println("UID: " + uid);
  Serial.println(approved ? "Godkant kort!" : "Nekat kort!");

  showAccessFeedback(approved);

  if (USE_AWS) {
    // Enkel loggning: en väntande post i RAM. Nytt försök ersätter osänd post.
    String eventId = bootId + "-" + String(++eventNumber);
    pendingLog = "{\"deviceId\":\"" + String(DEVICE_ID) +
      "\",\"eventId\":\"" + eventId + "\",\"uid\":\"" + uid +
      "\",\"granted\":" + String(approved ? "true" : "false") + "}";
  }
}