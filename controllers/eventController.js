const Event = require("../models/Events");
const OrganizerProfile = require("../models/OrganizerProfile");
const Registration = require("../models/Registration");
const ParticipantProfile = require("../models/ParticipantProfile");
const sendEmail = require("../utils/sendEmail");
const crypto = require("crypto");

// for qr
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// Generate unique ticket ID
const generateTicketId = () => {
  return "TKT-" + crypto.randomBytes(6).toString("hex").toUpperCase();
};

// Create Event (supports both NORMAL and MERCHANDISE)
exports.createEvent = async (req, res) => {
  try {
    const {
      eventName,
      description,
      eventType,
      eligibility,
      registrationDeadline,
      eventStartDate,
      eventEndDate,
      registrationLimit,
      registrationFee,
      tags,
      merchandiseDetails,
      customForm,
    } = req.body;

    if (registrationLimit < 0) {
      return res.status(400).json({
        message: "Registration limit cannot be negative",
      });
    }

    if (new Date(eventStartDate) > new Date(eventEndDate)) {
      return res.status(400).json({
        message: "Event start date cannot be after end date",
      });
    }

    if (new Date(registrationDeadline) >= new Date(eventStartDate)) {
      return res.status(400).json({
        message: "Registration deadline must be before event start date",
      });
    }

    const organizer = await OrganizerProfile.findOne({
      userId: req.user.userId,
    });

    if (!organizer) {
      return res.status(403).json({ message: "Organizer profile not found" });
    }

    // Validate merchandise details if event type is MERCHANDISE
    if (eventType === "MERCHANDISE") {
      if (!merchandiseDetails || !merchandiseDetails.itemName || !merchandiseDetails.price) {
        return res.status(400).json({
          message: "Merchandise events require itemName and price",
        });
      }
    }

    const event = await Event.create({
      eventName,
      description,
      eventType: eventType || "NORMAL",
      eligibility: eligibility || "ALL",
      registrationDeadline,
      eventStartDate,
      eventEndDate,
      registrationLimit: registrationLimit || 0,
      registrationFee: eventType === "MERCHANDISE" ? merchandiseDetails.price : registrationFee,
      tags: tags || [],
      organizerId: organizer._id,
      status: "DRAFT",
      merchandiseDetails: eventType === "MERCHANDISE" ? merchandiseDetails : undefined,
      customForm: customForm || [],
    });

    res.status(201).json({ message: "Event created", event });
  } catch (error) {
    console.error("Create event error:", error);
    res.status(500).json({
      message: error.message || "Failed to create event",
      error: error.message,
    });
  }
};

