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
      enum: ["REGISTERED", "CANCELLED", "ATTENDED", "PURCHASED", "PENDING_APPROVAL", "APPROVED", "REJECTED"],
      default: "REGISTERED",
    },
    attended: {
      type: Boolean,
      default: false,
    },
    attendedAt: {
      type: Date,
    },
    attendanceAuditLog: [
      {
        action: { type: String, enum: ["MARK", "UNMARK", "OVERRIDE"] },
        reason: String,
        performedBy: String, // userId of the organizer
        timestamp: { type: Date, default: Date.now },
      },
    ],
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

    // Payment approval fields (merchandise)
    paymentProof: {
      type: String, // uploaded image path
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
    },
    paymentReviewedAt: {
      type: Date,
    },

    // Custom form responses (Label -> Value)
    customResponses: {
      type: Map,
      of: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Registration", registrationSchema);