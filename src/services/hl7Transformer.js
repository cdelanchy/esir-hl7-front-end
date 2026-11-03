const normalizeText = (value = '') => (value || '').toString().trim()

const getComponent = (field, index) => {
  if (!field) return ''
  const components = field.split('^')
  return normalizeText(components[index] || '')
}

const getDateValue = (field = '') => {
  const value = normalizeText(field)
  if (!value) return ''
  if (/^\d{4}\d{2}\d{2}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }
  return value
}

const normalizeGender = (code = '') => {
  const value = normalizeText(code).toUpperCase()
  if (value === 'F') return 'female'
  if (value === 'M') return 'male'
  if (value === 'O') return 'other'
  return 'unknown'
}

export function transformHl7ToFhir (hl7Text) {
  const lines = normalizeText(hl7Text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    throw new Error('Le fichier HL7 est vide.')
  }

  let messageType = ''
  let ipp = ''
  let familyName = ''
  let givenName = ''
  let sex = ''
  let birthDate = ''
  let service = ''
  let room = ''
  let bed = ''
  let eventDate = ''

  for (const line of lines) {
    const segments = line.split('|')
    const segmentType = normalizeText(segments[0])

    if (segmentType === 'MSH') {
      messageType = normalizeText(segments[8] || '').replace('^', '/')
      continue
    }

    if (segmentType === 'PID') {
      ipp = normalizeText(segments[3] || '')
      const patientName = normalizeText(segments[5] || '')
      const nameParts = patientName.split('^')
      familyName = normalizeText(nameParts[0] || '')
      givenName = normalizeText(nameParts[1] || '')
      sex = normalizeGender(segments[8] || '')
      birthDate = getDateValue(segments[7] || '')
      continue
    }

    if (segmentType === 'PV1') {
      service = normalizeText(getComponent(segments[10], 0) || segments[10] || '')
      room = normalizeText(segments[3] || '')
      bed = normalizeText(segments[4] || '')
      if (!eventDate) {
        eventDate = getDateValue(segments[44] || segments[45] || '')
      }
    }
  }

  if (!messageType) {
    throw new Error('Le message HL7 ne contient pas de type MSH-9 valide.')
  }

  if (!ipp) {
    throw new Error('Le message HL7 ne contient pas d’identifiant patient (PID-3).')
  }

  const patientId = `patient-${ipp.replace(/[^a-zA-Z0-9]/g, '-')}`
  const patient = {
    resourceType: 'Patient',
    id: patientId,
    identifier: [{
      system: 'urn:ipp',
      value: ipp
    }],
    active: true,
    name: [{
      family: familyName || 'Inconnu',
      given: [givenName || 'Patient']
    }],
    gender: sex || 'unknown',
    birthDate: birthDate || undefined
  }

  const encounterStatus = messageType.endsWith('A03') ? 'finished' : 'in-progress'
  const encounter = {
    resourceType: 'Encounter',
    status: encounterStatus,
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'IMP',
      display: 'inpatient'
    },
    subject: {
      reference: `Patient/${patientId}`
    },
    serviceType: {
      text: service || 'Service non renseigné'
    },
    period: {
      start: eventDate || new Date().toISOString(),
      ...(messageType.endsWith('A03') ? { end: eventDate || new Date().toISOString() } : {})
    },
    location: [{
      location: {
        reference: `Location/${room || 'unknown-room'}`,
        display: room || 'Chambre inconnue'
      },
      status: 'active'
    }]
  }

  const bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: patient,
        request: {
          method: 'PUT',
          url: `Patient?identifier=urn:ipp|${ipp}`
        }
      },
      {
        resource: encounter,
        request: {
          method: 'POST',
          url: 'Encounter'
        }
      }
    ]
  }

  return {
    messageType,
    patient,
    encounter,
    bundle,
    operationOutcome: {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'information',
        code: 'informational',
        details: {
          text: `Message ${messageType} transformé en bundle FHIR.`
        }
      }]
    }
  }
}