// Register for Normal Event
exports.registerForEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { customResponses } = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.status !== "PUBLISHED") {
      return res.status(400).json({ message: "Event is not open for registration" });
    }

    // Deadline check
    if (new Date() > new Date(event.registrationDeadline)) {
      return res.status(400).json({ message: "Registration deadline has passed" });
    }

    // Custom Form Validation
    if (event.customForm && event.customForm.length > 0) {
      for (let field of event.customForm) {
        if (field.required && (!customResponses || !customResponses[field.label] || customResponses[field.label].trim() === "")) {
          return res.status(400).json({ message: `Field '${field.label}' is required.` });
        }
      }
    }

    const participant = await ParticipantProfile.findOne({
      userId: req.user.userId,
    }).populate("userId"); // so we get email

    if (!participant) {
      return res.status(403).json({ message: "Participant profile not found" });
    }

    // Eligibility check
    if (
      event.eligibility !== "ALL" &&
      event.eligibility !== participant.participantType
    ) {
      return res.status(403).json({
        message: `This event is only for ${event.eligibility} participants`,
      });
    }

    // Already registered check
    const existingReg = await Registration.findOne({
      eventId,
      participantId: participant._id,
    });

    if (existingReg) {
      return res.status(400).json({ message: "Already registered for this event" });
    }

    // Registration limit check (0 = unlimited)
    if (event.registrationLimit > 0) {
      const regCount = await Registration.countDocuments({ eventId });
      if (regCount >= event.registrationLimit) {
        return res.status(400).json({ message: "Registration limit reached" });
      }
    }

    // Generate unique ticket ID
    const ticketId = uuidv4();

    // Create QR data
    const qrData = JSON.stringify({
      eventName: event.eventName,
      eventId: event._id,
      ticketId: ticketId,
      participant: participant.userId.email,
    });

    // 1. Generate buffer for email attachment
    const qrCodeBuffer = await QRCode.toBuffer(qrData);

    // 2. Generate base64 for database storage
    const qrCodeImage = await QRCode.toDataURL(qrData);

    // Save registration with QR and Form Responses
    const registration = await Registration.create({
      eventId,
      participantId: participant._id,
      status: "REGISTERED",
      ticketId,
      qrCode: qrCodeImage,
      customResponses: customResponses || {},
    });

    // Send confirmation email
    await sendEmail({
      to: participant.userId.email,
      subject: "Event Registration Successful",
      html: `
    <h2>You're Registered Successfully!</h2>
    <p><strong>Event:</strong> ${event.eventName}</p>
    <p><strong>Ticket ID:</strong> ${ticketId}</p>
    <p>Please show this QR code at entry:</p>
    <img src="cid:event-qrcode" width="200" />
  `,
      attachments: [
        {
          filename: "qrcode.png",
          content: qrCodeBuffer,
          cid: "event-qrcode", // must match HTML
        },
      ],
    });

    res.status(201).json({
      message: "Registered successfully",
      registration,
      ticketId,
    });

  } catch (error) {
    res.status(500).json({
      message: "Registration failed",
      error: error.message,
    });
  }
};

// Purchase Merchandise (with payment approval workflow)
exports.purchaseMerchandise = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { size, color, quantity } = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.eventType !== "MERCHANDISE") {
      return res.status(400).json({ message: "This is not a merchandise event" });
    }

    if (event.status !== "PUBLISHED") {
      return res.status(400).json({ message: "Merchandise is not available for purchase" });
    }

    // Check deadline
    if (new Date() > new Date(event.registrationDeadline)) {
      return res.status(400).json({ message: "Purchase deadline has passed" });
    }

    // Payment proof is required
    if (!req.file) {
      return res.status(400).json({ message: "Payment proof image is required" });
    }

    const participant = await ParticipantProfile.findOne({
      userId: req.user.userId,
    }).populate("userId");

    if (!participant) {
      return res.status(403).json({ message: "Participant profile not found" });
    }

    // Check eligibility
    if (event.eligibility !== "ALL" && event.eligibility !== participant.participantType) {
      return res.status(403).json({
        message: `This merchandise is only for ${event.eligibility} participants`,
      });
    }

    // Check purchase limit per participant
    const existingPurchases = await Registration.find({
      eventId,
      participantId: participant._id,
      status: { $nin: ["CANCELLED", "REJECTED"] },
    });

    const totalPurchased = existingPurchases.reduce(
      (sum, reg) => sum + (reg.merchandisePurchase?.quantity || 0),
      0
    );

    if (totalPurchased + parseInt(quantity) > event.merchandiseDetails.purchaseLimitPerParticipant) {
      return res.status(400).json({
        message: `Purchase limit is ${event.merchandiseDetails.purchaseLimitPerParticipant} items per participant`,
      });
    }

    // Check stock for the selected variant
    const variant = event.merchandiseDetails.variants.find(
      (v) => v.size === size && v.color === color
    );

    if (!variant) {
      return res.status(400).json({ message: "Selected variant not available" });
    }

    if (variant.stock < parseInt(quantity)) {
      return res.status(400).json({
        message: `Only ${variant.stock} items left in stock for this variant`,
      });
    }

    // Calculate total amount
    const totalAmount = event.merchandiseDetails.price * parseInt(quantity);

    // Save payment proof path
    const paymentProofPath = `/uploads/payments/${req.file.filename}`;

    // Create registration with PENDING_APPROVAL status
    // NO QR code generated, NO stock decremented yet
    const registration = await Registration.create({
      eventId,
      participantId: participant._id,
      status: "PENDING_APPROVAL",
      paymentProof: paymentProofPath,
      paymentStatus: "PENDING",
      merchandisePurchase: {
        size,
        color,
        quantity: parseInt(quantity),
        totalAmount,
      },
    });

    res.status(201).json({
      message: "Order placed successfully. Pending organizer approval.",
      registration,
      totalAmount,
    });
  } catch (error) {
    res.status(500).json({
      message: "Purchase failed",
      error: error.message,
    });
  }
};

