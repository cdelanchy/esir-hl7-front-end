import { homepage } from '../package.json'

const clientId =import.meta.env.VITE_FHIR_SERVER_CLIENT_ID || 'client_id'
const clientCredential = import.meta.env.VITE_FHIR_SERVER_CLIENT_CREDENTIAL || 'client_secret'
const basicAuthToken = btoa(`${clientId}:${clientCredential}`)

// Intervalle de rafraîchissement de la liste des patients, en secondes
// (15 s par défaut, ou si la valeur n'est pas un nombre strictement positif).
const DEFAULT_PATIENTS_REFRESH_INTERVAL_SECONDS = 15
const parsedRefreshInterval = Number(import.meta.env.VITE_PATIENTS_REFRESH_INTERVAL_SECONDS)
const patientsRefreshIntervalSeconds = Number.isFinite(parsedRefreshInterval) && parsedRefreshInterval > 0
  ? parsedRefreshInterval
  : DEFAULT_PATIENTS_REFRESH_INTERVAL_SECONDS

// Liens du pied de page. Seules les URL http(s) sont retenues.
const asHttpUrl = (value = '') => (/^https?:\/\//i.test(value.trim()) ? value.trim() : '')

export const config = {
  // Dépôt du projet : champ « homepage » du package.json (import nommé, seul ce champ est embarqué).
  repositoryUrl: asHttpUrl(homepage),
  // Dépôt du projet « père » : VITE_PARENT_REPOSITORY_URL (lien masqué si vide).
  parentRepositoryUrl: asHttpUrl(import.meta.env.VITE_PARENT_REPOSITORY_URL),
  fhirServerUrl: import.meta.env.VITE_FHIR_SERVER_URL || 'http://localhost:8080',
  patientsRefreshIntervalSeconds,
  fhirServerBasicAuth: {
    clientId,
    clientCredential,
    token: basicAuthToken
  }
}
