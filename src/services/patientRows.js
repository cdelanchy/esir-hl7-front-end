// Construit les lignes du tableau des patients à partir des ressources du
// serveur FHIR : pour chaque Patient, sa dernière venue (Encounter « séjour »,
// sans partOf) et le dernier mouvement de cette venue (Encounter partOf séjour).

const PHYSICAL_TYPE_FIELDS = { wa: 'service', ro: 'room', bd: 'bed' }

const toTime = (value) => {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isNaN(time) ? -Infinity : time
}

const encounterStart = (encounter) => encounter?.period?.start || null

// Plus récent d'abord : date de début, puis date de dernière mise à jour.
const byMostRecent = (a, b) => (
  toTime(encounterStart(b)) - toTime(encounterStart(a))
  || toTime(b.meta?.lastUpdated) - toTime(a.meta?.lastUpdated)
)

const referenceId = (reference = '') => reference.split('/').pop()

// Un Encounter dont partOf pointe sur lui-même (même identifiant PV1-19 et
// ZBE-1) est à la fois le séjour et son unique mouvement.
const isVisit = (encounter) => !encounter.partOf || referenceId(encounter.partOf.reference) === encounter.id

const getMovementLocations = (movement) => (movement?.location || []).reduce((acc, entry) => {
  const code = entry.physicalType?.coding?.[0]?.code
  const field = PHYSICAL_TYPE_FIELDS[code]
  if (field && !acc[field]) acc[field] = entry.location?.display || null
  return acc
}, { service: null, room: null, bed: null })

const getPatientIdentifier = (patient) => {
  const identifiers = patient.identifier || []
  return identifiers.find(id => id.type?.coding?.some(coding => coding.code === 'PI')) || identifiers[0] || {}
}

// PID-5 type L -> use « official » (nom de naissance), type D -> use « usual » (nom d'usage).
const getPatientNames = (patient) => {
  const names = patient.name || []
  const official = names.find(name => name.use === 'official') || names.find(name => !name.use) || names[0] || {}
  const usual = names.find(name => name.use === 'usual') || {}
  return { official, usual }
}

const getStatus =(visit, movementCount) => {
  if (!visit) return { status: '', statusLabel: '—' }
  if (visit.status === 'finished') return { status: 'checkout', statusLabel: 'Sortie' }
  if (movementCount > 1) return { status: 'transfer', statusLabel: 'Transfert' }
  return { status: 'insert', statusLabel: 'Admission' }
}

// Type d'un mouvement dans son séjour : le premier est l'admission, un
// mouvement terminé est la sortie, les autres sont des transferts/mutations.
const MOVEMENT_TYPES = {
  admission: { status: 'insert', label: 'Admission' },
  transfer: { status: 'transfer', label: 'Transfert / mutation' },
  discharge: { status: 'checkout', label: 'Sortie' }
}

const getMovementType = (movement, index) => {
  if (movement.status === 'finished') return MOVEMENT_TYPES.discharge
  return index === 0 ? MOVEMENT_TYPES.admission : MOVEMENT_TYPES.transfer
}

// Historique de toutes les venues du patient (la plus récente d'abord), chacune
// avec ses mouvements dans l'ordre chronologique.
const buildHistory = (visits, movementsByVisit) => visits.map((visit) => {
  const movements = [...(movementsByVisit.get(visit.id) || [])].sort(byMostRecent).reverse()

  return {
    id: visit.id,
    visitNumber: visit.identifier?.[0]?.value || '—',
    start: visit.period?.start || null,
    end: visit.period?.end || null,
    finished: visit.status === 'finished',
    movements: movements.map((movement, index) => {
      const { status, label } = getMovementType(movement, index)
      return {
        id: movement.id,
        status,
        typeLabel: label,
        date: encounterStart(movement),
        ...getMovementLocations(movement)
      }
    })
  }
})

export const buildPatientRows = (patients = [], encounters = []) => {
  const visitsByPatient = new Map()
  const movementsByVisit = new Map()

  encounters.forEach((encounter) => {
    const patientId = referenceId(encounter.subject?.reference)
    if (isVisit(encounter) && patientId) {
      if (!visitsByPatient.has(patientId)) visitsByPatient.set(patientId, [])
      visitsByPatient.get(patientId).push(encounter)
    }
    if (encounter.partOf) {
      const visitId = referenceId(encounter.partOf.reference)
      if (!movementsByVisit.has(visitId)) movementsByVisit.set(visitId, [])
      movementsByVisit.get(visitId).push(encounter)
    }
  })

  return patients
    .map((patient) => {
      const visits = (visitsByPatient.get(patient.id) || []).sort(byMostRecent)
      const visit = visits[0] || null
      const movements = visit ? (movementsByVisit.get(visit.id) || []).sort(byMostRecent) : []
      const lastMovement = movements[0] || null
      const { service, room, bed } = getMovementLocations(lastMovement)
      const identifier = getPatientIdentifier(patient)
      const ipp = identifier.value || patient.id
      const { official, usual } = getPatientNames(patient)

      return {
        id: patient.id,
        name: official.family || '—',
        usualName: usual.family || '—',
        firstname: official.given?.[0] || usual.given?.[0] || '—',
        sex: patient.gender || '—',
        birthDate: patient.birthDate || '—',
        ipp,
        ippDisplay: identifier.system ? `${ipp} (${identifier.system})` : ipp,
        admissionDate: visit?.period?.start || '—',
        dischargeDate: visit?.period?.end || '—',
        lastEventDate: encounterStart(lastMovement) || visit?.period?.start || null,
        service: service || '—',
        room: room || '—',
        bed: bed || '—',
        ...getStatus(visit, movements.length),
        history: buildHistory(visits, movementsByVisit)
      }
    })
    // Activité la plus récente en premier ; les patients sans venue à la fin.
    .sort((a, b) => toTime(b.lastEventDate) - toTime(a.lastEventDate) || a.name.localeCompare(b.name))
}
