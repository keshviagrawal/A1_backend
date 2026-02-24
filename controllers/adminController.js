const bcrypt = require("bcrypt");
const User = require("../models/User");
const OrganizerProfile = require("../models/OrganizerProfile");
const sendEmail = require("../utils/sendEmail");

exports.createOrganizer = async (req, res) => {
  try {
    const {
      email,
      organizerName,
      category,
      description,
      contactEmail,
    } = req.body;

    // checking if organizer already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Organizer already exists" });
    }

    // generating password
    const plainPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // creating user
    const user = await User.create({
      email,
      password: hashedPassword,
      role: "organizer",
    });

    // creating organizer profile
    await OrganizerProfile.create({
      userId: user._id,
      organizerName,
      category,
      description,
      contactEmail,
    });

    try {
      await sendEmail({
        to: contactEmail,
        subject: "Organizer Account Created",
        text: `Hello ${organizerName},

Your organizer account has been created successfully.

Login Email: ${email}
Password: ${plainPassword}

Please keep these credentials safe. If you need a password reset, submit a reset request through the portal and an admin will process it for you.

Regards,
Felicity Portal Team`,
      });
    } catch (err) {
      console.error("Failed to send organizer credentials email");
    }

    res.status(201).json({
      message: "Organizer created successfully",
      email,
      password: plainPassword, // later this will be emailed
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create organizer",
      error: error.message,
    });
  }
};

exports.resetOrganizerPassword = async (req, res) => {
  try {
    const { userId } = req.params;

    // Finding user
    const user = await User.findById(userId);

    if (!user || user.role !== "organizer") {
      return res.status(404).json({
        message: "Organizer not found",
      });
    }

    // Generating random password
    const newPassword = Math.random().toString(36).slice(-8);

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Saving hashed password
    user.password = hashedPassword;
    await user.save();

    // Also resolve any pending reset requests for this organizer
    const PasswordResetRequest = require("../models/PasswordResetRequest");
    await PasswordResetRequest.updateMany(
      { organizerId: userId, status: "PENDING" },
      { status: "APPROVED", adminComment: "Reset directly by admin", resolvedAt: new Date() }
    );

    // Fetching organizer profile
    const organizerProfile = await OrganizerProfile.findOne({ userId });

    // Sending email to contactEmail (fallback to login email)
    await sendEmail({
      to: organizerProfile?.contactEmail || user.email,
      subject: "Password Reset",
      text: `Hello ${organizerProfile?.organizerName || "Organizer"},

Your password has been reset.

Login Email: ${user.email}
New Password: ${newPassword}

Please change your password after logging in.

Regards,
Felicity Portal Team`,
    });

    res.json({
      message: "Password reset successfully and emailed.",
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Password reset failed",
    });
  }
};

exports.getAllOrganizers = async (req, res) => {
  try {
    const organizers = await User.find({ role: "organizer" }).lean();

    // Fetch profiles for these users
    const profiles = await OrganizerProfile.find({
      userId: { $in: organizers.map(u => u._id) }
    }).lean();

    // Merge data
    const data = organizers.map(user => {
      const profile = profiles.find(p => p.userId && p.userId.toString() === user._id.toString());
      return {
        _id: user._id,
        email: user.email,
        isDisabled: user.isDisabled,
        organizerName: profile?.organizerName || "N/A",
        category: profile?.category || "N/A",
        contactEmail: profile?.contactEmail || "N/A",
        contactNumber: profile?.contactNumber || "N/A",
        createdAt: user.createdAt
      };
    });

    res.json(data);
  } catch (err) {
    console.error("Fetch Organizers Error:", err);
    res.status(500).json({ message: "Failed to fetch organizers", error: err.message });
  }
};

// ...existing code...

exports.disableOrganizer = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user || user.role !== "organizer") {
      return res.status(404).json({ message: "Organizer not found" });
    }

    user.isDisabled = true;
    await user.save();

    res.json({ message: "Organizer disabled successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to disable organizer" });
  }
};

