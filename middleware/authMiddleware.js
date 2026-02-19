const jwt = require("jsonwebtoken");

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


// It decides who is allowed to access which backend routes.