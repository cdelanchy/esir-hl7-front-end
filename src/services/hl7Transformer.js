import { DateTime } from 'luxon'

const normalizeText = (value = '') => (value || '').toString().trim()

// UUID v4 pour les fullUrl du Bundle (urn:uuid:<uuid>) : crypto.randomUUID n'est
// disponible qu'en contexte sécurisé (https/localhost), d'où le repli sur getRandomValues.
const generateUuid = () => {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const newFullUrl = () => `urn:uuid:${generateUuid()}`

const getComponent = (field, index) => {
  if (!field) return ''
  const components = field.split('^')
  return normalizeText(components[index] || '')
}

const getDateValue = (field = '') => {
  const value = normalizeText(field)
  if (!value) return ''

  const digitsOnly = value.replace(/[^0-9]/g, '')

  if (/^\d{8}$/.test(digitsOnly)) {
    return DateTime.fromFormat(digitsOnly, 'yyyyMMdd').toISODate()
  }

  if (/^\d{14}$/.test(digitsOnly)) {
    return DateTime.fromFormat(digitsOnly, 'yyyyMMddHHmmss').toISO({ suppressMilliseconds: true })
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

const normalizeMessageType = (value = '') => {
  const normalized = normalizeText(value)
  if (!normalized) return ''

  const parts = normalized.split('^').filter(Boolean)
  if (!parts.length) return normalized

  const eventMatch = parts.find(part => /A0[123]/.test(part))
  if (eventMatch) {
    const eventCode = eventMatch.match(/A0[123]/)?.[0]
    if (eventCode) return `ADT^${eventCode}`
  }

  if (parts.length >= 2) {
    return `${parts[0]}^${parts[1]}`
  }

  return normalized
}

const parsePatientNames = (value = '') => {
  const rawNames = normalizeText(value)
  if (!rawNames) return []

  const parsedNames = rawNames
    .split('~')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const components = entry.split('^')
      const family = normalizeText(components[0] || '')
      const given = normalizeText(components[1] || '')
      const middle = normalizeText(components[2] || '')
      const typeCode = components
        .slice(5)
        .map(part => normalizeText(part).toUpperCase())
        .find(part => part === 'D' || part === 'L') || ''
      const givenValues = [given, middle].filter(Boolean)

      const name = {}
      if (family) name.family = family
      if (givenValues.length) name.given = givenValues

      if (typeCode === 'D') {
        name.use = 'usual'
      } else if (typeCode === 'L') {
        name.use = 'official'
      }

      return name
    })
    .filter((name) => Object.keys(name).length > 0)

  return parsedNames
}

// PID-3 (CX répété) : on retient l'IPP (type PI), à défaut la première répétition.
const parsePatientIdentifier = (value = '') => {
  const repetitions = normalizeText(value).split('~').map((entry) => entry.trim()).filter(Boolean)
  if (!repetitions.length) return { value: '', system: 'urn:esrh' }

  const ippRepetition = repetitions.find((entry) => normalizeText(entry.split('^')[4]).toUpperCase() === 'PI') || repetitions[0]
  const identifier = parseCxIdentifier(ippRepetition)

  return {
    value: identifier.value,
    system: identifier.system || 'urn:esrh'
  }
}

const parseLuxonDate = (value = '') => {
  const normalized = normalizeText(value)
  if (!normalized) return null

  const digitsOnly = normalized.replace(/[^0-9]/g, '')

  if (/^\d{8}$/.test(digitsOnly)) {
    return DateTime.fromFormat(digitsOnly, 'yyyyMMdd')
  }

  if (/^\d{14}$/.test(digitsOnly)) {
    return DateTime.fromFormat(digitsOnly, 'yyyyMMddHHmmss')
  }

  const direct = DateTime.fromISO(normalized)
  if (direct.isValid) return direct

  return null
}

const isDateBefore = (newDate, refDate) => {
  const parsedNew = parseLuxonDate(newDate)
  const parsedRef = parseLuxonDate(refDate)

  if (!parsedNew || !parsedRef) return false
  return parsedNew < parsedRef
}

const getPatientByIpp = (patients = [], ipp = '') => {
  const targetIpp = normalizeText(ipp)
  if (!targetIpp) return null

  return patients.find((patient) => {
    if (!patient) return false

    if (normalizeText(patient.ipp) === targetIpp) return true

    if (Array.isArray(patient.identifier)) {
      return patient.identifier.some((identifier) => normalizeText(identifier && identifier.value) === targetIpp)
    }

    return false
  }) || null
}

const buildFhirPatient = ({ ipp, familyName, givenName, sex, birthDate, patientNames = [], identifierSystem = 'urn:esrh' }) => {
  const resolvedNames = patientNames.length
    ? patientNames.map((name) => ({
      ...(name.use ? { use: name.use } : {}),
      ...(name.family ? { family: name.family } : {}),
      ...(name.given ? { given: name.given } : {}),
      ...(name.suffix ? { suffix: name.suffix } : {})
    })).filter((name) => Object.keys(name).length > 0)
    : [{
      family: familyName || 'Inconnu',
      given: [givenName || 'Patient']
    }]

  return {
    resourceType: 'Patient',
    identifier: [{
      use: 'official',
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'PI',
            display: 'Patient internal identifier'
          }
        ]
      },
      system: identifierSystem,
      value: ipp
    }],
    active: true,
    name: resolvedNames,
    gender: normalizeGender(sex || 'unknown'),
    birthDate: birthDate || undefined
  }
}

