// const bcrypt = require("bcrypt");
// const jwt = require("jsonwebtoken");
// const User = require("../models/User");
// const ParticipantProfile = require("../models/ParticipantProfile");

// exports.participantSignup = async (req, res) => {
//   let createdUser = null;

//   try {
//     const {
//       email,
//       password,
//       firstName,
//       lastName,
//       participantType,
//       collegeOrOrgName,
//     } = req.body;

//     // Validate required fields
//     if (!email || !firstName || !lastName || !participantType || !collegeOrOrgName) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     // IIIT email validation
//     if (participantType === "IIIT") {
//       if (!email.endsWith("@iiit.ac.in")) {
//         return res.status(400).json({
//           message: "IIIT participants must use IIIT email (@iiit.ac.in)",
//         });
//       }
//       // IIIT students don't need password
//     } else {
//       // Non-IIIT must provide password
//       if (!password) {
//         return res.status(400).json({
//           message: "Password is required for Non-IIIT participants",
//         });
//       }
//     }

//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//       return res.status(400).json({ message: "User already exists" });
//     }

//     // For IIIT: generate random password (they won't use it, will use email link)
//     // For Non-IIIT: use provided password
//     const passwordToHash = participantType === "IIIT"
//       ? Math.random().toString(36).slice(-12)
//       : password;

//     const hashedPassword = await bcrypt.hash(passwordToHash, 10);

//     // Create user first
//     createdUser = await User.create({
//       email,
//       password: hashedPassword,
//       role: "participant",
//     });

//     // Create participant profile
//     await ParticipantProfile.create({
//       userId: createdUser._id,
//       firstName,
//       lastName,
//       participantType,
//       collegeOrOrgName,
//     });

//     res.status(201).json({ message: "Participant registered successfully" });
//   } catch (err) {
//     // Rollback: Delete user if profile creation failed
//     if (createdUser) {
//       await User.findByIdAndDelete(createdUser._id);
//     }

//     console.error("Signup error:", err.message);
//     res.status(500).json({ message: "Signup failed", error: err.message });
//   }
// };


