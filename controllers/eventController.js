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
    } = req.body;

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
      registrationLimit,
      registrationFee: eventType === "MERCHANDISE" ? merchandiseDetails.price : registrationFee,
      tags: tags || [],
      organizerId: organizer._id,
      status: "DRAFT",
      merchandiseDetails: eventType === "MERCHANDISE" ? merchandiseDetails : undefined,
    });

    res.status(201).json({ message: "Event created", event });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create event",
      error: error.message,
    });
  }
};

// Register for Normal Event
exports.registerForEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

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

    // Registration limit check
    const regCount = await Registration.countDocuments({ eventId });
    if (regCount >= event.registrationLimit) {
      return res.status(400).json({ message: "Registration limit reached" });
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

    // Save registration with QR
    const registration = await Registration.create({
      eventId,
      participantId: participant._id,
      status: "REGISTERED",
      ticketId,
      qrCode: qrCodeImage,
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

// Purchase Merchandise
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
    });

    const totalPurchased = existingPurchases.reduce(
      (sum, reg) => sum + (reg.merchandisePurchase?.quantity || 0),
      0
    );

    if (totalPurchased + quantity > event.merchandiseDetails.purchaseLimitPerParticipant) {
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

    if (variant.stock < quantity) {
      return res.status(400).json({
        message: `Only ${variant.stock} items left in stock for this variant`,
      });
    }

    // Calculate total amount
    const totalAmount = event.merchandiseDetails.price * quantity;

    // Generate unique ticket ID
    const ticketId = uuidv4();

    // Create QR data
    const qrData = JSON.stringify({
      eventName: event.eventName,
      eventId: event._id,
      ticketId: ticketId,
      participant: participant.userId.email,
    });

    // Generate QR buffer (for email attachment)
    const qrCodeBuffer = await QRCode.toBuffer(qrData);

    // Generate Base64 (for DB storage)
    const qrCodeImage = await QRCode.toDataURL(qrData);

    // Create registration/purchase
    const registration = await Registration.create({
      eventId,
      participantId: participant._id,
      status: "PURCHASED",
      ticketId,
      qrCode: qrCodeImage,  // 👈 ADD THIS
      merchandisePurchase: {
        size,
        color,
        quantity,
        totalAmount,
      },
    });

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

    await sendEmail({
      to: participant.userId.email,
      subject: "Merchandise Purchase Successful",
      html: `
      <h2>Purchase Confirmed!</h2>
      <p><strong>Item:</strong> ${event.merchandiseDetails.itemName}</p>
      <p><strong>Ticket ID:</strong> ${ticketId}</p>
      <p><strong>Total Paid:</strong> ₹${totalAmount}</p>
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

    res.status(201).json({
      message: "Purchase successful",
      registration,
      ticketId,
      totalAmount,
    });
  } catch (error) {
    res.status(500).json({
      message: "Purchase failed",
      error: error.message,
    });
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

    const registrations = await Registration.find({
      participantId: participant._id,
    }).populate("eventId");

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

    let query = { status: "PUBLISHED" };

    /* ---------- Search (Event + Organizer) ---------- */
    if (search) {
      query.$or = [
        { eventName: { $regex: search, $options: "i" } },
        { organizerName: { $regex: search, $options: "i" } },
      ];
    }

    /* ---------- Filters ---------- */
    if (type) {
      query.eventType = type;
    }

    if (eligibility) {
      query.eligibility = eligibility;
    }

    if (startDate && endDate) {
      query.eventDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const events = await Event.find(query).sort({ createdAt: -1 });

    res.json(events);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch events" });
  }
};

exports.getTrendingEvents = async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    );

    const trending = await Event.find({
      createdAt: { $gte: twentyFourHoursAgo },
      status: "PUBLISHED",
    })
      .sort({ registrationsCount: -1 })
      .limit(5);

    res.json(trending);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch trending events" });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.json(event);
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

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

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
        const regCount = await Registration.countDocuments({ eventId: req.params.id });
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
    const registration = await Registration.findOne({ ticketId });

    if (!registration) return res.status(404).json({ message: "Invalid Ticket ID" });

    if (registration.status === "CANCELLED") {
      return res.status(400).json({ message: "Ticket is cancelled" });
    }

    registration.attended = true;
    registration.status = "ATTENDED";
    await registration.save();

    res.json({ message: "Attendance marked successfully", attended: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark attendance", error: err.message });
  }
};

exports.exportParticipantsCSV = async (req, res) => {
  try {
    const { eventId } = req.params;

    // Ownership check (simplified)
    const organizer = await OrganizerProfile.findOne({ userId: req.user.userId });
    if (!organizer) return res.status(403).json({ message: "Access denied" });

    const registrations = await Registration.find({ eventId })
      .populate("participantId", "firstName lastName email contactNumber");

    let csv = "Name,Email,Contact,TicketID,Status,Attended\n";

    registrations.forEach(reg => {
      const p = reg.participantId;
      csv += `"${p.firstName} ${p.lastName}","${p.userId.email}","${p.contactNumber}","${reg.ticketId}","${reg.status}","${reg.attended}"\n`;
    });

    res.header("Content-Type", "text/csv");
    res.attachment(`participants-${eventId}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: "Failed to export CSV" });
  }
};