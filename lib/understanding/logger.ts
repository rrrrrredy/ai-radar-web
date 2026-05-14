export class UnderstandingLogger {
  private readonly warningMessages: string[] = [];
  private readonly errorMessages: string[] = [];

  info(message: string) {
    console.log(`[understanding] ${message}`);
  }

  warn(message: string) {
    this.warningMessages.push(message);
    console.warn(`[understanding] Warning: ${message}`);
  }

  error(message: string) {
    this.errorMessages.push(message);
    console.error(`[understanding] Error: ${message}`);
  }

  warnings() {
    return [...this.warningMessages];
  }

  errors() {
    return [...this.errorMessages];
  }
}
