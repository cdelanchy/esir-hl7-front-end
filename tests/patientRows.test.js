import { describe, expect, it } from 'vitest'
import { buildPatientRows } from '@/services/patientRows'

const patient = (id, family) => ({
  resourceType: 'Patient',
  id,
  identifier: [{ system: 'urn:test', value: `IPP-${id}` }],
  name: [{ family, given: ['Jean'] }],
  gender: 'male'
})

const visit = (id, patientId, period, status = 'in-progress') => ({
  resourceType: 'Encounter', id, status, period, subject: { reference: `Patient/${patientId}` }
})

const location = (display, code) => ({ location: { display }, physicalType: { coding: [{ code }] } })

const movement = (id, patientId, visitId, start, locations = [], status = 'in-progress') => ({
  resourceType: 'Encounter',
  id,
  status,
  period: { start },
  subject: { reference: `Patient/${patientId}` },
  partOf: { reference: `Encounter/${visitId}` },
  location: locations
})

describe('buildPatientRows', () => {
  it('marks an in-progress visit with a single movement as an admission', () => {
    const [row] = buildPatientRows([patient('p1', 'A')], [
      visit('v1', 'p1', { start: '2024-01-01T10:00:00Z' }),
      movement('m1', 'p1', 'v1', '2024-01-01T10:00:00Z', [location('CARDIO', 'wa'), location('12', 'ro'), location('12-1', 'bd')])
    ])

    expect(row).toMatchObject({ status: 'insert', statusLabel: 'Admission', service: 'CARDIO', room: '12', bed: '12-1', ipp: 'IPP-p1' })
  })

  it('marks an in-progress visit with several movements as a transfer and uses the latest location', () => {
    const [row] = buildPatientRows([patient('p1', 'A')], [
      visit('v1', 'p1', { start: '2024-01-01T10:00:00Z' }),
      movement('m1', 'p1', 'v1', '2024-01-01T10:00:00Z', [location('CARDIO', 'wa')]),
      movement('m2', 'p1', 'v1', '2024-01-02T10:00:00Z', [location('NEURO', 'wa')])
    ])

    expect(row).toMatchObject({ status: 'transfer', statusLabel: 'Transfert', service: 'NEURO', lastEventDate: '2024-01-02T10:00:00Z' })
  })

  it('marks a finished visit as a discharge with its end date', () => {
    const [row] = buildPatientRows([patient('p1', 'A')], [
      visit('v1', 'p1', { start: '2024-01-01T10:00:00Z', end: '2024-01-03T10:00:00Z' }, 'finished'),
      movement('m1', 'p1', 'v1', '2024-01-03T10:00:00Z', [], 'finished')
    ])

    expect(row).toMatchObject({ status: 'checkout', statusLabel: 'Sortie', dischargeDate: '2024-01-03T10:00:00Z' })
  })

  it('keeps only the most recent visit of a patient', () => {
    const [row] = buildPatientRows([patient('p1', 'A')], [
      visit('old', 'p1', { start: '2023-01-01T10:00:00Z', end: '2023-01-05T10:00:00Z' }, 'finished'),
      visit('new', 'p1', { start: '2024-06-01T10:00:00Z' }),
      movement('m1', 'p1', 'new', '2024-06-01T10:00:00Z', [location('URG', 'wa')])
    ])

    expect(row).toMatchObject({ status: 'insert', admissionDate: '2024-06-01T10:00:00Z', dischargeDate: '—', service: 'URG' })
  })

  it('handles an encounter that is both the visit and its movement (partOf itself)', () => {
    const [row] = buildPatientRows([patient('p1', 'A')], [
      movement('e1', 'p1', 'e1', '2024-01-01T10:00:00Z', [location('CH01', 'wa')])
    ])

    expect(row).toMatchObject({ status: 'insert', service: 'CH01', admissionDate: '2024-01-01T10:00:00Z' })
  })

  it('separates the birth name (official) from the usual name', () => {
    const married = {
      ...patient('p1', 'X'),
      name: [
        { use: 'usual', family: 'CURIE', given: ['MARIE'] },
        { use: 'official', family: 'SLADOWSKA', given: ['MARIA'] }
      ]
    }
    const [row] = buildPatientRows([married])
    const [other] = buildPatientRows([patient('p2', 'DUPONT')])

    expect(row).toMatchObject({ name: 'SLADOWSKA', usualName: 'CURIE', firstname: 'MARIA' })
    expect(other).toMatchObject({ name: 'DUPONT', usualName: '—' })
  })

  it('builds the movement history of every visit, most recent visit first', () => {
    const [row] = buildPatientRows([patient('p1', 'A')], [
      visit('old', 'p1', { start: '2023-01-01T10:00:00Z', end: '2023-01-05T10:00:00Z' }, 'finished'),
      movement('o1', 'p1', 'old', '2023-01-01T10:00:00Z', [location('URG', 'wa')]),
      movement('o2', 'p1', 'old', '2023-01-05T10:00:00Z', [location('URG', 'wa')], 'finished'),
      visit('new', 'p1', { start: '2024-06-01T10:00:00Z' }),
      movement('n2', 'p1', 'new', '2024-06-02T10:00:00Z', [location('NEURO', 'wa'), location('5', 'ro'), location('5-2', 'bd')]),
      movement('n1', 'p1', 'new', '2024-06-01T10:00:00Z', [location('CARDIO', 'wa')])
    ])

    expect(row.history.map(v => v.id)).toEqual(['new', 'old'])
    expect(row.history[0].movements).toEqual([
      { id: 'n1', status: 'insert', typeLabel: 'Admission', date: '2024-06-01T10:00:00Z', service: 'CARDIO', room: null, bed: null },
      { id: 'n2', status: 'transfer', typeLabel: 'Transfert / mutation', date: '2024-06-02T10:00:00Z', service: 'NEURO', room: '5', bed: '5-2' }
    ])
    expect(row.history[1]).toMatchObject({ finished: true, end: '2023-01-05T10:00:00Z' })
    expect(row.history[1].movements.map(m => m.typeLabel)).toEqual(['Admission', 'Sortie'])
  })

  it('lists patients without any visit last', () => {
    const rows = buildPatientRows([patient('p1', 'Sans venue'), patient('p2', 'B')], [
      visit('v2', 'p2', { start: '2024-01-01T10:00:00Z' })
    ])

    expect(rows.map(row => row.id)).toEqual(['p2', 'p1'])
    expect(rows[1]).toMatchObject({ status: '', statusLabel: '—', admissionDate: '—' })
  })
})
