# RFID-åtkomst med RGB och buzzer – Arduino IDE och ESP32

Öppna `DoorLock.ino` i Arduino IDE. Detta är en Arduino-sketch för ESP32,
med `setup()` och `loop()`. Välj kortet **Arduino Nano ESP32**. Välj Tools → Pin Numbering → By GPIO number (legacy).
Koden använder A-namn som motsvarar kortets tryckta märkning.

## Koppling

| RC522 | ESP32 |
| --- | --- |
| 3.3V | 3V3 |
| GND | GND |
| SDA/SS | A3 |
| SCK | A2 |
| MOSI | A1 |
| MISO | A0 |
| RST | B0 |
| IRQ | Ej ansluten |

Projektet använder RC522, RFID-kort/taggar, RGB-LED och passiv piezobuzzer.
RC522 ska ha 3,3 V. Alla komponenter ska ha gemensam GND.

## RGB och buzzer

Kopplingen ovan följer `pins.h` och din koppling med A0–A7 samt B0.
B0 är GPIO46 och delar anslutning med kortets inbyggda röda LED.
Koden använder därför `LED_RED` för RC522:s RST så att pinnen blir rätt i
båda Pin Numbering-lägena. Den externa RGB-lampans röda ben använder A5.
Den inbyggda röda LED:en kan lysa när RC522 återställs.
B0 påverkar startläget tillsammans med B1: undvik att koppla dem till GND
vid start. Se [Arduinos B0/B1-dokumentation](https://support.arduino.cc/hc/en-us/articles/9625819325212-About-the-B1-and-B0-pins-on-the-Nano-ESP32).

Använd en extern vanlig RGB-LED med fyra ben och en **passiv piezobuzzer**
som kan drivas med 3,3 V och högst GPIO-pinnens tillåtna ström.
En buzzer som kräver högre ström ska drivas via transistor eller drivmodul,
inte direkt från GPIO. Detta är inte en WS2812/NeoPixel-LED.

| Komponent | Arduino Nano ESP32 |
| --- | --- |
| RGB rött ben | A5 via 220–330 ohm motstånd |
| RGB grönt ben | A7 via 220–330 ohm motstånd |
| RGB blått ben | A6 via 220–330 ohm motstånd |
| RGB gemensam katod | GND |
| Passiv piezobuzzer + | A4 |
| Passiv piezobuzzer − | GND |

Kontrollera LED:ens benordning i dess datablad. För RGB med gemensam anod:
koppla gemensamt ben till **3V3** och sätt `RGB_COMMON_ANODE = true`.
Använd ett separat motstånd för varje färg.

- Godkänt kort eller tagg: grönt i fem sekunder och kort ljus ton.
- Första och andra nekade försöket i rad: rött i 1,5 sekunder och låg ton.
- Tredje och fortsatta nekade försöket i rad: gult och en sekund varningston.
- Gult ligger kvar tills ett godkänt kort/tagg visas eller enheten startas om.
  Godkänd åtkomst nollställer räknaren. Ingen tidsbestämd spärr införs.

`APPROVED_UID` behåller ditt befintliga godkända kort. Lägg vid behov till en
andra godkänd RFID-tagg i `APPROVED_TAG_UID`. Tom sträng godkänner ingen tagg.
Kort och taggar läses på samma sätt och måste vara kompatibla med RC522
(13,56 MHz, exempelvis MIFARE). Ta bort kortet/taggen mellan avläsningar.

### Testa färger och varning

1. Visa ditt godkända kort: grönt i fem sekunder och kort ton.
2. Visa ett okänt kort två gånger (ta bort det mellan gångerna): rött varje gång.
3. Visa samma okända kort en tredje gång: gult och längre varningston.
4. Visa godkänt kort: grönt och räknaren nollställs.
5. Visa okänt kort igen: rött, eftersom det nu är första nekade försöket.

## Testa först utan AWS

1. Installera **esp32 by Espressif Systems** i Boards Manager.
2. Installera **MFRC522**, **PubSubClient** och **ArduinoJson** i Library Manager.
3. Låt `USE_AWS = false`. Ladda upp och öppna Serial Monitor på **115200 baud**.
4. Visa ett kort. Kopiera UID till `APPROVED_UID`, exempelvis `"A1B2C3D4"`.
5. Ladda upp igen. Det godkända kortet ger grönt ljus i fem sekunder och ett kort pip.
6. Prova ett annat kort: det ska nekas. Ta bort kortet mellan avläsningar.

Kortläsningen fortsätter medan lampan lyser. Ett nytt avläst kort uppdaterar
färg och ljud direkt. Projektet visar behörighet med ljus och ljud.

## Koppla AWS och DynamoDB

Flöde: RFID → ESP32 → AWS IoT Core → IoT-regel → DynamoDB.
Kortets behörighet avgörs lokalt av `APPROVED_UID` och `APPROVED_TAG_UID`. DynamoDB lagrar loggar.

1. I AWS IoT Core, skapa en Thing med namnet `doorlock-01`. Skapa och aktivera
   ett enhetscertifikat. Koppla det till Thing, hämta certifikat och privat
   nyckel samt Amazon Root CA 1. Lägg hela PEM-texterna i respektive sträng i `secrets.h`.
2. Skapa en IoT-policy enligt nedan. Byt REGION och ACCOUNT_ID mot dina värden.
   Koppla policyn till certifikatet, inte till ett IAM-användarkonto.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:client/doorlock-01"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Publish",
      "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:topic/doorlock/doorlock-01/events"
    }
  ]
}
```

3. Skapa en DynamoDB-tabell `DoorLockLogs`: partition key `deviceId` (String)
   och sort key `eventId` (String). Välj on-demand för ett enkelt test.
4. Skapa en regel i IoT Core med SQL-version **2016-03-23**:

```sql
SELECT *, timestamp() AS receivedAt FROM 'doorlock/doorlock-01/events'
```

5. Lägg till regelåtgärden **DynamoDBv2** (skriv meddelandets attribut till
   separata kolumner), välj tabellen och en IAM-roll som AWS IoT får anta
   (`iot.amazonaws.com`) med `dynamodb:PutItem` på just tabellens ARN.
   Använd konsolens funktion för att skapa rollen om den erbjuds.
6. Fyll i Wi-Fi (2,4 GHz) och din **Device data endpoint / iot:Data-ATS** från
   IoT Core Settings i `secrets.h`. Endpoint är ett värdnamn utan `https://`.
