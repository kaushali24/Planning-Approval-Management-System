const pool = require('./config/db');
pool.query("SELECT pg_get_viewdef('v_simple_applications', true)").then(res => {
  console.log(res.rows[0].pg_get_viewdef);
  pool.end();
}).catch(err => {
  console.error(err);
  pool.end();
});
