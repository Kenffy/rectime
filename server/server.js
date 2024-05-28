const express = require("express");
const bodyParser = require("body-parser");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const dotenv = require("dotenv");

const app = express();
dotenv.config();

const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.SECRET_KEY;

app.use(bodyParser.json());
app.use(cors());

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// User Routes
app.post("/register", async (req, res) => {
  const { username, email, password, profileImg, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { username, email, password: hashedPassword, profileImg, role },
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && (await bcrypt.compare(password, user.password))) {
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      SECRET_KEY,
      { expiresIn: "1h" }
    );
    res.json({ token });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

// Time Routes
app.post("/times", authenticateToken, async (req, res) => {
  const {
    startTime,
    endTime,
    pause,
    date,
    regularTime,
    overTime,
    flexTime,
    isVaccation,
  } = req.body;
  try {
    const time = await prisma.time.create({
      data: {
        startTime,
        endTime,
        pause,
        date,
        regularTime,
        overTime,
        flexTime,
        isVaccation,
        userId: req.user.id,
      },
    });
    res.status(201).json(time);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/times", authenticateToken, async (req, res) => {
  const { start, end } = req.query;
  try {
    const times = await prisma.time.findMany({
      where: {
        userId: req.user.id,
        date: {
          gte: new Date(start),
          lt: new Date(end),
        },
      },
    });
    res.json(times);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/times/start", authenticateToken, async (req, res) => {
  try {
    const timeEntry = await prisma.time.create({
      data: {
        startTime: new Date(),
        userId: req.user.id,
        isVaccation: false,
      },
    });
    res.status(201).json(timeEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/times/stop", authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    const timeEntry = await prisma.time.update({
      where: { id },
      data: {
        endTime: new Date(),
      },
    });
    res.status(200).json(timeEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/times/report", authenticateToken, async (req, res) => {
  const { start, end } = req.query;
  const userId = req.user.id;

  try {
    const times = await prisma.time.findMany({
      where: {
        userId: userId,
        date: {
          gte: new Date(start),
          lte: new Date(end),
        },
      },
    });

    const report = times.reduce(
      (acc, time) => {
        const startTime = new Date(`${time.date}T${time.startTime}`);
        const endTime = new Date(`${time.date}T${time.endTime}`);
        const duration =
          (endTime - startTime) / 1000 / 60 / 60 - time.pause / 60;
        acc.totalHours += duration;
        acc.regularHours += time.regularTime;
        acc.overTime += time.overTime;
        acc.flexTime += time.flexTime;
        return acc;
      },
      { totalHours: 0, regularHours: 0, overTime: 0, flexTime: 0 }
    );

    res.json(report);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
