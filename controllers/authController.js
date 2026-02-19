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

    // IIIT email validation
    if (participantType === "IIIT") {
      if (!email.endsWith("@iiit.ac.in")) {
        return res.status(400).json({
          message: "IIIT participants must use IIIT email (@iiit.ac.in)",
        });
      }
    } else {
      // Non-IIIT must provide password
      if (!password) {
        return res.status(400).json({
          message: "Password is required for Non-IIIT participants",
        });
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // For IIIT: generate random password (they won't use it)
    // For Non-IIIT: use provided password
    const passwordToHash = participantType === "IIIT"
      ? Math.random().toString(36).slice(-12)
      : password;

    const hashedPassword = await bcrypt.hash(passwordToHash, 10);

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

    // Check if IIIT participant (email-only login)
    let isIIITParticipant = false;
    if (user.role === "participant") {
      const profile = await ParticipantProfile.findOne({ userId: user._id });
      isIIITParticipant = profile?.participantType === "IIIT";
    }

    // For IIIT: just verify email domain, no password check
    // For others: verify password
    if (isIIITParticipant) {
      if (!email.endsWith("@iiit.ac.in")) {
        return res.status(401).json({ message: "Invalid IIIT email" });
      }
      // No password check for IIIT students
    } else {
      // Non-IIIT and other roles require password
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
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