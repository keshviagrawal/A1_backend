const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // contains userId + role
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

exports.participantOnly = (req, res, next) => {
  if (req.user.role !== "participant") {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

exports.organizerOnly = (req, res, next) => {
  if (req.user.role !== "organizer") {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

exports.adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

// Rejects requests from users whose accounts have been disabled since they last logged in.
// Must come after authenticate (which sets req.user).
exports.disabledCheck = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select("isDisabled");
    if (!user || user.isDisabled) {
      return res.status(403).json({ message: "Account is disabled. Contact admin." });
    }
    next();
  } catch (err) {
    return res.status(500).json({ message: "Auth check failed" });
  }
};


// It decides who is allowed to access which backend routes.