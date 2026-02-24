const express = require("express");
const router = express.Router();

const {
  getProfile,
  updateProfile,
  saveOnboarding,
  skipOnboarding,
  followOrganizer,
  unfollowOrganizer,
  getAllOrganizers,
  changePassword,
  getOrganizerPublicDetails,
} = require("../controllers/participantController");

const {
  authenticate,
  participantOnly,
} = require("../middleware/authMiddleware");

router.use(authenticate, participantOnly);

router.get("/profile", getProfile);
router.put("/profile", updateProfile);

router.post("/onboarding", saveOnboarding);
router.post("/onboarding/skip", skipOnboarding);

router.post("/follow/:organizerId", followOrganizer);
router.delete("/follow/:organizerId", unfollowOrganizer);

router.get("/organizers", getAllOrganizers);
router.put("/change-password", authenticate, changePassword);
router.get("/organizers/:organizerId", authenticate, getOrganizerPublicDetails);

module.exports = router;