7. Sätt `USE_AWS = true` och ladda upp. Enheten behöver NTP-tid och utgående
   port 8883 för MQTT/TLS. Håll certifikat och privat nyckel hemliga; dela inte
   `secrets.h` och checka inte in den i Git. Filen finns i `.gitignore`.
8. Prenumerera på `doorlock/doorlock-01/events` i AWS MQTT test client.
   Visa ett kort. Loggen skickas i nästa loopvarv när MQTT är anslutet.
   Kontrollera sedan posten i DynamoDB. `receivedAt` är AWS mottagningstid i ms.

Exempel på meddelande:

```json
{"deviceId":"doorlock-01","eventId":"a12b34c56d78-1","uid":"A1B2C3D4","granted":true}
```

Enkelheten innebär begränsningar: bara en osänd logg sparas i RAM och den
ersätts av nästa kortförsök. Omstart tappar den posten. MQTT använder QoS 0,
så loggningen är inte garanterad. Vid nätverksproblem kan kortläsningen
pausa under återanslutning. UID kan kopieras: använd detta som skolprojekt/prototyp, inte som
enda skydd för en verklig ytterdörr. AWS-resurser skapas av dig och kan kosta pengar.

## Dokumentation

- RFID och UID-begränsningar: https://github.com/miguelbalboa/rfid
- AWS DynamoDBv2: https://docs.aws.amazon.com/iot/latest/developerguide/dynamodb-v2-rule-action.html
- AWS IoT-policyer: https://docs.aws.amazon.com/iot/latest/developerguide/iot-policy-actions.html

## Separata hemligheter

Wi-Fi-namn, lösenord, AWS-endpoint, enhets-ID, topic, certifikat och privat
nyckel finns i `secrets.h`, i samma mapp som `DoorLock.ino`. Öppna eller
skapa filen som en flik i Arduino IDE. Huvudkoden läser den med
`#include "secrets.h"`. Behåll båda filerna i samma mapp när du kompilerar.

Fyll i uppgifterna i `secrets.h`. `APPROVED_UID` och `USE_AWS` ändras
fortfarande i `DoorLock.ino`. `.gitignore` hindrar Git från att lägga till
`secrets.h` som en ny fil; redan spårade filer påverkas inte.
Uppgifterna krypteras inte av att flyttas till en annan fil.

## Separata pinnar

Alla signalpinnar finns nu i `pins.h`: RC522 SS, RST, SCK, MISO och MOSI
samt RGB-lampans och buzzerns signalpinnar. Huvudkoden läser filen med `#include "pins.h"`.
Behåll `DoorLock.ino`, `pins.h` och `secrets.h` i samma mapp. Ändra pinnarna
i `pins.h` om du ändrar kopplingen. Matning och GND kopplas enligt tabellen ovan.


## Device Shadow och buzzer

DeviceShadow.h hanterar buzzerinställningen. Lägg filen i samma sketchmapp.
Använd hela policyn i webbprojektets firmware/doorlock-iot-policy.json och ersätt REGION och
ACCOUNT_ID med egna värden. Den tidigare publiceringspolicyn ovan räcker
för kortloggar men inte för att ta emot Shadow-meddelanden.

Firmware prenumererar på get/accepted, get/rejected, update/delta,
update/accepted och update/rejected för enhetens klassiska Shadow.
Vid anslutning begär den aktuellt läge via /get, tillämpar desired.buzzerEnabled
och publicerar sitt reported-värde via /update. Reported skickas om om AWS inte
bekräftar. Inställningen sparas i NVS och behålls vid omstart. Ljud av stoppar
pågående ton; kortläsning, RGB och loggar fortsätter som vanligt.

För att testa: ladda upp firmware, starta Serial Monitor på 115200 baud,
ändra buzzern på webbsidan och kontrollera både rapporterat läge och ljudet
vid nästa kortförsök. Inställningar i molnet kräver rätt IoT-policy och en
ansluten enhet innan de kan bekräftas av ESP32.
