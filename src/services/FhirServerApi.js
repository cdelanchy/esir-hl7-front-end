import axios from 'axios'
import { config } from '@/config'

const fhirServerApi = axios.create({
  baseURL: config.aidboxUrl,
  headers: {
    'Content-Type': 'application/fhir+json',
    Accept: 'application/fhir+json',
    Authorization: `Basic ${config.aidboxBasicAuth.token}`
  }
})

export default {
  get (url, params = {}) {
    return fhirServerApi.get(url, { params })
  },

  post (url, data = {}, configOverride = {}) {
    return fhirServerApi.post(url, data, configOverride)
  },

  put (url, data = {}, configOverride = {}) {
    return fhirServerApi.put(url, data, configOverride)
  },

  patch (url, data = {}, configOverride = {}) {
    return fhirServerApi.patch(url, data, configOverride)
  },

  delete (url, configOverride = {}) {
    return fhirServerApi.delete(url, configOverride)
  },

  // Recherche générique ; un 400/404 est traité comme « aucun résultat ».
  async search (resourceType, params = {}) {
    try {
      return await this.get(`/fhir/${resourceType}`, params)
    } catch (error) {
      if (error.response && (error.response.status === 404 || error.response.status === 400)) {
        return { data: { entry: [] } }
      }
      throw error
    }
  },

  async searchByIdentifier (resourceType, identifierSystem, identifierValue) {
    const system = identifierSystem || 'urn:esrh'
    const value = identifierValue || ''

    if (!value) {
      return { data: { entry: [] } }
    }

    return this.search(resourceType, { identifier: `${system}|${value}` })
  },

  async searchPatientByIdentifier (identifierSystem, identifierValue) {
    return this.searchByIdentifier('Patient', identifierSystem, identifierValue)
  },

  // Encounter « séjour » (identifié par PV1-19)
  async searchEncounterByIdentifier (identifierSystem, identifierValue) {
    return this.searchByIdentifier('Encounter', identifierSystem, identifierValue)
  },

  // Dernier Encounter « mouvement » rattaché (partOf) au séjour
  async searchLatestMovementEncounter (visitEncounterId) {
    if (!visitEncounterId) {
      return { data: { entry: [] } }
    }

    return this.search('Encounter', {
      'part-of': `Encounter/${visitEncounterId}`,
      _sort: '-date',
      _count: 1
    })
  },

  async submitTransactionBundle (bundle) {
    return this.post('/fhir/', bundle)
  }
}
