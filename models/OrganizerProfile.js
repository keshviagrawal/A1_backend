const mongoose = require("mongoose");

const organizerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },      // Every organizer profile is linked to exactly one user account.
    organizerName: {
      type: String,
      required: true,
    },
    category: String,
    description: String,
    contactEmail: String,
    contactNumber: String,
    discordWebhook: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "OrganizerProfile",
  organizerProfileSchema
);
