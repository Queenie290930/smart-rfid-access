# DoorLock – RFID Dashboard

Lärarens React/Vite/Amplify-mall, anpassad till ESP32 + RC522 + RGB + buzzer.

## Befintligt dataflöde

RFID → ESP32 → MQTT/TLS → AWS IoT Core → IoT-regel → DoorLockLogs (DynamoDB)
→ GetDoorLockLogs (Lambda) → API Gateway GET /logs → React-dashboard.

API: https://9lxucnwrvi.execute-api.eu-north-1.amazonaws.com/logs

Dashboarden visar UID, godkänd/nekad åtkomst, tid, enhet, sökning, statusfilter,
statistik och valfri uppdatering var 30:e sekund. Tider visas i Europe/Stockholm.
Statistiken gäller de upp till 100 loggar API:et returnerar, inte hela databasen.
Ingen servo eller kortadministration ingår. Kortbehörigheter styrs ännu i ESP32.

## Lokal start

1. Använd Node.js 24 LTS eller senare och kör `npm install`.
2. Kör `npm run dev` och öppna http://localhost:5173.
3. Om `amplify_outputs.json` saknas visas en tydligt markerad lokal förhandsvisning.
   Den hämtar verkliga loggar från befintligt API; den innehåller inga exempeldata.
4. Om API-anrop misslyckas, konfigurera CORS enligt nedan.
5. `npm test` verifierar validering, sortering och filtrering; `npm run build` bygger appen.

## Amplify-backend och inloggning

`amplify/backend.ts` skapar bara Cognito-auth. Mallens väderdatamodeller,
SMHI-jobb och temperaturfunktioner är borttagna. Befintligt IoT Core, Lambda,
API Gateway och DoorLockLogs ändras inte av den här koden.

Koppla ditt eget GitHub-repository till Amplify i eu-north-1. Befintlig
`amplify.yml` deployar backend och genererar `amplify_outputs.json` före bygget.
Filen ska inte skrivas för hand eller ersättas med lärarens inställningar.
För lokal inloggning efter en lyckad deployment: hämta den genererade filen
från Amplify-konsolen, eller med en AWS-inloggad CLI:

```sh
npx ampx generate outputs --app-id DITT_APP_ID --branch DIN_BRANCH
```

Starta om Vite efter att filen lagts i projektroten. Inloggning används så fort
giltiga auth-inställningar finns. Produktionsbygget visar en konfigurationssida
om filen saknas och visar då ingen dashboard. Lokal förhandsvisning används
endast i Vites utvecklingsläge. Produktionsinloggningen saknar publik registrering;
skapa ditt eget användarkonto i den Cognito user pool Amplify skapar.

## CORS och API-behörigheter

API Gateway → DoorLockAPI → CORS. Tillåt följande exakta origins:

- http://localhost:5173 (utveckling)
- din Amplify-adress, exempelvis https://main.APPID.amplifyapp.com

Allowed methods: GET. Allowed headers: Authorization. Credentials: av.
Spara; $default använder auto-deploy. Använd inte en avslutande slash i origin.

Cognito-inloggning i frontend skyddar inte API:et i sig. Befintligt GET /logs är
fortfarande publikt tills en JWT-authorizer kopplats till routen. Efter Amplify-
deployment, konfigurera i API Gateway → Authorization:

- Typ JWT. Identity source: $request.header.Authorization.
- Issuer: https://cognito-idp.eu-north-1.amazonaws.com/USER_POOL_ID
- Audience: user_pool_client_id från din genererade amplify_outputs.json.
- Koppla authorizern till GET /logs. För ett enkelt inloggat testkonto kan scope
  aws.cognito.signin.user.admin användas; verifiera att det finns i access-token.

Appen skickar Cognitos access-token i Authorization-headern när användaren
är inloggad. Efter att routen skyddats fungerar lokal förhandsvisning utan
inloggning inte mot den; hämta då dina Amplify-inställningar och logga in.
Skapa bara avsedda användare: inloggade användare med den konfigurerade
behörigheten läser samma doorlock-01-loggar. Fleranvändarägarskap ingår inte.

Lambda använder för närvarande PowerUserRole. Byt inför fortsatt drift till
en separat roll för CloudWatch-loggning och dynamodb:Query på just DoorLockLogs;
ändra inte en delad skolroll. Inga AWS-nycklar, lösenord eller ESP32-certifikat
ska finnas i frontend eller Git. VITE_* är publika inställningar.

## Avgränsning och kvarstående kontroller

API:et hämtar enhetens alla loggar och väljer sedan de 100 senaste. Vid större
datamängder behövs tidsindex och paginering i backend. Nya Cognito-resurser,
GitHub/Amplify-deployment, CORS och JWT-authorizer behöver konfigureras i AWS.
De skapas inte av att bara köra npm run dev. npm:s rapporterade beroendesårbarheter
behöver granskas före publicering; kör inte audit fix --force utan genomgång.

## Dokumentation

- https://docs.amplify.aws/react/reference/amplify_outputs/
- https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html
- https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html
