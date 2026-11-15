import { hasAuthentication } from "./configure";
import React from "react";
import ReactDOM from "react-dom/client";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {hasAuthentication ? (
      <div className="auth-shell">
        <Authenticator hideSignUp>
          {({ user, signOut }) => (
            <App account={user?.signInDetails?.loginId ?? user?.username}
              onSignOut={signOut} authenticated />
          )}
        </Authenticator>
      </div>
    ) : import.meta.env.DEV ? (
      <App authenticated={false} />
    ) : (
      <main className="setup-screen">
        <h1>DoorLock · Konfiguration saknas</h1>
        <p>Amplify-inloggningen är inte konfigurerad. Publicera auth-backend och
          bygg om med den genererade amplify_outputs.json-filen.</p>
      </main>
    )}
  </React.StrictMode>,
);
