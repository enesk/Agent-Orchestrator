/**
 * Ein Lauffehler mit fester Ursache. Die Ursache steht als Code daran, weil die Meldung
 * selbst in der eingestellten Sprache verfasst ist und sich nicht mehr über Textmuster
 * einordnen ließe.
 */
export class RunError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RunError'
  }
}
