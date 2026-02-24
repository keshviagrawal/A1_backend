const express = require("express");
const router = express.Router();

const { 
  participantSignup, 
  login, 
  getMe,
  initiateIIITSignup,
  verifyOTP,
  resendOTP,
  completeIIITSignup
} = require("../controllers/authController");
const { authenticate } = require("../middleware/authMiddleware");

router.post("/signup/participant", participantSignup);
router.post("/signup/iiit/initiate", initiateIIITSignup); // Step 1: Send OTP
router.post("/signup/iiit/verify-otp", verifyOTP);        // Step 2: Verify OTP
router.post("/signup/iiit/resend-otp", resendOTP);        // Resend OTP
router.post("/signup/iiit/complete", completeIIITSignup); // Step 3: Set password
router.post("/login", login);
router.get("/me", authenticate, getMe);

module.exports = router;

// It connects HTTP endpoints to the authentication logic.
// Which URL should handle signup?
// Which URL should handle login?
// Which controller function runs for each?