const buildFhirLocation = ({ name, physicalTypeCode, physicalTypeDisplay, typeCode, typeDisplay, partOfRef }) => {
  let location = {
    resourceType: 'Location',
    status: 'active',
    name: name || 'Inconnu',
    physicalType: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
        code: physicalTypeCode,
        display: physicalTypeDisplay
      }]
    },
    type: [{
      coding: [{
        system: 'urn:esrh:location-type',
        code: typeCode,
        display: typeDisplay
      }]
    }]
  }

  if (partOfRef) location.partOf = { reference: partOfRef }
  return location
}

// Chaque niveau est un { fullUrl, resource } : le fullUrl (urn:uuid) sert aux
// références internes du Bundle, l'id définitif est attribué par le serveur.
const buildLocationHierarchy = ({ service, room, bed }) => {
  const serviceEntry = service ? {
    fullUrl: newFullUrl(),
    resource: buildFhirLocation({
      name: service,
      physicalTypeCode: 'wa',
      physicalTypeDisplay: 'Ward',
      typeCode: 'AILE',
      typeDisplay: 'Aile'
    })
  } : null

  const roomEntry = room ? {
    fullUrl: newFullUrl(),
    resource: buildFhirLocation({
      name: room,
      physicalTypeCode: 'ro',
      physicalTypeDisplay: 'Room',
      typeCode: 'CHAMB',
      typeDisplay: 'Chambre',
      partOfRef: serviceEntry?.fullUrl
    })
  } : null

  const bedEntry = bed ? {
    fullUrl: newFullUrl(),
    resource: buildFhirLocation({
      name: bed,
      physicalTypeCode: 'bd',
      physicalTypeDisplay: 'Bed',
      typeCode: 'LIT',
      typeDisplay: 'Lit',
      partOfRef: roomEntry?.fullUrl || serviceEntry?.fullUrl
    })
  } : null

  const entries = [serviceEntry, roomEntry, bedEntry].filter(Boolean)

  return {
    service: serviceEntry?.resource || null,
    room: roomEntry?.resource || null,
    bed: bedEntry?.resource || null,
    all: entries.map((entry) => entry.resource),
    entries
  }
}

// HD (Hierarchic Designator) : namespaceId & universalId & universalIdType
// ex. "GZL_INTEROP&2.16.840.1.113883.2.8.3.7&ISO" -> "urn:oid:2.16.840.1.113883.2.8.3.7"
const resolveIdentifierSystem = ({ namespaceId = '', universalId = '', universalIdType = '' }) => {
  const namespace = normalizeText(namespaceId)
  const universal = normalizeText(universalId)
  const universalType = normalizeText(universalIdType).toUpperCase()

  if (universal) {
    if (universalType === 'ISO' && /^[0-2](\.\d+)+$/.test(universal)) return `urn:oid:${universal}`
    return universal
  }

  return namespace
}

