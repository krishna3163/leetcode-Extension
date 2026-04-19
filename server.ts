import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const LEETCODE_GQL_URL = "https://leetcode.com/graphql";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // LeetCode API Endpoints
  app.get("/api/leetcode/daily", async (req, res) => {
    try {
      const response = await axios.post(LEETCODE_GQL_URL, {
        query: `
          query questionOfToday {
            activeDailyCodingChallengeQuestion {
              date
              link
              question {
                difficulty
                title
                titleSlug
              }
            }
          }
        `,
      });
      res.json(response.data.data.activeDailyCodingChallengeQuestion);
    } catch (error) {
      console.error("LeetCode Daily API error:", error);
      res.status(500).json({ error: "Failed to fetch daily challenge" });
    }
  });

  app.get("/api/leetcode/user/:username", async (req, res) => {
    const { username } = req.params;
    try {
      const response = await axios.post(LEETCODE_GQL_URL, {
        query: `
          query userStats($username: String!) {
            matchedUser(username: $username) {
              profile {
                ranking
                userAvatar
                realName
              }
              submitStats {
                acSubmissionNum {
                  difficulty
                  count
                }
              }
            }
          }
        `,
        variables: { username },
      });
      res.json(response.data.data.matchedUser);
    } catch (error) {
      console.error("LeetCode User API error:", error);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  // API endpoint for sending email reminders
  app.post("/api/send-reminder", async (req, res) => {
    const { to, subject, message } = req.body;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ error: "Email credentials not configured." });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text: message,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Email error:", error);
      res.status(500).json({ error: "Failed to send email." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
