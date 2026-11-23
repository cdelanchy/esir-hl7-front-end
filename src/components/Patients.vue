<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">FHIR MVP</p>
        <h1>HL7 → FHIR patient dashboard</h1>
      </div>
      <label class="upload-button">
        <input type="file" accept=".hl7,.txt" @change="onFileSelected" />
        <span>Upload HL7</span>
      </label>
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
        <span class="label">Statut</span>
        <strong>{{ lastStatus }}</strong>
      </div>
    </section>

    <section v-if="lastAlert" class="panel alert-panel" :class="lastAlert.type">
      {{ lastAlert.message }}
    </section>

    <section class="panel">
      <h2>Liste des patients</h2>
      <div v-if="patients.length" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom de naissance</th>
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
            </tr>
          </thead>
          <tbody>
            <tr v-for="patient in patients" :key="patient.ipp" :class="patient.status">
              <td>{{ patient.name }}</td>
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
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">
        Aucun patient en mémoire. Chargez un fichier HL7 pour commencer.
      </div>
    </section>

    <section v-if="lastBundle" class="panel bundle-panel">
      <h2>Bundle FHIR généré</h2>
      <pre>{{ prettyBundle }}</pre>
    </section>
  </div>
</template>

<script>
import { parseHl7Message, transformHl7ToFhir } from '@/services/hl7Transformer'
import FhirServerApi from '@/services/FhirServerApi'

export default {
  name: 'Patients',
  data () {
    return {
      patients: [],
      lastBundle: null,
      lastMessageType: '',
      lastAlert: null,
      lastStatus: 'idle'
    }
  },
  computed: {
    prettyBundle () {
      return this.lastBundle ? JSON.stringify(this.lastBundle, null, 2) : ''
    }
  },
  methods: {
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
        this.lastStatus = 'checking-fhir'
        const existingPatients = await this.getExistingPatients(parseHl7Message(text))
        const result = transformHl7ToFhir(text, existingPatients)

        this.lastBundle = result.bundle
        this.lastMessageType = result.messageType

        const serverResponse = await FhirServerApi.submitTransactionBundle(result.bundle)
        this.lastStatus = 'ready'

        const patient = result.patient
        const { patientState } = result
        const serviceLocation = result.locationHierarchy && result.locationHierarchy.service
        const roomLocation = result.locationHierarchy && result.locationHierarchy.room
        const bedLocation = result.locationHierarchy && result.locationHierarchy.bed
        const existingPatient = this.patients.find(item => item.ipp === patient.identifier[0].value)
        const isDischarged = result.encounter.status === 'finished'

        const admissionDate = result.encounter.period?.start
          || patientState.admissionDate
          || (existingPatient && existingPatient.admissionDate)
          || '—'

        const dischargeDate = isDischarged
          ? (result.encounter.period?.end || patientState.checkoutDate || '—')
          : (existingPatient && existingPatient.dischargeDate) || '—'

        const identifierValueDisplay = patient.identifier?.[0]?.value || '—'
        const identifierSystemDisplay = patient.identifier?.[0]?.system || '—'
        const statusLabels = { admission: 'Admission', transfer: 'Transfert', discharge: 'Sortie' }

        const record = {
          name: patient.name[0].family,
          firstname: patient.name[0].given[0],
          sex: patient.gender,
          birthDate: patient.birthDate || '—',
          ipp: identifierValueDisplay,
          ippDisplay: identifierSystemDisplay === '—' ? identifierValueDisplay : `${identifierValueDisplay} (${identifierSystemDisplay})`,
          admissionDate,
          dischargeDate,
          lastEventDate: patientState.lastEventDate || admissionDate,
          status: isDischarged ? 'checkout' : 'insert',
          statusLabel: statusLabels[patientState.type] || 'Admission',
          service: serviceLocation ? serviceLocation.name : '—',
          room: roomLocation ? roomLocation.name : '—',
          bed: bedLocation ? bedLocation.name : '—',
          eventDate: result.movementEncounter.period?.start || admissionDate
        }

        const existingIndex = this.patients.findIndex(item => item.ipp === record.ipp)
        if (existingIndex >= 0) {
          this.patients.splice(existingIndex, 1, record)
        } else {
          this.patients.push(record)
        }

        this.lastAlert = {
          type: 'success',
          message: `Le message ${result.messageType} a été transformé, vérifié sur Aidbox, puis envoyé avec succès (${serverResponse?.status || '200'}).`
        }
      } catch (error) {
        this.lastStatus = 'error'
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

tr.checkout {
  background: #f1f5f9;
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
