require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const User = require("./models/user");

const app = express();
app.use(cors());
app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL, pass: process.env.PASSWORD }
});

const OTP_STORE = {}; // Store OTPs temporarily
const emailTemplate = fs.readFileSync(path.join("OTP", "index.html"), "utf8");

// Send OTP
app.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const otp = Math.floor(100000 + Math.random() * 900000);
  OTP_STORE[email] = otp;
  const customizedTemplate = emailTemplate.replace("{{OTP}}", otp); // Replace {{OTP}} with actual OTP

  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: "Your OTP Code",
    html: customizedTemplate
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: "OTP sent" });
  } catch (error) {
    res.status(500).json({ error: "Error sending OTP" });
  }
});

// Verify OTP & Login
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

  if (OTP_STORE[email] != otp) return res.status(400).json({ error: "Invalid OTP" });

  let user = await User.findOne({ email });
  if (!user) user = await User.create({ email });

  const { _id, address = "" } = user;

  const token = jwt.sign({
    _id: user._id, email, address
  }, process.env.JWT_SECRET, { expiresIn: "30d" });

  delete OTP_STORE[email]; // Remove OTP after use
  res.json({ token });
});

// Middleware to check auth
const auth = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  });
};

app.patch("/update-address/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { address } = req.body;

    if (!address) return res.status(400).json({ error: "Address is required" });

    const user = await User.findByIdAndUpdate(id, { address }, { new: true });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Address updated successfully", address: user.address });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get multiple users' email and address by userIds
app.post("/users/details", async (req, res) => {
  try {
    const { userIds } = req.body; // Expecting an array of userIds

    // Fetch user details for all given userIds
    const users = await User.find({ _id: { $in: userIds } }).select("email address _id");

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});


// login get data from ecommmerce nasara
app.get("/user/:id", async (req, res) => {
  const { id } = req.params
  
  const currentUser = await User.findById(id)
  res.json(currentUser);
});


// All users
app.get("/users", async (req, res) => {
  const AllUsers = await User.find()
  res.json(AllUsers);
});

app.get("/keep-warm", async (req, res) => {
  res.json({message: 'server is active'})
});

app.listen(process.env.PORT || 5001, () => {
  console.log(`Server running on port ${process.env.PORT || 5001}`);
});