// CX (PV1-19 : numéro de séjour) : value ^ ^ ^ assigningAuthority(HD) ^ typeCode
const parseCxIdentifier = (field = '') => {
  const raw = normalizeText(field).split('~')[0] || ''
  if (!raw) return { value: '', system: '' }

  const components = raw.split('^')
  const [namespaceId = '', universalId = '', universalIdType = ''] = (components[3] || '').split('&')

  return {
    value: normalizeText(components[0] || ''),
    system: resolveIdentifierSystem({ namespaceId, universalId, universalIdType })
  }
}

// EI (ZBE-1 : identifiant du mouvement) : entityId ^ namespaceId ^ universalId ^ universalIdType
const parseEiIdentifier = (field = '') => {
  const raw = normalizeText(field).split('~')[0] || ''
  if (!raw) return { value: '', system: '' }

  const components = raw.split('^')

  return {
    value: normalizeText(components[0] || ''),
    system: resolveIdentifierSystem({
      namespaceId: components[1] || '',
      universalId: components[2] || '',
      universalIdType: components[3] || ''
    })
  }
}

const getEncounterStatus = (messageType = '') => (messageType === 'ADT^A03' ? 'finished' : 'in-progress')

// PV1-2 (Patient Class) -> Encounter.class (v3-ActCode)
const getEncounterClass = (patientClass = '') => {
  switch (normalizeText(patientClass).toUpperCase()) {
    case 'O':
      return { code: 'AMB', display: 'ambulatory' }
    case 'E':
      return { code: 'EMER', display: 'emergency' }
    case 'R':
    case 'I':
    default:
      return { code: 'IMP', display: 'inpatient encounter' }
  }
}

const buildEncounterIdentifier = ({ value, system, defaultSystem, type }) => ([{
  use: 'official',
  ...(type ? { type } : {}),
  system: system || defaultSystem,
  value
}])

/**
 * Encounter "séjour" (venue) : identifié par PV1-19 (numéro de venue / VN).
 * C'est l'Encounter parent de tous les mouvements du séjour.
 * start / end : dates d'admission et de sortie, déjà résolues par l'appelant.
 */
const buildFhirVisitEncounter = ({ patientRef, messageType, patientClass, visitNumber = '', visitNumberSystem = '', start = '', end = '' }) => {
  const status = getEncounterStatus(messageType)
  const encounterClass = getEncounterClass(patientClass)

  return {
    resourceType: 'Encounter',
    ...(visitNumber
      ? {
        identifier: buildEncounterIdentifier({
          value: visitNumber,
          system: visitNumberSystem,
          defaultSystem: 'urn:esrh:encounter-visit',
          type: {
            coding: [{
              system: 'https://hl7.fr/ig/fhir/core/CodeSystem/fr-core-cs-identifier-type',
              code: 'VN',
              display: 'Visit Number'
            }]
          }
        })
      }
      : {}),
    status,
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      ...encounterClass
    },
    subject: {
      reference: patientRef
    },
    ...(start || end
      ? {
        period: {
          ...(start ? { start } : {}),
          ...(end ? { end } : {})
        }
      }
      : {})
  }
}

/**
 * Encounter "mouvement" : identifié par ZBE-1, partOf l'Encounter séjour,
 * et portant les Locations (service / chambre / lit) issues de PV1-3.
 */
