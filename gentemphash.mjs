import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('TempDebugPass123', 12);
console.log(hash);
