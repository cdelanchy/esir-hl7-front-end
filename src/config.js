const clientId = import.meta.env.VITE_AIDBOX_CLIENT_ID || 'client_id'
const clientCredential = import.meta.env.VITE_AIDBOX_CLIENT_CREDENTIAL || 'client_secret'
const basicAuthToken = btoa(`${clientId}:${clientCredential}`)

export const config = {
  aidboxUrl: import.meta.env.VITE_AIDBOX_URL || 'http://localhost:8080',
  aidboxBasicAuth: {
    clientId,
    clientCredential,
    token: basicAuthToken
  }
}
