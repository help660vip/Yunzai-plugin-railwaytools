import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractCommandArgument,
  looksLikeTrainCode,
  normalizeIdentifier,
  normalizeUserText,
  parseRealtimeInput
} from '../model/utils.js'

test('normalizes common pasted whitespace and full-width input', () => {
  assert.equal(normalizeUserText('  ＃车次\u00a0\u200Bg１２３  '), '#车次 g123')
  assert.equal(normalizeIdentifier(' crh2a - 2001 '), 'CRH2A-2001')
})

test('extracts train arguments without case or spacing sensitivity', () => {
  const aliases = ['车次', 'cc', '查车次']
  const cases = [
    ['#车次 G123', 'G123'],
    ['#车次 g123', 'g123'],
    ['#车次    G123 ', 'G123'],
    ['#车次\tG123', 'G123'],
    ['#车次　Ｇ１２３', 'G123'],
    ['＃车次\u00a0g123', 'g123'],
    ['#ＣＣ crh2a-2001', 'crh2a-2001']
  ]

  for (const [message, expected] of cases) {
    assert.equal(extractCommandArgument(message, aliases), expected)
  }
  assert.equal(extractCommandArgument('/' + '车次 G123', aliases), null)
})

test('recognizes train codes and realtime suffixes', () => {
  assert.equal(looksLikeTrainCode('g123'), true)
  assert.equal(looksLikeTrainCode('G123 - 实时'), true)
  assert.equal(looksLikeTrainCode('CRH2A-2001'), false)
  assert.deepEqual(parseRealtimeInput(' z225 － 实时 '), {
    identifier: 'Z225',
    realtime: true
  })
})