// Get merchandise orders for an event (organizer)
exports.getMerchOrders = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.query;

    const query = { eventId };
    if (status && status !== "ALL") {
      query.paymentStatus = status;
    } else {
      // Only show merchandise orders (those with paymentStatus set)
      query.paymentStatus = { $exists: true };
    }

    const orders = await Registration.find(query)
      .populate({
        path: "participantId",
        populate: { path: "userId", select: "email" },
      })
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch orders", error: error.message });
  }
};

// Approve merchandise payment (organizer)
exports.approveMerchPayment = async (req, res) => {
  try {
    const { eventId, orderId } = req.params;

    const registration = await Registration.findById(orderId).populate({
      path: "participantId",
      populate: { path: "userId", select: "email" },
    });

    if (!registration) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (registration.eventId.toString() !== eventId) {
      return res.status(400).json({ message: "Order does not belong to this event" });
    }

    if (registration.paymentStatus !== "PENDING") {
      return res.status(400).json({ message: "Order is not in pending status" });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { size, color, quantity } = registration.merchandisePurchase;

    // Verify stock is still available
    const variant = event.merchandiseDetails.variants.find(
      (v) => v.size === size && v.color === color
    );

    if (!variant || variant.stock < quantity) {
      return res.status(400).json({ message: "Insufficient stock for this variant" });
    }

    // Generate ticket + QR
    const ticketId = uuidv4();
    const qrData = JSON.stringify({
      eventName: event.eventName,
      eventId: event._id,
      ticketId: ticketId,
      participant: registration.participantId.userId.email,
    });

    const qrCodeBuffer = await QRCode.toBuffer(qrData);
    const qrCodeImage = await QRCode.toDataURL(qrData);

    // Update registration
    registration.status = "APPROVED";
    registration.paymentStatus = "APPROVED";
    registration.paymentReviewedAt = new Date();
    registration.ticketId = ticketId;
    registration.qrCode = qrCodeImage;
    await registration.save();

    // Decrement stock
    await Event.updateOne(
      {
        _id: eventId,
        "merchandiseDetails.variants.size": size,
        "merchandiseDetails.variants.color": color,
      },
      {
        $inc: {
          "merchandiseDetails.variants.$.stock": -quantity,
          "merchandiseDetails.totalStock": -quantity,
        },
      }
    );

    // Send confirmation email
    try {
      await sendEmail({
        to: registration.participantId.userId.email,
        subject: "Merchandise Purchase Approved!",
        html: `
          <h2>Payment Approved!</h2>
          <p><strong>Item:</strong> ${event.merchandiseDetails.itemName}</p>
          <p><strong>Ticket ID:</strong> ${ticketId}</p>
          <p><strong>Total Paid:</strong> ₹${registration.merchandisePurchase.totalAmount}</p>
          <p>Show this QR code for pickup:</p>
          <img src="cid:merch-qrcode" width="200" />
        `,
        attachments: [
          {
            filename: "qrcode.png",
            content: qrCodeBuffer,
            cid: "merch-qrcode",
          },
        ],
      });
    } catch (emailErr) {
      console.error("Email failed but order approved:", emailErr);
    }

    res.json({ message: "Payment approved, ticket generated", registration });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve payment", error: error.message });
  }
};

// Reject merchandise payment (organizer)
exports.rejectMerchPayment = async (req, res) => {
  try {
    const { eventId, orderId } = req.params;

    const registration = await Registration.findById(orderId);

    if (!registration) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (registration.eventId.toString() !== eventId) {
      return res.status(400).json({ message: "Order does not belong to this event" });
    }

    if (registration.paymentStatus !== "PENDING") {
      return res.status(400).json({ message: "Order is not in pending status" });
    }

    registration.status = "REJECTED";
    registration.paymentStatus = "REJECTED";
    registration.paymentReviewedAt = new Date();
    await registration.save();

    res.json({ message: "Payment rejected", registration });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject payment", error: error.message });
  }
};


exports.getMyRegistrations = async (req, res) => {
  try {
    const participant = await ParticipantProfile.findOne({
      userId: req.user.userId,
    });

    if (!participant) {
      return res
        .status(403)
        .json({ message: "Only participants can view registrations" });
    }

    let registrations = await Registration.find({
      participantId: participant._id,
    }).populate({
      path: "eventId",
      populate: { path: "organizerId", select: "organizerName" }
    });

    const now = new Date();
    registrations = registrations.map(reg => {
      const regObj = reg.toObject ? reg.toObject() : reg;
      if (regObj.eventId && regObj.eventId.status === "PUBLISHED") {
        if (now > new Date(regObj.eventId.eventEndDate)) {
          regObj.eventId.status = "COMPLETED";
        } else if (now >= new Date(regObj.eventId.eventStartDate) && now <= new Date(regObj.eventId.eventEndDate)) {
          regObj.eventId.status = "ONGOING";
        }
      }
      return regObj;
    });

    res.json(registrations);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch registrations",
      error: error.message,
    });
  }
};