const buildFhirMovementEncounter = ({ patientRef, visitRef, messageType, patientClass, movementId = '', movementSystem = '', movementDate = '', locationEntries = [] }) => {
  const status = getEncounterStatus(messageType)
  const encounterClass = getEncounterClass(patientClass)

  return {
    resourceType: 'Encounter',
    ...(movementId
      ? {
        identifier: buildEncounterIdentifier({
          value: movementId,
          system: movementSystem,
          defaultSystem: 'urn:esrh:encounter-movement',
          type: { text: 'Identifiant du mouvement (ZBE-1)' }
        })
      }
      : {}),
    status,
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      ...encounterClass
    },
    subject: {
      reference: patientRef
    },
    partOf: {
      reference: visitRef
    },
    ...(movementDate
      ? {
        period: {
          start: movementDate,
          ...(status === 'finished' ? { end: movementDate } : {})
        }
      }
      : {}),
    ...(locationEntries.length
      ? {
        location: locationEntries.map(({ fullUrl, resource }) => ({
          location: {
            reference: fullUrl,
            display: resource.name
          },
          status: status === 'finished' ? 'completed' : 'active',
          ...(resource.physicalType ? { physicalType: resource.physicalType } : {})
        }))
      }
      : {})
  }
}

// Encode les caractères qui casseraient la query string (&, #, +, espace…)
// tout en gardant les « : » des URI lisibles.
const encodeSearchValue = (value = '') => encodeURIComponent(value).replace(/%3A/gi, ':')

const buildIdentifierRequest = (resourceType, resource) => {
  const identifier = resource.identifier?.[0]
  const system = normalizeText(identifier?.system || '')
  const value = normalizeText(identifier?.value || '')

  // Mise à jour conditionnelle sur l'identifiant : un A02/A03 met à jour le
  // même séjour au lieu d'en créer un nouveau.
  return system && value
    ? { method: 'PUT', url: `${resourceType}?identifier=${encodeSearchValue(system)}|${encodeSearchValue(value)}` }
    : { method: 'POST', url: resourceType }
}

const buildBundleRequest = (resource) => {
  // Patient / Encounter : mise à jour conditionnelle sur l'identifiant.
  if (resource.resourceType === 'Patient' || resource.resourceType === 'Encounter') {
    return buildIdentifierRequest(resource.resourceType, resource)
  }
  return { method: 'POST', url: resource.resourceType }
}

// entries : [{ fullUrl, resource }]
const buildBundle = (entries = []) => ({
  resourceType: 'Bundle',
  type: 'transaction',
  entry: entries.map(({ fullUrl, resource }) => ({
    fullUrl,
    resource,
    request: buildBundleRequest(resource)
  }))
})

const buildOperationOutcome = (messageType, text) => ({
  resourceType: 'OperationOutcome',
  issue: [{
    severity: 'information',
    code: 'informational',
    details: {
      text: text || `Message ${messageType} transformé en bundle FHIR.`
    }
  }]
})

