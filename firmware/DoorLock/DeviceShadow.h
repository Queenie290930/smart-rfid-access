#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <PubSubClient.h>

class DoorLockShadow {
 public:
  DoorLockShadow(PubSubClient& client, int buzzerPin) : mqtt_(client), buzzerPin_(buzzerPin) {}

  void begin(const char* deviceId, const String& bootId) {
    prefix_ = String("$aws/things/") + deviceId + "/shadow";
    bootId_ = bootId;
    preferencesOpen_ = preferences_.begin("doorlock", false);
    if (preferencesOpen_) enabled_ = preferences_.getBool("buzzer", true);
    if (!enabled_) noTone(buzzerPin_);
    Serial.println(enabled_ ? "Buzzer: pa (sparat lage)." : "Buzzer: av (sparat lage).");
  }

  bool buzzerEnabled() const { return enabled_; }

  void onConnected() {
    mqtt_.subscribe((prefix_ + "/get/accepted").c_str(), 1);
    mqtt_.subscribe((prefix_ + "/get/rejected").c_str(), 1);
    mqtt_.subscribe((prefix_ + "/update/delta").c_str(), 1);
    mqtt_.subscribe((prefix_ + "/update/accepted").c_str(), 1);
    mqtt_.subscribe((prefix_ + "/update/rejected").c_str(), 1);
    version_ = 0;
    initialized_ = false;
    needsGet_ = true;
    reportPending_ = false;
    awaitingReport_ = false;
    lastGet_ = millis() - 15000;
  }

  void onMessage(const char* topic, const byte* payload, unsigned int length) {
    String name(topic);
    if (!name.startsWith(prefix_ + "/")) return;
    JsonDocument document;
    if (deserializeJson(document, payload, length)) {
      Serial.println("Kunde inte lasa Shadow-meddelande.");
      return;
    }
    if (name == prefix_ + "/get/rejected") {
      int code = document["code"] | 0;
      if (code == 404) {
        initialized_ = true;
        needsGet_ = false;
        reportPending_ = true;
      } else Serial.printf("Shadow get nekades, kod %d.\n", code);
      return;
    }
    if (name == prefix_ + "/update/rejected") {
      if (awaitingReport_ && document["clientToken"].as<String>() == reportToken_) {
        awaitingReport_ = false;
        Serial.printf("Shadow report nekades, kod %d.\n", document["code"].as<int>());
      }
      return;
    }
    if (name == prefix_ + "/update/accepted") {
      if (awaitingReport_ && document["clientToken"].as<String>() == reportToken_) {
        awaitingReport_ = false;
        reportPending_ = false;
        Serial.println("Shadow: AWS har tagit emot reported.");
      }
      return;
    }
    bool delta = name == prefix_ + "/update/delta";
    if (!delta && name != prefix_ + "/get/accepted") return;
    unsigned long incomingVersion = document["version"] | 0UL;
    if (incomingVersion < version_) return;
    version_ = incomingVersion;
    JsonVariantConst value;
    if (delta) value = document["state"]["buzzerEnabled"];
    else value = document["state"]["desired"]["buzzerEnabled"];
    if (value.is<bool>()) {
      bool next = value.as<bool>();
      if (next != enabled_) {
        enabled_ = next;
        if (!enabled_) { noTone(buzzerPin_); digitalWrite(buzzerPin_, LOW); }
        if (preferencesOpen_) preferences_.putBool("buzzer", enabled_);
      }
      Serial.println(enabled_ ? "Shadow: buzzer pa." : "Shadow: buzzer av.");
    }
    initialized_ = true;
    needsGet_ = false;
    reportPending_ = true;
    // Invalidate any acknowledgement for the previous reported value.
    awaitingReport_ = false;
  }

  void loop() {
    if (!mqtt_.connected()) return;
    if (needsGet_ && millis() - lastGet_ >= 15000) {
      lastGet_ = millis();
      mqtt_.publish((prefix_ + "/get").c_str(), "{}");
    }
    if (!initialized_ || !reportPending_) return;
    if (awaitingReport_ && millis() - lastReport_ < 5000) return;
    // Do not publish inside the MQTT callback: PubSubClient shares its buffer.
    JsonDocument report;
    reportToken_ = bootId_ + "-shadow-" + String(++sequence_);
    report["clientToken"] = reportToken_;
    report["state"]["reported"]["buzzerEnabled"] = enabled_;
    String payload;
    serializeJson(report, payload);
    lastReport_ = millis();
    awaitingReport_ = mqtt_.publish((prefix_ + "/update").c_str(), payload.c_str());
    // If a publish fails, retry after a bounded delay too.
    if (!awaitingReport_) { initialized_ = false; needsGet_ = true; }
  }

 private:
  PubSubClient& mqtt_;
  Preferences preferences_;
  int buzzerPin_;
  bool preferencesOpen_ = false;
  bool enabled_ = true;
  bool initialized_ = false;
  bool needsGet_ = false;
  bool reportPending_ = false;
  bool awaitingReport_ = false;
  unsigned long version_ = 0;
  unsigned long lastGet_ = 0;
  unsigned long lastReport_ = 0;
  unsigned long sequence_ = 0;
  String prefix_;
  String bootId_;
  String reportToken_;
};
