import 'dotenv/config';
import axios from 'axios';

// Test with a proper small PNG (1x1 red pixel)
const png1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
  'wc3d380000000c4944415408d76360f8cfc00000000200018e' +
  '7c6561000000000049454e44ae426082', 'hex'
);

// Use a real PNG from a URL approach instead — just test the API key directly
const FormData = (await import('node:form-data')).default;
const fs = await import('node:fs');

// Read an actual image if one exists
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const uploadsDir = './public';
console.log('IMGBB_API_KEY:', process.env.IMGBB_API_KEY ? 'SET (' + process.env.IMGBB_API_KEY.slice(0,6) + '...)' : 'NOT SET');
console.log('STORAGE_PROVIDER:', process.env.STORAGE_PROVIDER);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

// Test ImgBB with a real minimal PNG
const { default: sharp } = await import('sharp');
const realBuffer = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
console.log('Test PNG size:', realBuffer.length);

const form = new FormData();
form.append('image', realBuffer, { filename: 'test.png', contentType: 'image/png' });

try {
  const { data } = await axios.post('https://api.imgbb.com/1/upload', form, {
    params: { key: process.env.IMGBB_API_KEY },
    headers: form.getHeaders(),
  });
  console.log('ImgBB SUCCESS:', data?.data?.url);
} catch (e) {
  console.error('ImgBB ERROR status:', e.response?.status);
  console.error('ImgBB ERROR body:', JSON.stringify(e.response?.data));
  console.error('ImgBB ERROR message:', e.message);
}
