#pragma once
#include <Arduino.h>

// Arduino Nano ESP32. A-namnen följer märkningen på kortet.
// RC522
const int SS_PIN = A3;     // RC522 SDA/SS
// B0 = GPIO46, samma anslutning som inbyggd röd LED.
// LED_RED väljer rätt nummer i båda Pin Numbering-lägena.
const int RST_PIN = LED_RED;
const int SCK_PIN = A2;
const int MISO_PIN = A0;
const int MOSI_PIN = A1;

// Extern RGB-LED (ett motstånd per färg) och passiv piezobuzzer.
const int RED_PIN = A5;
const int GREEN_PIN = A7;
const int BLUE_PIN = A6;
const int BUZZER_PIN = A4;
