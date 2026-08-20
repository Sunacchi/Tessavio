const replyMaxCharacters = 3_500;
const replyContentCharacters = 3_250;

/**
 * Compone una risposta Telegram entro un limite di caratteri, dichiarando
 * quanto è stato omesso invece di troncare in silenzio.
 */
export function renderBoundedSections(
  heading: string,
  sections: readonly string[],
  sourceTruncated = false,
): string {
  let rendered = heading;
  let included = 0;
  for (const section of sections) {
    const candidate = `${rendered}\n\n${section}`;
    if (candidate.length > replyContentCharacters) break;
    rendered = candidate;
    included += 1;
  }
  const omitted = sections.length - included;
  if (omitted === 0 && !sourceTruncated) return rendered;
  const suffix = sourceTruncated
    ? "Dettaglio parziale: altri elementi non mostrati. Restringi il periodo o la data."
    : `${String(omitted)} dettagli non mostrati. Restringi il periodo o la data.`;
  const bounded = `${rendered}\n\n${suffix}`;
  return bounded.slice(0, replyMaxCharacters);
}
