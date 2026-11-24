import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DateTime } from 'luxon'
import { transformHl7ToFhir } from '@/services/hl7Transformer.js'

const sampleA01 = readFileSync(new URL('../fixtures/A01-sample.hl7', import.meta.url), 'utf8')

const hl7DateToIso = (value) => DateTime.fromFormat(value, 'yyyyMMddHHmmss').toISO({ suppressMilliseconds: true })

const sampleFixtures = {
  A01: readFileSync(new URL('../fixtures/A01.hl7', import.meta.url), 'utf8'),
  A02: readFileSync(new URL('../fixtures/A02.hl7', import.meta.url), 'utf8'),
  A03: readFileSync(new URL('../fixtures/A03.hl7', import.meta.url), 'utf8')
}

// EVN-2 = date d'enregistrement, EVN-6 = date de l'évènement (prioritaire).
const buildMessage = (type, { evn2 = '', evn6 = '', zbe2 = '', pv144 = '', pv145 = '' } = {}) => {
  const pv1 = ['PV1', '1', 'O', 'ER^^^ER', ...Array(40).fill(''), pv144, pv145].join('|')
  return `MSH|^~\\&|HOSP|HOSP|EHR|EHR|20240101093000||ADT^${type}|1|P|2.5
EVN||${evn2}||||${evn6}
PID|1||123456789||DOE^JOHN||19800101|M
${pv1}
ZBE|MOV-${type}^HOSP|${zbe2}||INSERT|N`
}

const buildA02Message = (eventDate = '20240102090000') => buildMessage('A02', { evn2: eventDate })
const buildA03Message = (eventDate = '20240102090000') => buildMessage('A03', { evn2: eventDate })

