const bcrypt = require("bcrypt");
const User = require("../models/User");
const Event = require("../models/Events");
const ParticipantProfile = require("../models/ParticipantProfile");
const OrganizerProfile = require("../models/OrganizerProfile");

// Get participant profile
exports.getProfile = async (req, res) => {
  try {
    const profile = await ParticipantProfile.findOne({
      userId: req.user.userId,
    }).populate("followedOrganizers", "organizerName category");

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // Include email from User model
    const User = require("../models/User");
    const user = await User.findById(req.user.userId).select("email");

    const profileObj = profile.toObject();
    profileObj.email = user?.email || "";

    res.json(profileObj);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
};

// Update participant profile (including preferences)
// Duplicate updateProfile removed

// Save onboarding preferences
exports.saveOnboarding = async (req, res) => {
  try {
    const { interests, followedOrganizers } = req.body;

    const profile = await ParticipantProfile.findOneAndUpdate(
      { userId: req.user.userId },
      {
        interests: interests || [],
        followedOrganizers: followedOrganizers || [],
        onboardingCompleted: true,
      },
      { new: true }
    );

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.json({ message: "Onboarding completed", profile });
  } catch (error) {
    res.status(500).json({ message: "Failed to save onboarding", error: error.message });
  }
};

// Skip onboarding
exports.skipOnboarding = async (req, res) => {
  try {
    const profile = await ParticipantProfile.findOneAndUpdate(
      { userId: req.user.userId },
      { onboardingCompleted: true },
      { new: true }
    );

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.json({ message: "Onboarding skipped", profile });
  } catch (error) {
    res.status(500).json({ message: "Failed to skip onboarding", error: error.message });
  }
};

// Follow an organizer
exports.followOrganizer = async (req, res) => {
  try {
    const { organizerId } = req.params;

    const profile = await ParticipantProfile.findOneAndUpdate(
      { userId: req.user.userId },
      { $addToSet: { followedOrganizers: organizerId } },
      { new: true }
    );

    res.json({ message: "Organizer followed", profile });
  } catch (error) {
    res.status(500).json({ message: "Failed to follow organizer", error: error.message });
  }
};

// Unfollow an organizer
exports.unfollowOrganizer = async (req, res) => {
  try {
    const { organizerId } = req.params;

    const profile = await ParticipantProfile.findOneAndUpdate(
      { userId: req.user.userId },
      { $pull: { followedOrganizers: organizerId } },
      { new: true }
    );

    res.json({ message: "Organizer unfollowed", profile });
  } catch (error) {
    res.status(500).json({ message: "Failed to unfollow organizer", error: error.message });
  }
};

// Get all organizers (for onboarding/follow page)
exports.getAllOrganizers = async (req, res) => {
  try {
    // Only return organizers whose accounts are not disabled
    const activeUsers = await User.find({ role: "organizer", isDisabled: false }, "_id");
    const activeUserIds = activeUsers.map(u => u._id);

    const organizers = await OrganizerProfile.find(
      { userId: { $in: activeUserIds } },
      "organizerName category description contactEmail"
    );

    // Check which organizers the current participant follows
    const participant = await ParticipantProfile.findOne({ userId: req.user.userId });
    const followedIds = participant?.followedOrganizers?.map(id => id.toString()) || [];

    const result = organizers.map(org => ({
      ...org.toObject(),
      isFollowed: followedIds.includes(org._id.toString()),
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch organizers", error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, contactNumber, collegeOrOrgName, interests, followedOrganizers } = req.body;

    const participant = await ParticipantProfile.findOne({ userId: req.user.userId });

    if (!participant) {
      return res.status(404).json({ message: "Participant profile not found" });
    }

    // Update fields
    if (firstName) participant.firstName = firstName;
    if (lastName) participant.lastName = lastName;
    if (contactNumber !== undefined) participant.contactNumber = contactNumber;
    if (collegeOrOrgName) participant.collegeOrOrgName = collegeOrOrgName;
    if (interests) participant.interests = interests;
    if (followedOrganizers) participant.followedOrganizers = followedOrganizers;

    await participant.save();

    res.json({ message: "Profile updated successfully", participant });
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect current password" });
    }

    // Check if new password is same as current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: "New password cannot be the same as current password" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update password" });
  }
};

exports.getOrganizerPublicDetails = async (req, res) => {
  try {
    const { organizerId } = req.params;

    const organizer = await OrganizerProfile.findById(
      organizerId,
      "organizerName category description contactEmail"
    );

    if (!organizer) {
      return res.status(404).json({ message: "Organizer not found" });
    }

    const events = await Event.find({
      organizerId,
      status: "PUBLISHED",
    }).sort({ eventStartDate: 1 });

    const upcoming = events.filter(
      (e) => new Date(e.eventStartDate) >= new Date()
    );

    const past = events.filter(
      (e) => new Date(e.eventStartDate) < new Date()
    );

    res.json({
      Organizer: organizer,
      Upcoming: upcoming,
      Past: past,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch details" });
  }
};