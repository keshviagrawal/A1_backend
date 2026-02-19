const OrganizerProfile = require("../models/OrganizerProfile");
const User = require("../models/User");

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