export const parseHl7Message = (hl7Text) => {
  const lines = normalizeText(hl7Text)
    .split(/\r?\n|\r/)
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    throw new Error('Le fichier HL7 est vide.')
  }

  let messageType = ''
  let ipp = ''
  let patientIdentifierSystem = 'urn:esrh'
  let familyName = ''
  let givenName = ''
  let sex = ''
  let birthDate = ''
  let patientClass = ''
  let service = ''
  let room = ''
  let bed = ''
  let evnRecordedDate = ''
  let evnOccurredDate = ''
  let visitNumber = ''
  let visitNumberSystem = ''
  let movementId = ''
  let movementSystem = ''
  let patientNames = []

  for (const line of lines) {
    const segments = line.split('|')
    const segmentType = normalizeText(segments[0])

    if (segmentType === 'MSH') {
      messageType = normalizeMessageType(segments[8] || '')
      continue
    }

    if (segmentType === 'EVN') {
      // EVN-2 : date/heure d'enregistrement, EVN-6 : date/heure de l'évènement
      evnRecordedDate = getDateValue(segments[2] || '')
      evnOccurredDate = getDateValue(segments[6] || '')
      continue
    }

    if (segmentType === 'PID') {
      const pid3 = parsePatientIdentifier(segments[3] || '')
      ipp = pid3.value
      patientIdentifierSystem = pid3.system
      patientNames = parsePatientNames(segments[5] || '')

      const primaryPatientName = patientNames.find((name) => name.use === 'usual')
        || patientNames.find((name) => name.use === 'official')
        || patientNames[0]

      if (primaryPatientName) {
        familyName = normalizeText(primaryPatientName.family || '')
        givenName = normalizeText(primaryPatientName.given?.[0] || '')
      } else {
        const patientName = normalizeText(segments[5] || '')
        const nameParts = patientName.split('^')
        familyName = normalizeText(nameParts[0] || '')
        givenName = normalizeText(nameParts[1] || '')
      }

      sex = normalizeText(segments[8] || '')
      birthDate = getDateValue(segments[7] || '')
      continue
    }

    if (segmentType === 'PV1') {
      patientClass = normalizeText(segments[2] || '')

      // PV1-3 (PL) : pointOfCare(service) ^ room ^ bed ^ facility
      const assignedLocation = segments[3] || ''
      const serviceFromLocation = normalizeText(getComponent(assignedLocation, 0) || '')
      const serviceFromField = normalizeText(getComponent(segments[10], 0) || segments[10] || '')
      service = serviceFromLocation || serviceFromField
      room = normalizeText(getComponent(assignedLocation, 1) || '')
      bed = normalizeText(getComponent(assignedLocation, 2) || '')

      // PV1-19 : numéro de séjour / venue
      const visit = parseCxIdentifier(segments[19] || '')
      visitNumber = visit.value
      visitNumberSystem = visit.system
      continue
    }

    if (segmentType === 'ZBE') {
      // ZBE-1 : identifiant du mouvement
      const movement = parseEiIdentifier(segments[1] || '')
      movementId = movement.value
      movementSystem = movement.system
    }
  }

  if (!messageType) {
    throw new Error('Le message HL7 ne contient pas de type MSH-9 valide.')
  }

  if (!ipp) {
    throw new Error('Le message HL7 ne contient pas d’identifiant patient (PID-3).')
  }

  // Date/heure de l'évènement : EVN-6, à défaut EVN-2. C'est la seule date
  // utilisée pour l'admission (A01), le mouvement et la sortie (A03).
  const eventDate = evnOccurredDate || evnRecordedDate

  if (!eventDate) {
    throw new Error('Le message HL7 ne contient pas de date d’évènement (EVN-6 ou EVN-2).')
  }

  return {
    messageType,
    ipp,
    patientIdentifierSystem,
    familyName,
    givenName,
    patientNames,
    sex,
    birthDate,
    patientClass,
    service,
    room,
    bed,
    eventDate,
    visitNumber,
    visitNumberSystem,
    movementId,
    movementSystem
  }
}

const ensurePatientExists = (existingPatients = [], ipp = '', context = 'Patient') => {
  const patient = getPatientByIpp(existingPatients, ipp)
  if (!patient) {
    throw new Error(`${context} has not been admitted yet.`)
  }
  return patient
}

// visitStart / visitEnd : dates d'admission et de sortie du séjour. Le séjour
// étant remplacé (PUT conditionnel) à chaque message, A02/A03 doivent reprendre
// la date d'admission enregistrée sur le serveur.
const buildFhirResources = (message, { visitStart = '', visitEnd = '' } = {}) => {
  const { messageType, ipp, patientIdentifierSystem, familyName, givenName, patientNames, sex, birthDate, patientClass, service, room, bed, eventDate, visitNumber, visitNumberSystem, movementId, movementSystem } = message

  const patient = buildFhirPatient({ ipp, familyName, givenName, sex, birthDate, patientNames, identifierSystem: patientIdentifierSystem })
  const locationHierarchy = buildLocationHierarchy({ service, room, bed })
  const fullUrls = {
    patient: newFullUrl(),
    encounter: newFullUrl(),
    movementEncounter: newFullUrl()
  }

  const visitEncounter = buildFhirVisitEncounter({
    patientRef: fullUrls.patient,
    messageType,
    patientClass,
    visitNumber,
    visitNumberSystem,
    start: visitStart,
    end: visitEnd
  })

  const movementEncounter = buildFhirMovementEncounter({
    patientRef: fullUrls.patient,
    visitRef: fullUrls.encounter,
    messageType,
    patientClass,
    movementId,
    movementSystem,
    movementDate: eventDate,
    locationEntries: locationHierarchy.entries
  })

  const bundle = buildBundle([
    { fullUrl: fullUrls.patient, resource: patient },
    { fullUrl: fullUrls.encounter, resource: visitEncounter },
    { fullUrl: fullUrls.movementEncounter, resource: movementEncounter },
    ...locationHierarchy.entries
  ])

  return {
    messageType,
    patient,
    encounter: visitEncounter,
    movementEncounter,
    encounters: [visitEncounter, movementEncounter],
    locations: locationHierarchy.all,
    locationHierarchy,
    fullUrls,
    bundle,
    operationOutcome: buildOperationOutcome(messageType, `Message ${messageType} transformé en bundle FHIR.`)
  }
}

