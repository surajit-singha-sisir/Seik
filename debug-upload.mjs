import 'dotenv/config';
import { processUpload } from './src/api/services/uploadService.js';

// Minimal valid 1x1 JPEG
const jpeg1x1 = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e272022' +
  '2c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0b' +
  'ffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c115' +
  '52d1f024336272820909' +
  'ffd9', 'hex'
);

console.log('Testing processUpload with a small JPEG...');

try {
  const result = await processUpload({
    buffer: jpeg1x1,
    originalFilename: 'debug-test.jpg',
    claimedMimeType: 'image/jpeg',
  });
  console.log('SUCCESS! File ID:', result.file.id);
  console.log('ImgBB URL:', result.file.imgbbUrl);
} catch (err) {
  console.error('FAILED:', err.message);
  console.error(err.stack);
}
