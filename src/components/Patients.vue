<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">TP ESI</p>
        <h1>Suivi des patients dans le SIH</h1>
      </div>
      <div class="topbar-actions">
        <button
          type="button"
          class="toggle-button"
          :aria-pressed="showBundle"
          :disabled="!lastBundle"
          :title="lastBundle ? '' : 'Aucun bundle généré : chargez d’abord un fichier HL7'"
          @click="showBundle = !showBundle"
        >
          <span class="toggle-switch" aria-hidden="true"></span>
          Affichage du Bundle FHIR
        </button>
        <label class="upload-button">
          <input type="file" accept=".hl7,.txt" @change="onFileSelected" />
          <span>Upload HL7</span>
        </label>
      </div>
    </header>

    <section class="panel summary-panel">
      <div>
        <span class="label">Patients</span>
        <strong>{{ patients.length }}</strong>
      </div>
      <div>
        <span class="label">Dernier message</span>
        <strong>{{ lastMessageType || 'Aucun' }}</strong>
      </div>
      <div>
        <span class="label">Mouvements</span>
        <strong>{{ movementCount }}</strong>
      </div>
    </section>

    <section v-if="lastAlert" class="panel alert-panel" :class="lastAlert.type">
      {{ lastAlert.message }}
    </section>

    <section class="panel">
      <h2>Liste des patients</h2>
      <p class="sync-info" :class="{ error: syncError }">
        <template v-if="syncError">Synchronisation avec le serveur FHIR impossible : {{ syncError }}</template>
        <template v-else-if="lastSyncAt">Synchronisé avec le serveur FHIR à {{ lastSyncAt.toLocaleTimeString('fr-FR') }} (actualisation toutes les {{ refreshIntervalSeconds }} s)</template>
        <template v-else>Chargement des patients depuis le serveur FHIR…</template>
      </p>
      <div v-if="patients.length" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom de naissance</th>
              <th>Nom d'usage</th>
              <th>Prénom</th>
              <th>Sexe</th>
              <th>IPP</th>
              <th>Date de naissance</th>
              <th>Date d'admission</th>
              <th>Service</th>
              <th>Chambre</th>
              <th>Lit</th>
              <th>Date de sortie</th>
              <th>Statut</th>
              <th><span class="visually-hidden">Historique</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="patient in patients" :key="patient.id">
            <tr :class="patient.status">
              <td>{{ patient.name }}</td>
              <td>{{ patient.usualName }}</td>
              <td>{{ patient.firstname }}</td>
              <td>{{ patient.sex }}</td>
              <td>{{ patient.ippDisplay || patient.ipp }}</td>
              <td>{{ formatDate(patient.birthDate, false) }}</td>
              <td>{{ formatDate(patient.admissionDate) }}</td>
              <td>{{ patient.service || '—' }}</td>
              <td>{{ patient.room || '—' }}</td>
              <td>{{ patient.bed || '—' }}</td>
              <td>{{ formatDate(patient.dischargeDate) }}</td>
              <td>{{ patient.statusLabel }}</td>
              <td>
                <button
                  type="button"
                  class="history-button"
                  :aria-expanded="isExpanded(patient.id)"
                  :disabled="!patient.history.length"
                  @click="toggleHistory(patient.id)"
                >
                  {{ isExpanded(patient.id) ? 'Masquer' : 'Historique' }}
                </button>
              </td>
            </tr>
            <tr v-if="isExpanded(patient.id)" class="history-row">
              <td :colspan="13">
                <div v-for="visit in patient.history" :key="visit.id" class="history-visit">
                  <p class="history-visit-title">
                    <strong>Venue {{ visit.visitNumber }}</strong>
                    — du {{ formatDate(visit.start) }}
                    {{ visit.finished ? `au ${formatDate(visit.end)}` : '(en cours)' }}
                  </p>
                  <table v-if="visit.movements.length" class="history-table">
                    <thead>
                      <tr>
                        <th>Mouvement</th>
                        <th>Date / heure</th>
                        <th>Service</th>
                        <th>Chambre</th>
                        <th>Lit</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="movement in visit.movements" :key="movement.id" :class="movement.status">
                        <td>{{ movement.typeLabel }}</td>
                        <td>{{ formatDate(movement.date) }}</td>
                        <td>{{ movement.service || '—' }}</td>
                        <td>{{ movement.room || '—' }}</td>
                        <td>{{ movement.bed || '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p v-else class="history-empty">Aucun mouvement enregistré pour cette venue.</p>
                </div>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">
        Aucun patient en mémoire. Chargez un fichier HL7 pour commencer.
      </div>
    </section>

    <section v-if="lastBundle && showBundle" class="panel bundle-panel">
      <h2>Bundle FHIR généré</h2>
      <pre>{{ prettyBundle }}</pre>
    </section>
  </div>
</template>

<script>
import { parseHl7Message, transformHl7ToFhir } from '@/services/hl7Transformer'
import FhirServerApi from '@/services/FhirServerApi'
import { buildPatientRows } from '@/services/patientRows'
import { config } from '@/config'

// Rafraîchissement périodique pour voir les patients poussés par d'autres clients
// (VITE_PATIENTS_REFRESH_INTERVAL_SECONDS dans le .env).
const REFRESH_INTERVAL_MS = config.patientsRefreshIntervalSeconds * 1000

export default {
  name: 'Patients',
  data () {
    return {
      patients: [],
      lastBundle: null,
      // Affichage du panneau « Bundle FHIR généré » (masqué par défaut).
      showBundle: false,
      lastMessageType: '',
      lastAlert: null,
      refreshIntervalSeconds: REFRESH_INTERVAL_MS / 1000,
      lastSyncAt: null,
      syncError: '',
      // Ids des patients dont l'historique est déplié (conservé entre deux rafraîchissements).
      expandedPatientIds: [],
      refreshTimer: null,
      refreshInFlight: null
    }
  },
  mounted () {
    this.refreshPatients()
    this.refreshTimer = setInterval(() => this.refreshPatients(), REFRESH_INTERVAL_MS)
  },
  beforeUnmount () {
    clearInterval(this.refreshTimer)
  },
  computed: {
    // Nombre total de mouvements (admissions, transferts, sorties) enregistrés sur le serveur.
    movementCount () {
      return this.patients.reduce((total, patient) => total + patient.history.reduce((sum, visit) => sum + visit.movements.length, 0), 0)
    },
    prettyBundle () {
      return this.lastBundle ? JSON.stringify(this.lastBundle, null, 2) : ''
    }
  },
  methods: {
    isExpanded (patientId) {
      return this.expandedPatientIds.includes(patientId)
    },
    toggleHistory (patientId) {
      this.expandedPatientIds = this.isExpanded(patientId)
        ? this.expandedPatientIds.filter(id => id !== patientId)
        : [...this.expandedPatientIds, patientId]
    },
    // Recharge la liste depuis le serveur FHIR. Un appel déjà en cours est
    // réutilisé pour éviter les requêtes concurrentes.
    refreshPatients () {
      if (this.refreshInFlight) return this.refreshInFlight

      this.refreshInFlight = (async () => {
        try {
          const [patients, encounters] = await Promise.all([
            FhirServerApi.searchAll('Patient'),
            FhirServerApi.searchAll('Encounter')
          ])
          this.patients = buildPatientRows(patients, encounters)
          this.lastSyncAt = new Date()
          this.syncError = ''
        } catch (error) {
          this.syncError = error.message || 'Erreur inconnue'
        } finally {
          this.refreshInFlight = null
        }
      })()

      return this.refreshInFlight
    },
    formatDate (value, includeTime = true) {
      if (!value || value === '—' || value === '-') return '—'

      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value

      const formatter = new Intl.DateTimeFormat('fr-FR', includeTime
        ? {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }
        : {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })

      const formatted = formatter.format(date)
      return includeTime ? formatted.replace(',', ' -') : formatted
    },
    // État connu du patient, au format attendu par transformHl7ToFhir :
    // vide s'il n'existe pas sur le serveur FHIR (A01 autorisé, A02/A03 refusés),
    // sinon une entrée (A01 refusé, A02/A03 autorisés) dont le statut de sortie et
    // les dates viennent de l'Encounter séjour (PV1-19) et de son dernier mouvement.
    async getExistingPatients ({ messageType, ipp, patientIdentifierSystem, visitNumber, visitNumberSystem }) {
      const patientSearch = await FhirServerApi.searchPatientByIdentifier(patientIdentifierSystem, ipp)
      const existsOnServer = (patientSearch?.data?.entry || []).length > 0
      if (!existsOnServer) return []

      const existingPatient = { ipp, admissionDate: null, lastEventDate: null, discharged: false }
      if (messageType === 'ADT^A01' || !visitNumber) return [existingPatient]

      const visitSearch = await FhirServerApi.searchEncounterByIdentifier(visitNumberSystem, visitNumber)
      const visitEncounter = visitSearch?.data?.entry?.[0]?.resource
      if (!visitEncounter) {
        throw new Error(`Le séjour ${visitNumber} du patient ${ipp} n'existe pas sur le serveur FHIR.`)
      }

      const movementSearch = await FhirServerApi.searchLatestMovementEncounter(visitEncounter.id)
      const lastMovement = movementSearch?.data?.entry?.[0]?.resource

      return [{
        ...existingPatient,
        status: visitEncounter.status === 'finished' ? 'discharged' : visitEncounter.status,
        discharged: visitEncounter.status === 'finished',
        admissionDate: visitEncounter.period?.start || null,
        lastEventDate: lastMovement?.period?.start || null
      }]
    },
    async onFileSelected (event) {
      const file = event.target.files && event.target.files[0]
      if (!file) return
      // Permet de re-sélectionner le même fichier ensuite
      event.target.value = ''

      const text = await file.text()
      try {
        const existingPatients = await this.getExistingPatients(parseHl7Message(text))
        const result = transformHl7ToFhir(text, existingPatients)

        this.lastBundle = result.bundle
        this.lastMessageType = result.messageType

        const serverResponse = await FhirServerApi.submitTransactionBundle(result.bundle)

        // Le tableau reflète l'état du serveur FHIR : on le recharge.
        await this.refreshPatients()

        this.lastAlert = {
          type: 'success',
          message: `Le message ${result.messageType} a été envoyé avec succès (${serverResponse?.status || '200'}).`
        }
      } catch (error) {
        this.lastAlert = {
          type: 'error',
          message: error.response?.data?.issue?.[0]?.details?.text || error.message || 'Le fichier HL7 est invalide.'
        }
        this.lastBundle = null
      }
    }
  }
}
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.app-shell {
  width: min(60vw, 1536px);
  max-width: 1536px;
  min-width: 320px;
  margin: 0 auto;
  padding: 24px;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  color: #1f2a37;
}

@media (max-width: 768px) {
  .app-shell {
    width: 92vw;
    min-width: 0;
  }
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 20px;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4d7ef7;
  font-weight: 700;
}

h1, h2 {
  margin: 0;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toggle-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 16px;
  border: 1px solid #c7d6fb;
  border-radius: 12px;
  background: #ffffff;
  color: #2a5ad6;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.toggle-button:hover:not(:disabled) {
  background: #eef3fe;
}

.toggle-button:disabled {
  color: #94a3b8;
  border-color: #e2e8f0;
  cursor: not-allowed;
}

.toggle-switch {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.15s ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
  transition: transform 0.15s ease;
}

.toggle-button[aria-pressed="true"] .toggle-switch {
  background: #2a5ad6;
}

.toggle-button[aria-pressed="true"] .toggle-switch::after {
  transform: translateX(14px);
}

.upload-button {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  height: 44px;
  padding: 0 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #4d7ef7 0%, #2a5ad6 100%);
  color: white;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(77, 126, 247, 0.2);
}

.upload-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.panel {
  background: #ffffff;
  border: 1px solid #e7ecf4;
  border-radius: 14px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.04);
  padding: 18px 20px;
  margin-bottom: 20px;
}

.summary-panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.summary-panel .label {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 8px;
}

.summary-panel strong {
  font-size: 1.8rem;
}

.alert-panel {
  font-weight: 600;
}

.alert-panel.success {
  background: #e9f9ef;
  border-color: #9fe0b7;
  color: #1d6b42;
}

.alert-panel.error {
  background: #ffe8e8;
  border-color: #f5b2b2;
  color: #a12d2d;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}

th,
td {
  padding: 12px 10px;
  border-bottom: 1px solid #edf2f7;
  text-align: left;
}

th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
  background: #f8fafc;
}

tr.insert {
  background: #eefcf3;
}

tr.transfer {
  background: #fff4e5;
}

tr.checkout {
  background: #f1f5f9;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.history-button {
  padding: 6px 12px;
  border: 1px solid #c7d6fb;
  border-radius: 8px;
  background: #ffffff;
  color: #2a5ad6;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.history-button:hover:not(:disabled) {
  background: #eef3fe;
}

.history-button:disabled {
  color: #94a3b8;
  border-color: #e2e8f0;
  cursor: not-allowed;
}

.history-row > td {
  background: #f8fafc;
  padding: 16px 20px;
}

.history-visit + .history-visit {
  margin-top: 18px;
}

.history-visit-title {
  margin: 0 0 6px;
  color: #334155;
}

.history-table {
  margin-top: 0;
  background: #ffffff;
  border: 1px solid #e7ecf4;
}

.history-table th,
.history-table td {
  padding: 8px 10px;
}

.history-empty {
  margin: 0;
  color: #64748b;
}

.sync-info {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
}

.sync-info.error {
  color: #a12d2d;
}

.empty-state {
  padding: 10px 0;
  color: #64748b;
}

.bundle-panel pre {
  margin: 0;
  background: #111827;
  color: #dbeafe;
  padding: 16px;
  border-radius: 12px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 720px) {
  .topbar,
  .summary-panel {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>
