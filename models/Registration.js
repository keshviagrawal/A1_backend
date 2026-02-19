const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParticipantProfile",
      required: true,
    },
    status: {
      type: String,
      enum: ["REGISTERED", "CANCELLED", "ATTENDED", "PURCHASED"],
      default: "REGISTERED",
    },
    attended: {
      type: Boolean,
      default: false,
    },
    registeredAt: {
      type: Date,
      default: Date.now,
    },

    // ===== MERCHANDISE SPECIFIC FIELDS =====
    merchandisePurchase: {
      // Selected variant
      size: String,
      color: String,
      quantity: {
        type: Number,
        default: 1,
      },
      // Total amount paid
      totalAmount: {
        type: Number,
        default: 0,
      },
    },

    // Ticket details
    ticketId: {
      type: String,
      unique: true,
      sparse: true,
    },

    qrCode: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Registration", registrationSchema);