exports.getEventRegistrations = async (req, res) => {
  try {
    const { eventId } = req.params;

    // Find organizer profile
    const organizer = await OrganizerProfile.findOne({
      userId: req.user.userId,
    });

    if (!organizer) {
      return res.status(403).json({ message: "Only organizers allowed" });
    }

    // Find event
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check ownership
    if (event.organizerId.toString() !== organizer._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Fetch registrations
    const registrations = await Registration.find({ eventId })
      .populate("participantId", "firstName lastName email");

    res.json({
      eventName: event.eventName,
      totalRegistrations: registrations.length,
      registrations,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch registrations",
      error: error.message,
    });
  }
};

exports.getOrganizerDashboard = async (req, res) => {
  try {
    // Find organizer profile
    const organizer = await OrganizerProfile.findOne({
      userId: req.user.userId,
    });

    if (!organizer) {
      return res.status(403).json({ message: "Only organizers allowed" });
    }

    // Fetch all events by organizer
    const events = await Event.find({ organizerId: organizer._id });

    let totalRegistrations = 0;
    let totalRevenue = 0;

    // Build detailed stats for each event
    const dashboardData = await Promise.all(
      events.map(async (event) => {
        const registrations = await Registration.find({
          eventId: event._id,
        });

        const count = registrations.length;
        totalRegistrations += count;

        // Revenue calculation
        let revenue = 0;

        if (event.eventType === "NORMAL") {
          revenue = count * (event.registrationFee || 0);
        } else {
          registrations.forEach((r) => {
            revenue += r.merchandisePurchase?.totalAmount || 0;
          });
        }

        totalRevenue += revenue;

        return {
          eventId: event._id,
          eventName: event.eventName,
          eventType: event.eventType,
          status: event.status,
          registrationCount: count,
          revenue,
        };
      })
    );

    // Send summary + event details
    res.json({
      summary: {
        totalEvents: events.length,
        totalRegistrations,
        totalRevenue,
      },
      events: dashboardData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch organizer dashboard",
      error: error.message,
    });
  }
};

exports.cancelRegistration = async (req, res) => {
  try {
    const { eventId } = req.params;

    const participant = await ParticipantProfile.findOne({
      userId: req.user.userId,
    });

    if (!participant) {
      return res.status(403).json({ message: "Only participants can cancel" });
    }

    const registration = await Registration.findOneAndDelete({
      eventId,
      participantId: participant._id,
    });

    if (!registration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    res.json({ message: "Registration cancelled successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Failed to cancel registration",
      error: error.message,
    });
  }
};


exports.publishEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Ensuring event is in DRAFT state
    if (event.status !== "DRAFT") {
      return res
        .status(400)
        .json({ message: "Only draft events can be published" });
    }

    // Ensuring organizer owns this event
    const organizer = await OrganizerProfile.findOne({
      userId: req.user.userId,
    });

    if (!organizer || event.organizerId.toString() !== organizer._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    event.status = "PUBLISHED";
    await event.save();

    // Notify via Discord
    if (organizer.discordWebhook) {
      const { sendToDiscord } = require("../utils/discord");
      sendToDiscord(organizer.discordWebhook, event);
    }

    res.json({
      message: "Event published successfully",
      event,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to publish event",
      error: error.message,
    });
  }
};

exports.getPublishedEvents = async (req, res) => {
  try {
    const { search, type, eligibility, startDate, endDate } = req.query;

    // Exclude events from disabled organizers
    const User = require("../models/User");
    const disabledUsers = await User.find({ role: "organizer", isDisabled: true }, "_id");
    const disabledUserIds = disabledUsers.map(u => u._id);
    const disabledOrgProfiles = disabledUserIds.length > 0
      ? await OrganizerProfile.find({ userId: { $in: disabledUserIds } }, "_id").lean()
      : [];
    const disabledOrgIds = disabledOrgProfiles.map(p => p._id);

    let query = { status: "PUBLISHED" };
    if (disabledOrgIds.length > 0) {
      query.organizerId = { $nin: disabledOrgIds };
    }

    /* ---------- Search (Event Name) ---------- */
    // Instead of filtering by regex here, we will fetch the data and use Fuse.js below.

    /* ---------- Filters ---------- */
    if (type) {
      query.eventType = type;
    }

    if (eligibility) {
      query.eligibility = eligibility;
    }

    if (startDate && endDate) {
      query.eventStartDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    let events = await Event.find(query)
      .populate("organizerId", "organizerName category")
      .sort({ createdAt: -1 });

    /* ---------- Fuzzy Search with Fuse.js ---------- */
    if (search) {
      const Fuse = require("fuse.js");
      const fuse = new Fuse(events, {
        keys: ["eventName", "organizerId.organizerName", "tags"],
        includeScore: true,
        threshold: 0.4, // Lower threshold = stricter match
      });

      const results = fuse.search(search);
      // Map back to just the event objects
      events = results.map(result => result.item);
    }

    /* ---------- Dynamic Status Update ---------- */
    const now = new Date();
    events = events.map(e => {
      const eventObj = e.toObject ? e.toObject() : e;
      if (eventObj.status === "PUBLISHED") {
        if (now > new Date(eventObj.eventEndDate)) {
          eventObj.status = "COMPLETED";
        } else if (now >= new Date(eventObj.eventStartDate) && now <= new Date(eventObj.eventEndDate)) {
          eventObj.status = "ONGOING";
        }
      }
      return eventObj;
    });

    // ---- Preference-based ordering for participants ----
    if (req.user && req.user.role === "participant") {
      try {
        const profile = await ParticipantProfile.findOne({ userId: req.user.userId });
        if (profile && (profile.interests.length > 0 || profile.followedOrganizers.length > 0)) {
          const followedIds = profile.followedOrganizers.map(id => id.toString());
          const interests = profile.interests.map(i => i.toLowerCase());

          const scored = events.map(event => {
            let score = 0;
            const e = event.toObject ? event.toObject() : event;

            // +10 if organizer is followed
            if (e.organizerId && followedIds.includes(e.organizerId._id?.toString())) {
              score += 10;
            }

            // +5 for each matching interest in event tags
            if (e.tags && e.tags.length > 0) {
              const matchingTags = e.tags.filter(t => interests.includes(t.toLowerCase()));
              score += matchingTags.length * 5;
            }

            // +5 if organizer category matches an interest
            if (e.organizerId?.category && interests.includes(e.organizerId.category.toLowerCase())) {
              score += 5;
            }

            return { event, score };
          });

          scored.sort((a, b) => b.score - a.score || new Date(b.event.createdAt) - new Date(a.event.createdAt));
          return res.json(scored.map(s => s.event));
        }
      } catch (prefErr) {
        // If preference scoring fails, fall through to default order
        console.error("Preference scoring error:", prefErr.message);
      }
    }

    res.json(events);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch events" });
  }
};

exports.getTrendingEvents = async (req, res) => {
  try {
    const { type } = req.query;
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    );

    const filter = {
      createdAt: { $gte: twentyFourHoursAgo },
      status: "PUBLISHED",
    };

    if (type) {
      filter.eventType = type;
    }

    const trending = await Event.find(filter)
      .populate("organizerId", "organizerName")
      .sort({ registrationsCount: -1 })
      .limit(5);

    res.json(trending);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch trending events" });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate("organizerId", "organizerName");

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Include real-time registration count so participants can see if full
    const registrationsCount = await Registration.countDocuments({ eventId: event._id });

    res.json({ ...event.toObject(), registrationsCount });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch event details" });
  }
};

exports.getTicketById = async (req, res) => {
  try {
    const ticket = await Registration.findOne({
      ticketId: req.params.ticketId,
    })
      .populate("eventId")
      .populate({
        path: "participantId",
        populate: {
          path: "userId",
          select: "email",
        },
      });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json(ticket);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch ticket",
      error: error.message,
    });
  }
};

