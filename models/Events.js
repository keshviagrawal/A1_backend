// const mongoose = require("mongoose");

// const eventSchema = new mongoose.Schema(
//     {
//         eventName: {
//         type: String,
//         required: true,
//         trim: true,
//         },
//         description: {
//         type: String,
//         required: true,
//         },
//         eventType: {
//         type: String,
//         enum: ["NORMAL", "MERCHANDISE"],
//         required: true,
//         },
//         eligibility: {
//         type: String,
//         enum: ["IIIT", "NON-IIIT", "ALL"],
//         default: "ALL",
//         },
//         registrationDeadline: {
//         type: Date,
//         required: true,
//         },
//         startDate: {
//         type: Date,
//         required: true,
//         },
//         endDate: {
//         type: Date,
//         required: true,
//         },
//         registrationLimit: {
//         type: Number,
//         required: true,
//         },
//         registrationFee: {
//         type: Number,
//         default: 0,
//         },
//         organizerId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "OrganizerProfile",
//         required: true,
//         },
//         tags: [String],
//         status: {
//         type: String,
//         enum: ["DRAFT", "PUBLISHED", "ONGOING", "COMPLETED"],
//         default: "DRAFT",
//         },

//         // ===== MERCHANDISE SPECIFIC FIELDS =====
//     merchandiseDetails: {
//       // Item name (e.g., "Club T-Shirt 2024")
//       itemName: {
//         type: String,
//       },
//       // Price per item
//       price: {
//         type: Number,
//       },
//       // Available sizes
//       sizes: {
//         type: [String],
//         default: [], // e.g., ["XS", "S", "M", "L", "XL", "XXL"]
//       },
//       // Available colors
//       colors: {
//         type: [String],
//         default: [], // e.g., ["Black", "White", "Navy"]
//       },
//       // Stock per variant (size-color combination)
//       variants: [
//         {
//           size: String,
//           color: String,
//           stock: {
//             type: Number,
//             default: 0,
//           },
//         },
//       ],
//       // Total stock quantity
//       totalStock: {
//         type: Number,
//         default: 0,
//       },
//       // Max items per participant
//       purchaseLimitPerParticipant: {
//         type: Number,
//         default: 1,
//       },
//     },
//         { timestamps: true }
// );

// module.exports = mongoose.model("Event", eventSchema);

const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    // Basic Info
    eventName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    eventType: {
      type: String,
      enum: ["NORMAL", "MERCHANDISE"],
      required: true,
    },
    eligibility: {
      type: String,
      enum: ["IIIT", "NON-IIIT", "ALL"],
      default: "ALL",
    },

    // Dates
    registrationDeadline: {
      type: Date,
      required: true,
    },
    eventStartDate: {
      type: Date,
      required: true,
    },
    eventEndDate: {
      type: Date,
      required: true,
    },

    // Registration
    registrationLimit: {
      type: Number,
      required: true,
    },
    registrationFee: {
      type: Number,
      default: 0,
    },

    // Organizer
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizerProfile",
      required: true,
    },

    // Tags
    tags: {
      type: [String],
      default: [],
    },

    // Status
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ONGOING", "COMPLETED", "CLOSED"],
      default: "DRAFT",
    },

    // ===== MERCHANDISE SPECIFIC FIELDS =====
    merchandiseDetails: {
      // Item name (e.g., "Club T-Shirt 2024")
      itemName: {
        type: String,
      },
      // Price per item
      price: {
        type: Number,
      },
      // Available sizes
      sizes: {
        type: [String],
        default: [], // e.g., ["XS", "S", "M", "L", "XL", "XXL"]
      },
      // Available colors
      colors: {
        type: [String],
        default: [], // e.g., ["Black", "White", "Navy"]
      },
      // Stock per variant (size-color combination)
      variants: [
        {
          size: String,
          color: String,
          stock: {
            type: Number,
            default: 0,
          },
        },
      ],
      // Total stock quantity
      totalStock: {
        type: Number,
        default: 0,
      },
      // Max items per participant
      purchaseLimitPerParticipant: {
        type: Number,
        default: 1,
      },
    },

    // ===== CUSTOM FORM BUILDER =====
    customForm: [
      {
        id: String,
        type: {
          type: String,
          enum: ['text', 'number', 'dropdown', 'checkbox', 'file'],
          default: 'text'
        },
        label: String,
        required: { type: Boolean, default: false },
        options: [String], // for dropdown
      }
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);

// The Event model stores all core event details and includes a status field to manage the event lifecycle. Only published events are visible to participants, and the organizer reference ensures ownership and access control.