export class UploadError extends Error {
    code;
    constructor(message, code = 'UPLOAD_ERROR') {
        super(message);
        this.code = code;
        this.name = 'UploadError';
    }
}
//# sourceMappingURL=errors.js.map