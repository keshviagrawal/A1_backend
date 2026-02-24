const mongoose = require("mongoose");   // bringing mongodb helper library(mongoose) into this file to use mongodb easily

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["participant", "organizer", "admin"],
      required: true,
    },
    isDisabled: {
      type: Boolean,
      default: false,
    } // added if the admin disables the organizer, he can't login again
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

// This model handles authentication + authorization, not business logic.
// it defines how a user is stored in database