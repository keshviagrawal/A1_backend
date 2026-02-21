const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");

const {
  createEvent,
  publishEvent,
  getPublishedEvents,
  registerForEvent,
  purchaseMerchandise,
  getMerchandiseStock,
  getMyRegistrations,
  getEventRegistrations,
  getOrganizerDashboard,
  cancelRegistration,
  getTrendingEvents,
  getEventById,
  getTicketById,
  getEventAnalytics,
  updateEvent,
  markAttendance,
  exportParticipantsCSV,
  getOrganizerPublicDetails,
  getMerchOrders,
  approveMerchPayment,
  rejectMerchPayment,
  scanQRAttendance,
  manualOverrideAttendance,
} = require("../controllers/eventController");

const {
  authenticate,
  organizerOnly,
} = require("../middleware/authMiddleware");

// --- 1. Specific / Static Routes (Risk-Free) ---
router.get("/trending", getTrendingEvents);
router.get("/tickets/:ticketId", getTicketById);

// --- 2. Organizer Specific Routes ---
router.post("/", authenticate, organizerOnly, createEvent);
router.patch("/:eventId/publish", authenticate, organizerOnly, publishEvent);
router.put("/:eventId/update", authenticate, organizerOnly, updateEvent); // New
router.get("/organizer/dashboard", authenticate, organizerOnly, getOrganizerDashboard);
router.get("/organizer/events/:eventId/analytics", authenticate, organizerOnly, getEventAnalytics);
router.get("/:eventId/registrations", authenticate, organizerOnly, getEventRegistrations);
router.get("/:eventId/csv", authenticate, organizerOnly, exportParticipantsCSV);
router.post("/attendance/mark", authenticate, organizerOnly, markAttendance);

// --- Attendance: QR Scan + Manual Override ---
router.post("/:eventId/attendance/scan", authenticate, organizerOnly, scanQRAttendance);
router.post("/:eventId/attendance/manual", authenticate, organizerOnly, manualOverrideAttendance);

// --- Merchandise Payment Approval Routes (organizer) ---
router.get("/:eventId/orders", authenticate, organizerOnly, getMerchOrders);
router.patch("/:eventId/orders/:orderId/approve", authenticate, organizerOnly, approveMerchPayment);
router.patch("/:eventId/orders/:orderId/reject", authenticate, organizerOnly, rejectMerchPayment);

// --- 3. Participant Action Routes ---
router.post("/:eventId/register", authenticate, registerForEvent);
router.post("/:eventId/purchase", authenticate, upload.single("paymentProof"), purchaseMerchandise);
router.delete("/:eventId/register", authenticate, cancelRegistration);
router.get("/my-registrations", authenticate, getMyRegistrations);

// --- 4. Public Organizer Details (any authenticated user) ---
router.get("/organizers/:organizerId", authenticate, getOrganizerPublicDetails);

// --- 5. Generic ID Routes (MUST BE LAST) ---
router.get("/", authenticate, getPublishedEvents); // /api/events/
router.get("/:id", getEventById); // /api/events/:id

module.exports = router;