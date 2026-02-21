const express = require("express");
const router = express.Router();
const { getOrganizerProfile, updateOrganizerProfile, submitResetRequest, getMyResetRequests } = require("../controllers/organizerController");
const { authenticate, organizerOnly } = require("../middleware/authMiddleware");

router.get("/profile", authenticate, organizerOnly, getOrganizerProfile);
router.put("/profile", authenticate, organizerOnly, updateOrganizerProfile);

// Password Reset Requests
router.post("/reset-request", authenticate, organizerOnly, submitResetRequest);
router.get("/reset-requests", authenticate, organizerOnly, getMyResetRequests);

module.exports = router;