describe('transformHl7ToFhir', () => {
  it('throws when HL7 file is empty', () => {
    expect(() => transformHl7ToFhir('   \n\t  ')).toThrow('Le fichier HL7 est vide.')
  })

  it('throws when message type is missing', () => {
    const invalidMessage = `PID|1||123456789||DOE^JOHN||19800101|M`
    expect(() => transformHl7ToFhir(invalidMessage)).toThrow('Le message HL7 ne contient pas de type MSH-9 valide.')
  })

  it('transforms a valid A01 HL7 message into a FHIR bundle', () => {
    const result = transformHl7ToFhir(sampleA01)

    expect(result.messageType).toBe('ADT^A01')
    expect(result.patient.resourceType).toBe('Patient')
    expect(result.patient.identifier[0].value).toBe('00214754')
    expect(result.patient.identifier[0].system).toBe('HM')
    expect(result.bundle.resourceType).toBe('Bundle')
    expect(result.bundle.type).toBe('transaction')
    expect(result.bundle.entry[0].request.url).toBe('Patient?identifier=HM|00214754')
    expect(result.patientState.type).toBe('admission')
  })

  it('throws when patient already exists for an A01 message', () => {
    const existingPatients = [{ ipp: '00214754' }]
    const message = sampleA01

    expect(() => transformHl7ToFhir(message, existingPatients)).toThrow('Patient already exists!')
  })

  it('throws when A02 patient is not admitted yet', () => {
    const message = buildA02Message()

    expect(() => transformHl7ToFhir(message, [])).toThrow('Patient has not been admitted yet.')
  })

  it('throws when A03 patient is already discharged', () => {
    const message = buildA03Message()
    const existingPatients = [{ ipp: '123456789', status: 'discharged', discharged: true }]

    expect(() => transformHl7ToFhir(message, existingPatients)).toThrow('Patient already discharged!')
  })

  it('throws when A02 event date is before admission date', () => {
    const existingPatients = [{
      ipp: '123456789',
      admissionDate: '2024-01-02',
      status: 'in-progress'
    }]
    const message = buildA02Message('20240101090000')

    expect(() => transformHl7ToFhir(message, existingPatients)).toThrow(
      'Transfert date cannot be before admission/last transfert date'
    )
  })

  it('throws when A03 event date is before previous event', () => {
    const existingPatients = [{
      ipp: '123456789',
      admissionDate: '2024-01-02',
      status: 'in-progress'
    }]
    const message = buildA03Message('20240101090000')

    expect(() => transformHl7ToFhir(message, existingPatients)).toThrow(
      'Discharge date cannot be before admission/transfert date'
    )
  })

  it('accepts a valid A02 transfer and keeps patient in progress', () => {
    const existingPatients = [{
      ipp: '123456789',
      admissionDate: '2024-01-01',
      status: 'in-progress'
    }]
    const message = buildA02Message('20240102090000')

    const result = transformHl7ToFhir(message, existingPatients)

    expect(result.messageType).toBe('ADT^A02')
    expect(result.patientState.type).toBe('transfer')
    expect(result.patientState.status).toBe('in-progress')
  })

  it('accepts a valid A03 discharge and closes the encounter', () => {
    const existingPatients = [{
      ipp: '123456789',
      admissionDate: '2024-01-01',
      status: 'in-progress'
    }]
    const message = buildA03Message('20240102090000')

    const result = transformHl7ToFhir(message, existingPatients)

    expect(result.messageType).toBe('ADT^A03')
    expect(result.patientState.type).toBe('discharge')
    expect(result.patientState.status).toBe('finished')
  })

  it('maps HL7 PID-5 repeated names with D and L types into Patient.name entries', () => {
    const message = `MSH|^~\\&|HOSP|HOSP|EHR|EHR|20240101093000||ADT^A01|1|P|2.5
EVN||20240101093000
PID|1||123456789||DUPONT^JEAN^PAUL^^^^D~MARTIN^JULES^^^^L||19800101|M
PV1|1|O|ER^^^ER||||||||||||||||20240102090000`

    const result = transformHl7ToFhir(message, [])

    expect(result.patient.name).toEqual([
      {
        use: 'usual',
        family: 'DUPONT',
        given: ['JEAN', 'PAUL']
      },
      {
        use: 'official',
        family: 'MARTIN',
        given: ['JULES']
      }
    ])
  })

  it('maps PV1-19 visit number and assigning authority into the Encounter identifier', () => {
    const message = `MSH|^~\\&|HOSP|HOSP|EHR|EHR|20240101093000||ADT^A01|1|P|2.5
EVN||20240101093000
PID|1||123456789||DOE^JOHN||19800101|M
PV1|1|O|ER^^^ER||||||||||||||||VISIT-42^VISIT^1^urn:oid:1.2.3.4`

    const result = transformHl7ToFhir(message, [])

    expect(result.encounter.identifier).toEqual([
      {
        use: 'official',
        type: {
          coding: [
            {
              system: 'https://hl7.fr/ig/fhir/core/CodeSystem/fr-core-cs-identifier-type',
              code: 'VN',
              display: 'Visit Number'
            }
          ]
        },
        system: 'urn:oid:1.2.3.4',
        value: 'VISIT-42'
      }
    ])
  })

  it('adds fullUrl to every bundle entry and keeps internal references coherent', () => {
    const message = `MSH|^~\\&|HOSP|HOSP|EHR|EHR|20240101093000||ADT^A01|1|P|2.5
EVN||20240101093000
PID|1||123456789||DOE^JOHN||19800101|M
PV1|1|O|UNIT^ROOM-12^BED-03||||||||||||||||20240102090000`

    const result = transformHl7ToFhir(message, [])
    const patientEntry = result.bundle.entry.find((entry) => entry.resource.resourceType === 'Patient')
    const encounterEntry = result.bundle.entry.find((entry) => entry.resource === result.encounter)
    const locationEntries = result.bundle.entry.filter((entry) => entry.resource.resourceType === 'Location')

    const uuidUrn = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    const fullUrls = result.bundle.entry.map((entry) => entry.fullUrl)

    expect(fullUrls.every((fullUrl) => uuidUrn.test(fullUrl))).toBe(true)
    expect(new Set(fullUrls).size).toBe(fullUrls.length)
    expect(result.bundle.entry.every((entry) => entry.resource.id === undefined)).toBe(true)
    expect(patientEntry.fullUrl).toBe(result.fullUrls.patient)
    expect(encounterEntry.fullUrl).toBe(result.fullUrls.encounter)
    expect(result.encounter.subject.reference).toBe(patientEntry.fullUrl)
    const locationFullUrls = locationEntries.map((entry) => entry.fullUrl)
    expect(result.movementEncounter.location.map((entry) => entry.location.reference)).toEqual(locationFullUrls)
    expect(result.movementEncounter.partOf.reference).toBe(encounterEntry.fullUrl)
    expect(locationEntries[1].resource.partOf.reference).toBe(locationFullUrls[0])
    expect(locationEntries[2].resource.partOf.reference).toBe(locationFullUrls[1])
  })
  it('builds a visit Encounter (PV1-19) and a movement Encounter (ZBE-1) part of it from the A01 fixture', () => {
    const result = transformHl7ToFhir(sampleFixtures.A01, [])
    const visit = result.encounter
    const movement = result.movementEncounter

    expect(visit.identifier[0]).toMatchObject({
      system: 'urn:oid:2.16.840.1.113883.2.8.3.7',
      value: 'VN3607'
    })
    expect(visit.identifier[0].type.coding[0].code).toBe('VN')
    expect(visit.status).toBe('in-progress')
    expect(visit.class.code).toBe('IMP')
    expect(visit.period).toEqual({ start: hl7DateToIso('20261109215348') })
    expect(visit.partOf).toBeUndefined()
    expect(visit.location).toBeUndefined()

    expect(movement.identifier[0]).toMatchObject({
      system: 'urn:oid:2.16.840.1.113883.2.8.3.7',
      value: 'MOV7090'
    })
    expect(movement.partOf).toEqual({ reference: result.fullUrls.encounter })
    expect(movement.subject).toEqual({ reference: result.fullUrls.patient })
    expect(movement.period).toEqual({ start: hl7DateToIso('20261109215348') })
    expect(movement.location.map((entry) => entry.location.display)).toEqual(['8780', '211', '231-2'])
    expect(movement.location.map((entry) => entry.location.reference)).toEqual(
      result.bundle.entry.filter((entry) => entry.resource.resourceType === 'Location').map((entry) => entry.fullUrl)
    )
    expect(movement.location.every((entry) => entry.status === 'active')).toBe(true)

    const encounterRequests = result.bundle.entry
      .filter((entry) => entry.resource.resourceType === 'Encounter')
      .map((entry) => entry.request)
    expect(encounterRequests).toEqual([
      { method: 'PUT', url: 'Encounter?identifier=urn:oid:2.16.840.1.113883.2.8.3.7|VN3607' },
      { method: 'PUT', url: 'Encounter?identifier=urn:oid:2.16.840.1.113883.2.8.3.7|MOV7090' }
    ])
  })

  it('keeps the same visit Encounter and creates a new movement with the new locations for the A02 fixture', () => {
    const admission = transformHl7ToFhir(sampleFixtures.A01, [])
    const existingPatients = [{ ipp: 'DDS-55441', admissionDate: admission.patientState.admissionDate, status: 'in-progress' }]
    const result = transformHl7ToFhir(sampleFixtures.A02, existingPatients)

    expect(result.encounter.identifier).toEqual(admission.encounter.identifier)
    expect(result.bundle.entry[1].request).toEqual(admission.bundle.entry[1].request)
    expect(result.movementEncounter.identifier[0].value).toBe('MOV7091')
    expect(result.movementEncounter.partOf.reference).toBe(result.fullUrls.encounter)
    expect(result.movementEncounter.location.map((entry) => entry.location.display)).toEqual(['8786', '270', '270-1'])
    // Le séjour garde sa date d'admission, le mouvement prend l'EVN-6 de l'A02.
    expect(result.encounter.period).toEqual({ start: hl7DateToIso('20261109215348') })
    expect(result.movementEncounter.period).toEqual({ start: hl7DateToIso('20261109215552') })
  })

  describe('event date (EVN-6, then EVN-2)', () => {
    const otherDates = { zbe2: '20240301090000', pv144: '20240302090000', pv145: '20240303090000' }

    it('uses EVN-6 over EVN-2, ZBE-2 and PV1-44 for an A01', () => {
      const result = transformHl7ToFhir(buildMessage('A01', { evn2: '20240101080000', evn6: '20240101100000', ...otherDates }))

      expect(result.encounter.period).toEqual({ start: hl7DateToIso('20240101100000') })
      expect(result.movementEncounter.period).toEqual({ start: hl7DateToIso('20240101100000') })
      expect(result.patientState.admissionDate).toBe(hl7DateToIso('20240101100000'))
    })

    it('falls back to EVN-2 when EVN-6 is empty', () => {
      const result = transformHl7ToFhir(buildMessage('A01', { evn2: '20240101080000', ...otherDates }))

      expect(result.encounter.period).toEqual({ start: hl7DateToIso('20240101080000') })
      expect(result.movementEncounter.period).toEqual({ start: hl7DateToIso('20240101080000') })
    })

    it('uses EVN-6 over PV1-45 as discharge date for an A03', () => {
      const existingPatients = [{ ipp: '123456789', admissionDate: hl7DateToIso('20240101080000'), status: 'in-progress' }]
      const result = transformHl7ToFhir(buildMessage('A03', { evn2: '20240105080000', evn6: '20240105100000', ...otherDates }), existingPatients)

      expect(result.encounter.period).toEqual({ start: hl7DateToIso('20240101080000'), end: hl7DateToIso('20240105100000') })
      expect(result.patientState.checkoutDate).toBe(hl7DateToIso('20240105100000'))
    })

    it('throws when neither EVN-6 nor EVN-2 is present', () => {
      expect(() => transformHl7ToFhir(buildMessage('A01', otherDates))).toThrow(
        'Le message HL7 ne contient pas de date d’évènement (EVN-6 ou EVN-2).'
      )
    })
  })

  it('finishes the visit and the movement Encounters for the A03 fixture', () => {
    const existingPatients = [{ ipp: 'DDS-55441', admissionDate: hl7DateToIso('20261109215300'), status: 'in-progress' }]
    const result = transformHl7ToFhir(sampleFixtures.A03, existingPatients)

    expect(result.encounter.status).toBe('finished')
    // Début : admission enregistrée sur le serveur ; fin : EVN-6 de l'A03 (et non PV1-45).
    expect(result.encounter.period).toEqual({
      start: hl7DateToIso('20261109215300'),
      end: hl7DateToIso('20261109215649')
    })
    expect(result.movementEncounter.period).toEqual({
      start: hl7DateToIso('20261109215649'),
      end: hl7DateToIso('20261109215649')
    })
    expect(result.movementEncounter.status).toBe('finished')
    expect(result.movementEncounter.identifier[0].value).toBe('MOV7092')
    expect(result.movementEncounter.location.every((entry) => entry.status === 'completed')).toBe(true)
  })
  it('uses the PI repetition of PID-3 as IPP with an OID-based system', () => {
    const result = transformHl7ToFhir(sampleFixtures.A01, [])

    expect(result.patient.identifier[0]).toMatchObject({
      system: 'urn:oid:1.3.6.1.4.1.12559.11.36.3',
      value: 'DDS-55441'
    })
    expect(result.bundle.entry[0].request).toEqual({
      method: 'PUT',
      url: 'Patient?identifier=urn:oid:1.3.6.1.4.1.12559.11.36.3|DDS-55441'
    })
  })
  it('throws when the visit Encounter fetched from the server is already finished', () => {
    const existingPatients = [{ ipp: 'DDS-55441', status: 'discharged', discharged: true }]

    expect(() => transformHl7ToFhir(sampleFixtures.A02, existingPatients)).toThrow('Patient already discharged!')
    expect(() => transformHl7ToFhir(sampleFixtures.A03, existingPatients)).toThrow('Patient already discharged!')
  })

  it('compares a transfer date with the last movement rather than the admission date', () => {
    const existingPatients = [{
      ipp: '123456789',
      admissionDate: '2024-01-01',
      lastEventDate: '2024-01-05T10:00:00',
      status: 'in-progress'
    }]

    expect(() => transformHl7ToFhir(buildA02Message('20240103090000'), existingPatients)).toThrow(
      'Transfert date cannot be before admission/last transfert date'
    )

    const result = transformHl7ToFhir(buildA02Message('20240106090000'), existingPatients)
    expect(result.patientState.admissionDate).toBe('2024-01-01')
    expect(result.patientState.lastEventDate).toBe(hl7DateToIso('20240106090000'))
  })
})
