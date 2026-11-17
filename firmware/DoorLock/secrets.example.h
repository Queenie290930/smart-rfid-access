#pragma once
// Copy to secrets.h and fill in your own values. Never commit secrets.h.
const char* WIFI_NAME = "YOUR_2_4_GHZ_WIFI";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* AWS_ENDPOINT = "YOUR_DATA_ATS_ENDPOINT.iot.eu-north-1.amazonaws.com";
const char* DEVICE_ID = "doorlock-01";
const char* TOPIC = "doorlock/doorlock-01/events";
const char* ROOT_CA = R"PEM(-----BEGIN CERTIFICATE-----
YOUR_AMAZON_ROOT_CA_1
-----END CERTIFICATE-----)PEM";
const char* DEVICE_CERT = R"PEM(-----BEGIN CERTIFICATE-----
YOUR_DEVICE_CERTIFICATE
-----END CERTIFICATE-----)PEM";
const char* PRIVATE_KEY = R"PEM(-----BEGIN PRIVATE KEY-----
YOUR_DEVICE_PRIVATE_KEY
-----END PRIVATE KEY-----)PEM";
