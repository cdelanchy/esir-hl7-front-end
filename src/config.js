const clientId = import.meta.env.VITE_AIDBOX_CLIENT_ID || 'client_id'
const clientCredential = import.meta.env.VITE_AIDBOX_CLIENT_CREDENTIAL || 'client_secret'
const basicAuthToken = btoa(`${clientId}:${clientCredential}`)

// Intervalle de rafraîchissement de la liste des patients, en secondes
// (15 s par défaut, ou si la valeur n'est pas un nombre strictement positif).
const DEFAULT_PATIENTS_REFRESH_INTERVAL_SECONDS = 15
const parsedRefreshInterval = Number(import.meta.env.VITE_PATIENTS_REFRESH_INTERVAL_SECONDS)
const patientsRefreshIntervalSeconds = Number.isFinite(parsedRefreshInterval) && parsedRefreshInterval > 0
  ? parsedRefreshInterval
  : DEFAULT_PATIENTS_REFRESH_INTERVAL_SECONDS

export const config = {
  aidboxUrl: import.meta.env.VITE_AIDBOX_URL || 'http://localhost:8080',
  patientsRefreshIntervalSeconds,
  aidboxBasicAuth: {
    clientId,
    clientCredential,
    token: basicAuthToken
  }
}
