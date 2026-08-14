import { readFile } from 'node:fs/promises'

let candidatePromise = null

export async function loadRandomTrainCandidates() {
  if (!candidatePromise) {
    candidatePromise = readFile(new URL('../data/random-trains.json', import.meta.url), 'utf8')
      .then(JSON.parse)
      .then((values) => {
        if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string')) {
          throw new TypeError('data/random-trains.json must contain train code strings')
        }
        return Object.freeze(values.map((value) => value.toUpperCase()))
      })
      .catch((error) => {
        candidatePromise = null
        throw error
      })
  }
  return candidatePromise
}

export function resetRandomTrainCandidatesForTests() {
  candidatePromise = null
}
