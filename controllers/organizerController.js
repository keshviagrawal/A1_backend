const OrganizerProfile = require("../models/OrganizerProfile");
const User = require("../models/User");
const PasswordResetRequest = require("../models/PasswordResetRequest");

// Get Organizer Profile
exports.getOrganizerProfile = async (req, res) => {
    try {
        const organizer = await OrganizerProfile.findOne({ userId: req.user.userId }).populate("userId", "email");
        if (!organizer) {
            return res.status(404).json({ message: "Organizer profile not found" });
        }
        res.json(organizer);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch profile", error: err.message });
    }
};

// Update Organizer Profile
exports.updateOrganizerProfile = async (req, res) => {
    try {
        const { organizerName, category, description, contactEmail, contactNumber, discordWebhook } = req.body;

        const organizer = await OrganizerProfile.findOne({ userId: req.user.userId });
        if (!organizer) {
            return res.status(404).json({ message: "Organizer profile not found" });
        }

        // Update fields
        if (organizerName) organizer.organizerName = organizerName;
        if (category) organizer.category = category;
        if (description) organizer.description = description;
        if (contactEmail) organizer.contactEmail = contactEmail;
        if (contactNumber) organizer.contactNumber = contactNumber;
        if (discordWebhook !== undefined) organizer.discordWebhook = discordWebhook;

        await organizer.save();

        res.json({ message: "Profile updated successfully", organizer });
    } catch (err) {
        res.status(500).json({ message: "Failed to update profile", error: err.message });
    }
};

// Submit Password Reset Request
exports.submitResetRequest = async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason || reason.trim().length === 0) {
            return res.status(400).json({ message: "Reason is required" });
        }

        // Check for existing pending request
        const existing = await PasswordResetRequest.findOne({
            organizerId: req.user.userId,
            status: "PENDING",
        });

        if (existing) {
            return res.status(400).json({ message: "You already have a pending reset request" });
        }

        // Get organizer name
        const profile = await OrganizerProfile.findOne({ userId: req.user.userId });

        const request = await PasswordResetRequest.create({
            organizerId: req.user.userId,
            organizerName: profile?.organizerName || "Unknown",
            reason: reason.trim(),
        });

        res.status(201).json({ message: "Password reset request submitted", request });
    } catch (err) {
        res.status(500).json({ message: "Failed to submit request", error: err.message });
    }
};

// Get My Reset Requests (organizer views own history)
exports.getMyResetRequests = async (req, res) => {
    try {
        const requests = await PasswordResetRequest.find({ organizerId: req.user.userId })
            .sort({ createdAt: -1 });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch requests", error: err.message });
    }
};