const buildLocationState = ({ service, room, bed }) => ({
  service: service || null,
  room: room || null,
  bed: bed || null
})

const transformA01 = (message, existingPatients = []) => {
  const { ipp, eventDate } = message

  const patientAlreadyExists = getPatientByIpp(existingPatients, ipp)
  if (patientAlreadyExists) {
    throw new Error('Patient already exists!')
  }

  return {
    ...buildFhirResources(message, { visitStart: eventDate }),
    patientState: {
      ipp,
      type: 'admission',
      status: 'in-progress',
      admissionDate: eventDate,
      location: buildLocationState(message)
    }
  }
}

const transformA02 = (message, existingPatients = []) => {
  const { ipp, eventDate } = message
  const patient = ensurePatientExists(existingPatients, ipp, 'Patient')

  if (patient.checkoutDate || patient.discharged || patient.status === 'discharged') {
    throw new Error('Patient already discharged!')
  }

  const referenceDate = patient.lastEventDate || patient.admissionDate || patient.eventDate
  if (referenceDate && isDateBefore(eventDate, referenceDate)) {
    throw new Error('Transfert date cannot be before admission/last transfert date')
  }

  return {
    ...buildFhirResources(message, { visitStart: patient.admissionDate || '' }),
    patientState: {
      ipp,
      type: 'transfer',
      status: 'in-progress',
      admissionDate: patient.admissionDate || referenceDate || null,
      lastEventDate: eventDate || null,
      location: buildLocationState(message)
    }
  }
}

const transformA03 = (message, existingPatients = []) => {
  const { ipp, eventDate } = message
  const patient = ensurePatientExists(existingPatients, ipp, 'Patient')

  if (patient.checkoutDate || patient.discharged || patient.status === 'discharged') {
    throw new Error('Patient already discharged!')
  }

  const referenceDate = patient.lastEventDate || patient.admissionDate || patient.eventDate
  if (referenceDate && isDateBefore(eventDate, referenceDate)) {
    throw new Error('Discharge date cannot be before admission/transfert date')
  }

  return {
    ...buildFhirResources(message, { visitStart: patient.admissionDate || '', visitEnd: eventDate }),
    patientState: {
      ipp,
      type: 'discharge',
      status: 'finished',
      admissionDate: patient.admissionDate || referenceDate || null,
      lastEventDate: eventDate || null,
      checkoutDate: eventDate || null,
      location: buildLocationState(message)
    }
  }
}

const transformByMessageType = (message, existingPatients = []) => {
  switch (message.messageType) {
    case 'ADT^A01':
      return transformA01(message, existingPatients)
    case 'ADT^A02':
      return transformA02(message, existingPatients)
    case 'ADT^A03':
      return transformA03(message, existingPatients)
    default:
      throw new Error(`Message type is unknown or undefined: ${message.messageType}`)
  }
}

export function transformHl7ToFhir(hl7Text, existingPatients = []) {
  const parsedMessage = parseHl7Message(hl7Text)
  return transformByMessageType(parsedMessage, existingPatients)
}
