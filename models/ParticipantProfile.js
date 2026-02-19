const mongoose = require("mongoose");

const participantProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    participantType: {
      type: String,
      enum: ["IIIT", "NON-IIIT"],
      required: true,
    },
    collegeOrOrgName: {
      type: String,
      required: true,
    },
    contactNumber: {
      type: String,
      default: "",
    },
    interests: {
      type: [String],
      default: [],
    },
    followedOrganizers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OrganizerProfile",
      },
    ],
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ParticipantProfile", participantProfileSchema);

// This file defines a Participant Profile model.
// It stores who the participant is as a person, not how they log in.