// exports.login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     const user = await User.findOne({ email });
//     if (!user) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }
//     if (user.isDisabled) {
//       return res.status(403).json({
//         message: "Account is disabled. Contact Admin.",
//       });
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     const token = jwt.sign(
//       { userId: user._id, role: user.role },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" }
//     );

//     // Check onboarding status for participants
//     let onboardingCompleted = true;
//     if (user.role === "participant") {
//       const profile = await ParticipantProfile.findOne({ userId: user._id });
//       onboardingCompleted = profile?.onboardingCompleted || false;
//     }

//     res.json({
//       token,
//       role: user.role,
//       onboardingCompleted,
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Login failed" });
//   }
// };


// // Get Current User Profile (/api/auth/me)
// exports.getMe = async (req, res) => {
//   try {
//     const user = await User.findById(req.user.userId).select("-password");

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     res.json(user);
//   } catch (error) {
//     res.status(500).json({ message: "Failed to fetch user" });
//   }
// };

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ParticipantProfile = require("../models/ParticipantProfile");
const EmailVerification = require("../models/EmailVerification");
const sendEmail = require("../utils/sendEmail");

// IIIT domains for validation
const iiitDomains = ["@iiit.ac.in", "@students.iiit.ac.in", "@research.iiit.ac.in"];

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Step 1 for IIIT: Send OTP to IIIT email
exports.initiateIIITSignup = async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      participantType,
      collegeOrOrgName,
      contactNumber,
    } = req.body;

    // Validate required fields
    if (!email || !firstName || !lastName || !participantType || !collegeOrOrgName || !contactNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate contact number (10 digits)
    if (!/^\d{10}$/.test(contactNumber)) {
      return res.status(400).json({ message: "Contact number must be 10 digits" });
    }

    // Validate IIIT email
    const isValidIIIT = iiitDomains.some(domain => email.endsWith(domain));
    if (!isValidIIIT) {
      return res.status(400).json({
        message: "IIIT participants must use IIIT email (@iiit.ac.in, @students.iiit.ac.in, or @research.iiit.ac.in)",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists. Please login." });
    }

    // Delete any existing verification records for this email
    await EmailVerification.deleteMany({ email });

    // Generate 6-digit OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save verification record
    await EmailVerification.create({
      email,
      otp,
      firstName,
      lastName,
      participantType,
      collegeOrOrgName,
      contactNumber,
      expiresAt,
    });

    // Send OTP email
    await sendEmail({
      to: email,
      subject: "Your OTP for Felicity Portal Registration",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Felicity Portal - Email Verification</h2>
          <p>Hi ${firstName},</p>
          <p>Your OTP for email verification is:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #f3f4f6; padding: 20px 40px; border-radius: 8px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${otp}</span>
            </div>
          </div>
          <p style="color: #ef4444; font-weight: bold;">⚠️ This OTP will expire in 10 minutes.</p>
          <p style="color: #6b7280;">Do not share this OTP with anyone.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    res.status(200).json({
      message: "OTP sent to your IIIT email!",
      email: email,
      requiresOTP: true
    });
  } catch (err) {
    console.error("IIIT signup initiation error:", err.message);
    res.status(500).json({ message: "Failed to send OTP", error: err.message });
  }
};

// Resend OTP
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find existing verification record
    const verification = await EmailVerification.findOne({ email, isVerified: false });

    if (!verification) {
      return res.status(400).json({ message: "No pending verification found. Please sign up again." });
    }

    // Generate new OTP
    const otp = generateOTP();
    verification.otp = otp;
    verification.attempts = 0;
    verification.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await verification.save();

    // Send OTP email
    await sendEmail({
      to: email,
      subject: "Your New OTP for Felicity Portal Registration",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Felicity Portal - Email Verification</h2>
          <p>Hi ${verification.firstName},</p>
          <p>Your new OTP for email verification is:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #f3f4f6; padding: 20px 40px; border-radius: 8px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${otp}</span>
            </div>
          </div>
          <p style="color: #ef4444; font-weight: bold;">⚠️ This OTP will expire in 10 minutes.</p>
          <p style="color: #6b7280;">Do not share this OTP with anyone.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    res.status(200).json({ message: "New OTP sent to your email!" });
  } catch (err) {
    console.error("Resend OTP error:", err.message);
    res.status(500).json({ message: "Failed to resend OTP", error: err.message });
  }
};

// Step 2 for IIIT: Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const verification = await EmailVerification.findOne({ email });

    if (!verification) {
      return res.status(400).json({ message: "No verification found. Please sign up again." });
    }

    // Check if already verified
    if (verification.isVerified) {
      return res.status(200).json({
        message: "Email already verified. Please set your password.",
        verified: true,
        email: verification.email,
        firstName: verification.firstName
      });
    }

    // Check expiry
    if (verification.expiresAt < new Date()) {
      await EmailVerification.deleteOne({ _id: verification._id });
      return res.status(400).json({ message: "OTP has expired. Please sign up again." });
    }

    // Check attempts (max 5)
    if (verification.attempts >= 5) {
      await EmailVerification.deleteOne({ _id: verification._id });
      return res.status(400).json({ message: "Too many failed attempts. Please sign up again." });
    }

    // Verify OTP
    if (verification.otp !== otp) {
      verification.attempts += 1;
      await verification.save();
      return res.status(400).json({
        message: `Invalid OTP. ${5 - verification.attempts} attempts remaining.`
      });
    }

    // Mark as verified
    verification.isVerified = true;
    await verification.save();

    res.status(200).json({
      message: "Email verified successfully! Please set your password.",
      email: verification.email,
      firstName: verification.firstName,
      verified: true
    });
  } catch (err) {
    console.error("OTP verification error:", err.message);
    res.status(500).json({ message: "Verification failed", error: err.message });
  }
};

// Step 3 for IIIT: Complete registration with password
exports.completeIIITSignup = async (req, res) => {
  let createdUser = null;

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Find verified record
    const verification = await EmailVerification.findOne({ email, isVerified: true });

    if (!verification) {
      return res.status(400).json({ message: "Email not verified. Please verify your email first." });
    }

    // Check if user was created in the meantime
    const existingUser = await User.findOne({ email: verification.email });
    if (existingUser) {
      await EmailVerification.deleteOne({ _id: verification._id });
      return res.status(400).json({ message: "Account already exists. Please login." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    createdUser = await User.create({
      email: verification.email,
      password: hashedPassword,
      role: "participant",
    });

    // Create participant profile
    await ParticipantProfile.create({
      userId: createdUser._id,
      firstName: verification.firstName,
      lastName: verification.lastName,
      participantType: verification.participantType,
      collegeOrOrgName: verification.collegeOrOrgName,
      contactNumber: verification.contactNumber,
    });

    // Clean up verification record
    await EmailVerification.deleteOne({ _id: verification._id });

    res.status(201).json({ message: "Registration completed successfully! Please login." });
  } catch (err) {
    // Rollback: Delete user if profile creation failed
    if (createdUser) {
      await User.findByIdAndDelete(createdUser._id);
    }

    console.error("IIIT signup completion error:", err.message);
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
};

// Non-IIIT signup (direct registration with password)
exports.participantSignup = async (req, res) => {
  let createdUser = null;

  try {
    const {
      email,
      password,
      firstName,
      lastName,
      participantType,
      collegeOrOrgName,
      contactNumber,
    } = req.body;

    // Validate required fields
    if (!email || !firstName || !lastName || !participantType || !collegeOrOrgName || !contactNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate contact number (10 digits)
    if (!/^\d{10}$/.test(contactNumber)) {
      return res.status(400).json({ message: "Contact number must be 10 digits" });
    }

    // If IIIT type, redirect to email verification flow
    if (participantType === "IIIT") {
      const isValidIIIT = iiitDomains.some(domain => email.endsWith(domain));
      if (!isValidIIIT) {
        return res.status(400).json({
          message: "IIIT participants must use IIIT email (@iiit.ac.in, @students.iiit.ac.in, or @research.iiit.ac.in)",
        });
      }
      // Use the IIIT verification flow instead
      return exports.initiateIIITSignup(req, res);
    }

    // Password is required for NON-IIIT users
    if (!password) {
      return res.status(400).json({
        message: "Password is required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user first
    createdUser = await User.create({
      email,
      password: hashedPassword,
      role: "participant",
    });

    // Create participant profile
    await ParticipantProfile.create({
      userId: createdUser._id,
      firstName,
      lastName,
      participantType,
      collegeOrOrgName,
      contactNumber,
    });

    res.status(201).json({ message: "Participant registered successfully" });
  } catch (err) {
    // Rollback: Delete user if profile creation failed
    if (createdUser) {
      await User.findByIdAndDelete(createdUser._id);
    }

    console.error("Signup error:", err.message);
    res.status(500).json({ message: "Signup failed", error: err.message });
  }
};


exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.isDisabled) {
      return res.status(403).json({
        message: "Account is disabled. Contact Admin.",
      });
    }

    // All users require password
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Check onboarding status for participants
    let onboardingCompleted = true;
    if (user.role === "participant") {
      const profile = await ParticipantProfile.findOne({ userId: user._id });
      onboardingCompleted = profile?.onboardingCompleted || false;
    }

    res.json({
      token,
      role: user.role,
      onboardingCompleted,
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed" });
  }
};


// Get Current User Profile (/api/auth/me)
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

// This file implement a complete authentication system for our website
// allow a user to create a account securely(signup) and then log in 