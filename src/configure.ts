import { Amplify } from "aws-amplify";

// Vite accepterar att den genererade filen inte finns vid första lokala starten.
// Amplifys pipeline genererar filen före produktionsbygget.
const modules = import.meta.glob<{ auth?: unknown; data?: unknown }>("../amplify_outputs.json", {
  eager: true,
  import: "default",
});
const outputs = modules["../amplify_outputs.json"];
export const hasAuthentication = Boolean(outputs?.auth);
export const hasData = Boolean(outputs?.auth && outputs?.data);

if (hasAuthentication) {
  Amplify.configure(outputs as Parameters<typeof Amplify.configure>[0]);
}
