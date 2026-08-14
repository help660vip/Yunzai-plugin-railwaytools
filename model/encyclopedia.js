import { readFile } from 'node:fs/promises'

import { normalizeUserText } from './utils.js'

const DATA_FILES = Object.freeze([
  ['train', new URL('../data/encyclopedia/train.json', import.meta.url)],
  ['locomotive', new URL('../data/encyclopedia/locomotive.json', import.meta.url)],
  ['line', new URL('../data/encyclopedia/line.json', import.meta.url)],
  ['station', new URL('../data/encyclopedia/station.json', import.meta.url)]
])

const CATEGORY_ALIASES = Object.freeze({
  train: ['动车组', '高铁车型', '车型'],
  locomotive: ['机车', '机车型号'],
  line: ['线路', '铁路线路'],
  station: ['车站', '站点']
})

let entriesPromise = null

function normalizeSearchText(value) {
  return normalizeUserText(value).toLocaleLowerCase('zh-CN')
}

function validateEntry(entry, type, fileName) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError(`${fileName} contains a non-object encyclopedia entry`)
  }
  if (!entry.id || !entry.name || !entry.summary) {
    throw new TypeError(`${fileName} contains an incomplete encyclopedia entry`)
  }
  return Object.freeze({
    ...entry,
    type,
    aliases: Array.isArray(entry.aliases) ? entry.aliases.map(String) : [],
    details: Array.isArray(entry.details) ? entry.details.map(String) : []
  })
}

async function loadDataFile(type, url) {
  const raw = await readFile(url, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new TypeError(`${url.pathname} must contain a JSON array`)
  return parsed.map((entry) => validateEntry(entry, type, url.pathname))
}

export async function loadEncyclopediaEntries() {
  if (!entriesPromise) {
    entriesPromise = Promise.all(DATA_FILES.map(([type, url]) => loadDataFile(type, url)))
      .then((groups) => Object.freeze(groups.flat()))
      .catch((error) => {
        entriesPromise = null
        throw error
      })
  }
  return entriesPromise
}

function parseCategoryKeyword(input) {
  const normalized = normalizeUserText(input)
  for (const [type, aliases] of Object.entries(CATEGORY_ALIASES)) {
    const alias = aliases.find((candidate) => normalized.startsWith(`${candidate} `))
    if (alias) return { type, keyword: normalized.slice(alias.length).trim() }
  }
  return { type: null, keyword: normalized }
}

function scoreEntry(entry, keyword) {
  const id = normalizeSearchText(entry.id)
  const name = normalizeSearchText(entry.name)
  const aliases = entry.aliases.map(normalizeSearchText)
  if (id === keyword || name === keyword || aliases.includes(keyword)) return 100
  if (id.startsWith(keyword) || name.startsWith(keyword) || aliases.some((alias) => alias.startsWith(keyword))) {
    return 70
  }
  const searchable = [entry.id, entry.name, ...entry.aliases, entry.summary, ...entry.details]
    .map(normalizeSearchText)
  return searchable.some((value) => value.includes(keyword)) ? 40 : 0
}

export async function searchEncyclopedia(input, { limit = 5 } = {}) {
  const { type, keyword: rawKeyword } = parseCategoryKeyword(input)
  const keyword = normalizeSearchText(rawKeyword)
  if (!keyword) return { keyword: '', type, entries: [] }

  const entries = await loadEncyclopediaEntries()
  const matches = entries
    .filter((entry) => !type || entry.type === type)
    .map((entry) => ({ entry, score: scoreEntry(entry, keyword) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name, 'zh-CN'))
    .slice(0, Math.max(1, Number(limit) || 5))
    .map((item) => item.entry)

  return { keyword: rawKeyword, type, entries: matches }
}

export function resetEncyclopediaForTests() {
  entriesPromise = null
}
