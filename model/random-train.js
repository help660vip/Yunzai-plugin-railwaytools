function shuffled(values, random) {
  const items = [...values]
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const current = items[index]
    items[index] = items[target]
    items[target] = current
  }
  return items
}

export async function selectRandomTrain({
  trainCodes,
  loadTrainDetails,
  knowledgeEntries = [],
  random = Math.random,
  maxAttempts = 5
}) {
  if (!Array.isArray(trainCodes) || trainCodes.length === 0) {
    throw new TypeError('Random train candidates are unavailable')
  }
  if (typeof loadTrainDetails !== 'function') {
    throw new TypeError('Random train selection requires a train detail loader')
  }

  let lastError = null
  const candidates = shuffled(trainCodes, random).slice(0, Math.max(1, maxAttempts))
  for (const trainCode of candidates) {
    try {
      const details = await loadTrainDetails(trainCode)
      const normalizedStyle = String(details.trainStyle ?? '').toUpperCase()
      const matchingKnowledge = knowledgeEntries.find((entry) => {
        const terms = [entry.id, entry.name, ...(entry.aliases ?? [])].map((value) => String(value).toUpperCase())
        return terms.some((term) => term && normalizedStyle.includes(term))
      })
      const fallbackKnowledge = knowledgeEntries[Math.floor(random() * knowledgeEntries.length)] ?? null
      return {
        details,
        knowledge: matchingKnowledge ?? fallbackKnowledge,
        attemptedTrainCodes: candidates
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('No random train candidate returned usable data')
}
