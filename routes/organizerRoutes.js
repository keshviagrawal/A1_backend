const express = require("express");
const router = express.Router();
const { getOrganizerProfile, updateOrganizerProfile } = require("../controllers/organizerController");
const { authenticate, organizerOnly } = require("../middleware/authMiddleware");

router.get("/profile", authenticate, organizerOnly, getOrganizerProfile);
router.put("/profile", authenticate, organizerOnly, updateOrganizerProfile);

module.exports = router;
