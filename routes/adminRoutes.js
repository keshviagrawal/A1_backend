const express = require("express");
const router = express.Router();

//const { createOrganizer } = require("../controllers/adminController");
const adminController = require("../controllers/adminController");

const { authenticate, adminOnly } = require("../middleware/authMiddleware");

// router.get(
//   "/organizers",
//   authenticate,
//   adminOnly,
//   adminController.getAllOrganizers
// );
// router.post("/organizers", authenticate, adminController.createOrganizer);
// router.patch("/reset-password/:userId", authenticate, adminOnly, adminController.resetOrganizerPassword);

// Stats
router.get("/stats", authenticate, adminOnly, adminController.getSystemStats);

router.get("/organizers", authenticate, adminOnly, adminController.getAllOrganizers);
router.post("/organizers", authenticate, adminOnly, adminController.createOrganizer);
router.patch("/reset-password/:userId", authenticate, adminOnly, adminController.resetOrganizerPassword);
router.patch("/organizers/:userId/disable", authenticate, adminOnly, adminController.disableOrganizer);
router.delete("/organizers/:userId", authenticate, adminOnly, adminController.deleteOrganizer);

module.exports = router;
