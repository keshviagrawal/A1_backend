require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const adminController = require('./controllers/adminController');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const req = {};
    const res = {
      json: (data) => console.log("JSON Output: Success"),
      status: (code) => { console.log("STATUS:", code); return res; }
    };
    await adminController.getAllOrganizers(req, res);
    process.exit(0);
  })
  .catch(console.error);
