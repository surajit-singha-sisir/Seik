import { Router } from 'express';
import multer from 'multer';
import { uploadFile, uploadFromUrl, previewCompression } from '../controllers/uploadController.js';

const MAX_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 32) * 1024 * 1024;

// memoryStorage only — Vercel's filesystem is ephemeral, never write to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

const router = Router();

router.post('/', upload.single('file'), uploadFile);
router.post('/url', uploadFromUrl);
router.post('/preview', upload.single('file'), previewCompression);

export default router;
