# DoorLock – RFID Dashboard

DoorLock är ett IoT-projekt med en ESP32 och en RFID-läsare. Kortförsök skickas
till AWS och visas på en webbsida med inloggning. RGB-LED och buzzer ger
återkoppling när ett kort godkänns eller nekas.

Webbappen bygger på [kursens React/Vite/Amplify-mall](https://github.com/jh83/amplify-vite-react-template-2025-modified).

## Funktioner

- Inloggning med Amazon Cognito.
- Kortförsök i realtid via Amplify Data och GraphQL-subscriptions.
- Sökning på kort-ID och filtrering på godkända eller nekade försök.
- Statistik för de senaste 100 händelserna som visas.
- Enhetsregister med ägare, namn och etiketter.
- Discord-notis vid nekade kortförsök.
- Daglig Discord-sammanställning kl. 08:00 svensk tid efter deployment och aktivering.

Kortbehörigheter hanteras i ESP32-koden. Enhetsregistreringen på webbsidan
lägger inte till eller spärrar RFID-kort.

## Hårdvara

- Arduino Nano ESP32
- RC522 RFID-läsare
- RGB-LED
- Passiv buzzer

## Dataflöde

```text
RFID → ESP32 → MQTT/TLS → AWS IoT Core → IoT-regel
     → doorlockTelemetry → Amplify Data/AppSync → webbsidan
```

`Devices` lagrar enhetens ägare och inställningar. `Telemetry` lagrar kort-ID,
åtkomststatus, enhet, händelse-ID och tidsstämpel. Lambda hämtar ägaren från
enhetsregistret. Inloggade användare kan läsa sina egna händelser.

Det äldre REST-flödet finns också kvar som valbar datakälla:

```text
IoT Core → DoorLockLogs → GetDoorLockLogs → API Gateway → webbsidan
```

Äldre loggar flyttas inte automatiskt till Amplify Data.

## Köra lokalt

Använd Node.js 24 eller senare.

```sh
npm install
npm run dev
```

Öppna [localhost:5173](http://localhost:5173).

För inloggning och Amplify Data behövs projektets genererade
`amplify_outputs.json` bredvid `package.json`. Hämta filen från Amplify efter
deployment, eller kör följande med en AWS-inloggad CLI:

```sh
npx ampx generate outputs --app-id DITT_APP_ID --branch main
```

Starta om Vite när filen är på plats. Utan filen visas en lokal förhandsvisning
som använder REST-API:et. Produktionsversionen kräver auth-konfiguration.

```sh
npm test       # Tester
npm run build # Produktionsbygge
```

## Deployment

Projektet publiceras med AWS Amplify i `eu-north-1`. `amplify.yml` deployar
backend, genererar konfigurationen och bygger webbappen till `dist`.

Registrera `doorlock-01` på webbsidan och koppla IoT-regeln till den genererade
`doorlockTelemetry`-funktionen. Regeln använder följande SQL:

```sql
SELECT topic(2) AS deviceId, eventId, uid, granted,
       timestamp() AS timestamp
FROM 'doorlock/doorlock-01/events'
```

## Discord-notiser

Ange en Discord-webhook under **Enhet och notifieringar** och välj vilka
notiser som ska skickas. Direkta notiser och morgonrapporten aktiveras separat.
Webhook-URL:en innehåller en hemlig token och ska inte läggas i Git.

`doorlockDailySummary` körs av EventBridge Scheduler kl. 08:00 i tidszonen
`Europe/Stockholm`. Rapporten räknar gårdagens Amplify-händelser för enheten
och dess ägare. Sommar- och vintertid hanteras, och alla sidor av resultatet
hämtas. Dagar utan kortförsök ger en rapport med nollor.

Ett privat Lambda-testevent med `{}` skickar en riktig rapport för gårdagen.
Loggarna i CloudWatch visar `Daily summary delivered` och `Daily summary complete`.
Senaste levererade datum sparas på enheten. En dublett kan förekomma om
leveransen lyckas men datumet inte sparas, eller vid samtidiga körningar.

## Begränsningar

- Enhetsregistreringen är anpassad för projektets demo. En tjänst med flera
  användare behöver även kontrollera vem som får registrera varje fysisk enhet.
- Realtidsvyn synkroniserar alla matchande Amplify-poster och visar de senaste
  100. Vid större datamängder behöver även vyn använda begränsade tidsfrågor.
- Det äldre REST-API:et behöver separat åtkomstskydd och CORS-konfiguration.
  Cognito-inloggningen i webbsidan skyddar inte automatiskt REST-routen.
- Registreringsknappen för användarkonton är dold. Självregistrering styrs
  separat i Cognito.
- Online/offline-status och Device Shadow är ännu inte implementerade.

AWS-nycklar, certifikat och lösenord ska hållas utanför Git. Inställningar med
prefixet `VITE_` är synliga i webbläsaren och får inte innehålla hemligheter.
