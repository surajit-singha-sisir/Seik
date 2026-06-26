export class UploadError extends Error {
  code: string;
  constructor(message: string, code = 'UPLOAD_ERROR') {
    super(message);
    this.code = code;
    this.name = 'UploadError';
  }
}
