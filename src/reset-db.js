const { resetDatabase, DB_PATH } = require('./db');

const db = resetDatabase();
console.log(
  `[DB Reset] Restored ${db.users.length} accounts and ${db.courses.length} course(s) to ${DB_PATH}`
);