exports.getEventAnalytics = async (req, res) => {
  try {
    const { eventId } = req.params;

    // 1️⃣ Find event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // 2️⃣ Get registrations
    const registrations = await Registration.find({ eventId })
      .populate("participantId", "firstName lastName email contactNumber");

    const totalRegistrations = registrations.length;

    // 3️⃣ Calculate revenue
    let totalRevenue = 0;

    if (event.eventType === "NORMAL") {
      totalRevenue = totalRegistrations * (event.registrationFee || 0);
    } else {
      registrations.forEach((r) => {
        totalRevenue += r.merchandisePurchase?.totalAmount || 0;
      });
    }

    res.json({
      event,
      totalRegistrations,
      totalRevenue,
      participants: registrations,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch analytics",
      error: error.message,
    });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const updates = req.body;

    if (updates.registrationLimit !== undefined && updates.registrationLimit < 0) {
      return res.status(400).json({ message: "Registration limit cannot be negative" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const start = updates.eventStartDate || event.eventStartDate;
    const end = updates.eventEndDate || event.eventEndDate;
    const deadline = updates.registrationDeadline || event.registrationDeadline;

    if (new Date(start) > new Date(end)) {
      return res.status(400).json({
        message: "Event start date cannot be after end date",
      });
    }

    if (new Date(deadline) >= new Date(start)) {
      return res.status(400).json({
        message: "Registration deadline must be before event start date",
      });
    }

    // Check ownership
    const organizer = await OrganizerProfile.findOne({ userId: req.user.userId });
    if (!organizer || event.organizerId.toString() !== organizer._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Lifecycle Logic
    if (updates.status && updates.status !== event.status) {
      const validTransitions = {
        "DRAFT": ["PUBLISHED"],
        "PUBLISHED": ["ONGOING", "CLOSED"],
        "ONGOING": ["COMPLETED"],
        "COMPLETED": [],
        "CLOSED": []
      };

      if (!validTransitions[event.status].includes(updates.status)) {
        return res.status(400).json({ message: `Invalid status transition from ${event.status} to ${updates.status}` });
      }
    }

    // Editing Rules
    if (event.status !== "DRAFT") {
      if (updates.status) event.status = updates.status;

      if (updates.description) event.description = updates.description;
      if (updates.registrationLimit && updates.registrationLimit > event.registrationLimit) {
        event.registrationLimit = updates.registrationLimit;
      }
      if (updates.registrationDeadline) event.registrationDeadline = updates.registrationDeadline;

      // Prevent customForm updates if registrations exist
      if (updates.customForm) {
        const regCount = await Registration.countDocuments({ eventId: eventId });
        if (regCount > 0) {
          return res.status(400).json({ message: "Cannot edit form after registrations have started" });
        }
        event.customForm = updates.customForm;
      }

    } else {
      Object.assign(event, updates);
    }

    await event.save();
    res.json({ message: "Event updated", event });
  } catch (err) {
    res.status(500).json({ message: "Failed to update event", error: err.message });
  }
};

exports.markAttendance = async (req, res) => {
  try {
    const { ticketId } = req.body;
    const registration = await Registration.findOne({ ticketId })
      .populate({
        path: "participantId",
        populate: { path: "userId", select: "email" },
      });

    if (!registration) return res.status(404).json({ message: "Invalid Ticket ID" });

    if (registration.status === "CANCELLED") {
      return res.status(400).json({ message: "Ticket is cancelled" });
    }

    // Duplicate scan rejection
    if (registration.attended) {
      return res.status(409).json({
        message: "Already scanned — attendance was already marked",
        attendedAt: registration.attendedAt,
        participant: {
          name: `${registration.participantId.firstName} ${registration.participantId.lastName}`,
          email: registration.participantId.userId?.email,
        },
        duplicate: true,
      });
    }

    registration.attended = true;
    registration.attendedAt = new Date();
    registration.status = "ATTENDED";
    registration.attendanceAuditLog.push({
      action: "MARK",
      reason: "QR/Ticket scan",
      performedBy: req.user.userId,
    });
    await registration.save();

    res.json({
      message: "Attendance marked successfully",
      attended: true,
      attendedAt: registration.attendedAt,
      participant: {
        name: `${registration.participantId.firstName} ${registration.participantId.lastName}`,
        email: registration.participantId.userId?.email,
      },
      ticketId: registration.ticketId,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark attendance", error: err.message });
  }
};

// Scan QR code for attendance (parses QR JSON payload)
exports.scanQRAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { qrData } = req.body;

    // Parse QR data
    let parsed;
    try {
      parsed = JSON.parse(qrData);
    } catch (e) {
      return res.status(400).json({ message: "Invalid QR code data" });
    }

    const { ticketId, eventId: qrEventId } = parsed;

    if (!ticketId) {
      return res.status(400).json({ message: "QR code does not contain a ticket ID" });
    }

    // Validate event match
    if (qrEventId && qrEventId !== eventId) {
      return res.status(400).json({ message: "This ticket belongs to a different event" });
    }

    const registration = await Registration.findOne({ ticketId, eventId })
      .populate({
        path: "participantId",
        populate: { path: "userId", select: "email" },
      });

    if (!registration) {
      return res.status(404).json({ message: "Ticket not found for this event" });
    }

    if (registration.status === "CANCELLED" || registration.status === "REJECTED") {
      return res.status(400).json({ message: `Ticket status: ${registration.status}` });
    }

    // Duplicate scan rejection
    if (registration.attended) {
      return res.status(409).json({
        message: "Already scanned",
        attendedAt: registration.attendedAt,
        participant: {
          name: `${registration.participantId.firstName} ${registration.participantId.lastName}`,
          email: registration.participantId.userId?.email,
        },
        duplicate: true,
      });
    }

    registration.attended = true;
    registration.attendedAt = new Date();
    registration.status = "ATTENDED";
    registration.attendanceAuditLog.push({
      action: "MARK",
      reason: "QR scan",
      performedBy: req.user.userId,
    });
    await registration.save();

    res.json({
      message: "Attendance marked!",
      attended: true,
      attendedAt: registration.attendedAt,
      participant: {
        name: `${registration.participantId.firstName} ${registration.participantId.lastName}`,
        email: registration.participantId.userId?.email,
      },
      ticketId,
    });
  } catch (err) {
    res.status(500).json({ message: "Scan failed", error: err.message });
  }
};

// Manual override attendance (with audit logging)
exports.manualOverrideAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { registrationId, action, reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ message: "Reason is required for manual override" });
    }

    if (!["MARK", "UNMARK"].includes(action)) {
      return res.status(400).json({ message: "Action must be MARK or UNMARK" });
    }

    const registration = await Registration.findOne({ _id: registrationId, eventId })
      .populate({
        path: "participantId",
        populate: { path: "userId", select: "email" },
      });

    if (!registration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    if (action === "MARK") {
      registration.attended = true;
      registration.attendedAt = new Date();
      registration.status = "ATTENDED";
    } else {
      registration.attended = false;
      registration.attendedAt = null;
      registration.status = "REGISTERED";
    }

    registration.attendanceAuditLog.push({
      action: "OVERRIDE",
      reason: reason.trim(),
      performedBy: req.user.userId,
    });

    await registration.save();

    res.json({
      message: `Attendance ${action === "MARK" ? "marked" : "unmarked"} via manual override`,
      registration,
    });
  } catch (err) {
    res.status(500).json({ message: "Override failed", error: err.message });
  }
};

exports.exportParticipantsCSV = async (req, res) => {
  try {
    const { eventId } = req.params;

    const organizer = await OrganizerProfile.findOne({ userId: req.user.userId });
    if (!organizer) return res.status(403).json({ message: "Access denied" });

    const registrations = await Registration.find({ eventId })
      .populate({
        path: "participantId",
        populate: { path: "userId", select: "email" },
      });

    // Identify all unique custom form question labels from all registrations
    const uniqueCustomKeys = new Set();
    registrations.forEach((reg) => {
      if (reg.customResponses && reg.customResponses instanceof Map) {
        for (let key of reg.customResponses.keys()) {
          uniqueCustomKeys.add(key);
        }
      } else if (reg.customResponses) { // If it's a plain object
        Object.keys(reg.customResponses).forEach(key => uniqueCustomKeys.add(key));
      }
    });

    const customHeaders = Array.from(uniqueCustomKeys);

    // Base Headers
    const headers = ["Name", "Email", "Contact", "TicketID", "Status", "Attended", "AttendedAt", ...customHeaders];
    let csv = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

    registrations.forEach(reg => {
      const p = reg.participantId;
      const email = p.userId?.email || "";
      const attendedAt = reg.attendedAt ? new Date(reg.attendedAt).toISOString() : "";

      // Extract custom response values matching the headers
      const customValues = customHeaders.map(header => {
        let val = "";
        if (reg.customResponses instanceof Map) {
          val = reg.customResponses.get(header) || "";
        } else if (reg.customResponses) {
          val = reg.customResponses[header] || "";
        }
        return `"${String(val).replace(/"/g, '""')}"`;
      });

      const row = [
        `"${p.firstName} ${p.lastName}"`,
        `"${email}"`,
        `"${p.contactNumber || ""}"`,
        `"${reg.ticketId || ""}"`,
        `"${reg.status}"`,
        `"${reg.attended}"`,
        `"${attendedAt}"`,
        ...customValues
      ];
      csv += row.join(",") + "\n";
    });

    res.header("Content-Type", "text/csv");
    res.attachment(`participants-${eventId}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: "Failed to export CSV" });
  }
};

// Public organizer details (accessible to any authenticated user)
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
    res.status(500).json({ message: "Failed to fetch organizer details" });
  }
};