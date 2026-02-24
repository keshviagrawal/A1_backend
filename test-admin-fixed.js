require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const adminController = require('./controllers/adminController');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const req = {};
    let finalCode = 200;
    const res = {
      json: (data) => { console.log("DATA:", data); },
      status: (code) => { console.log("STATUS:", code); finalCode = code; return res; }
    };
    await adminController.getAllOrganizers(req, res);
    process.exit(0);
  })
  .catch(console.error);
