export class ExternalApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string>;

  constructor(message: string, status: number, code: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