exports.enableOrganizer = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user || user.role !== "organizer") {
      return res.status(404).json({ message: "Organizer not found" });
    }

    user.isDisabled = false;
    await user.save();

    res.json({ message: "Organizer enabled successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to enable organizer" });
  }
};

exports.deleteOrganizer = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user || user.role !== "organizer") {
      return res.status(404).json({ message: "Organizer not found" });
    }

    const Event = require("../models/Events");
    const Registration = require("../models/Registration");
    const ForumMessage = require("../models/ForumMessage");

    const profile = await OrganizerProfile.findOne({ userId });

    if (profile) {
      // Find all events owned by this organizer
      const events = await Event.find({ organizerId: profile._id });
      const eventIds = events.map(e => e._id);

      // Delete all registrations and forum messages for these events
      if (eventIds.length > 0) {
        await Registration.deleteMany({ eventId: { $in: eventIds } });
        await ForumMessage.deleteMany({ eventId: { $in: eventIds } });
        // Delete all events themselves
        await Event.deleteMany({ organizerId: profile._id });
      }

      // Finally, delete the organizer profile
      await OrganizerProfile.deleteOne({ userId });
    }

    await User.deleteOne({ _id: userId });

    res.json({ message: "Organizer deleted successfully" });
  } catch (err) {
    console.error("Delete Organizer Error:", err);
    res.status(500).json({ message: "Failed to delete organizer", error: err.message });
  }
};

exports.getSystemStats = async (req, res) => {
  try {
    const totalOrganizers = await User.countDocuments({ role: "organizer" });
    const totalParticipants = await User.countDocuments({ role: "participant" });
    const totalEvents = await require("../models/Events").countDocuments();
    const totalRegistrations = await require("../models/Registration").countDocuments();

    res.json({
      totalOrganizers,
      totalParticipants,
      totalEvents,
      totalRegistrations
    });
  } catch (err) {
    console.error("Stats fetch error:", err);
    res.status(500).json({ message: "Failed to fetch system stats" });
  }
};

// ===== PASSWORD RESET REQUEST MANAGEMENT =====

const PasswordResetRequest = require("../models/PasswordResetRequest");

// Get all reset requests (with optional status filter)
exports.getResetRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const requests = await PasswordResetRequest.find(filter).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch reset requests", error: err.message });
  }
};

// Approve reset request — auto-generate password + email
exports.approveResetRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await PasswordResetRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "PENDING") return res.status(400).json({ message: "Request already processed" });

    const user = await User.findById(request.organizerId);
    if (!user) return res.status(404).json({ message: "Organizer user not found" });

    // Generate new password
    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Update request
    request.status = "APPROVED";
    request.adminComment = req.body.comment || "";
    request.resolvedAt = new Date();
    await request.save();

    // Email organizer
    const profile = await OrganizerProfile.findOne({ userId: request.organizerId });
    try {
      await sendEmail({
        to: profile?.contactEmail || user.email,
        subject: "Password Reset Approved",
        text: `Hello ${request.organizerName},

Your password reset request has been approved.

Login Email: ${user.email}
New Password: ${newPassword}

Please change your password after logging in.

Regards,
Felicity Portal Team`,
      });
    } catch (emailErr) {
      console.error("Failed to send reset email:", emailErr);
    }

    res.json({
      message: "Request approved — new password generated and emailed",
      newPassword, // Admin can also see this
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to approve request", error: err.message });
  }
};

// Reject reset request
exports.rejectResetRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { comment } = req.body;

    const request = await PasswordResetRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "PENDING") return res.status(400).json({ message: "Request already processed" });

    request.status = "REJECTED";
    request.adminComment = comment || "";
    request.resolvedAt = new Date();
    await request.save();

    res.json({ message: "Request rejected" });
  } catch (err) {
    res.status(500).json({ message: "Failed to reject request", error: err.message });
  }
};