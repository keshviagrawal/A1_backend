const express = require("express");
const router = express.Router();

const { participantSignup, login, getMe } = require("../controllers/authController");
const { authenticate } = require("../middleware/authMiddleware");

router.post("/signup/participant", participantSignup);
router.post("/login", login);
router.get("/me", authenticate, getMe);

module.exports = router;

// It connects HTTP endpoints to the authentication logic.
// Which URL should handle signup?
// Which URL should handle login?
// Which controller function runs for each?
