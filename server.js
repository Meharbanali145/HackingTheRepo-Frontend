import express from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const app = express();
app.use(express.json());

const dataFile = path.resolve("auth-data.json");
const port = Number(process.env.PORT) || 5000;
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const githubScope =
  process.env.GITHUB_OAUTH_SCOPE || "repo read:user user:email";

const defaultData = {
  users: [
    {
      id: "demo-user",
      username: "Demo User",
      email: "demo@repomind.dev",
      password: "demo1234",
      githubUsername: "",
      githubToken: "",
      openaiKey: "",
      totalJobs: 0,
      successfulPRs: 0,
    },
  ],
  sessions: {},
};

const loadData = async () => {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    await fs.writeFile(dataFile, JSON.stringify(defaultData, null, 2), "utf8");
    return JSON.parse(JSON.stringify(defaultData));
  }
};

const saveData = async (data) => {
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2), "utf8");
};

const data = await loadData();

const normalizeUser = (user) => {
  const { password: _password, ...safeUser } = user;
  void _password;
  return safeUser;
};

const createToken = () => crypto.randomBytes(24).toString("hex");

const getUserSettings = (user) => ({
  githubUsername: user.githubUsername || "",
  githubToken: user.githubToken || "",
  openaiKey: user.openaiKey || "",
  hasGithubToken: Boolean(user.githubToken),
  hasOpenaiKey: Boolean(user.openaiKey),
});

const findUserByEmail = (email) =>
  data.users.find((user) => user.email.toLowerCase() === email.toLowerCase());

const findUserByGithubUsername = (githubUsername) =>
  data.users.find(
    (user) =>
      user.githubUsername?.toLowerCase() === githubUsername?.toLowerCase(),
  );

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    return res.status(401).json({ message: "Missing authorization token" });
  }

  const session = data.sessions[token];
  if (!session) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const user = data.users.find((item) => item.id === session.userId);
  if (!user) {
    return res.status(401).json({ message: "User session not found" });
  }

  req.user = user;
  req.sessionToken = token;
  next();
};

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const token = createToken();
  data.sessions[token] = {
    userId: user.id,
    createdAt: new Date().toISOString(),
  };
  await saveData(data);

  return res.json({
    token,
    user: normalizeUser(user),
    githubUsername: user.githubUsername || undefined,
    githubToken: user.githubToken || undefined,
  });
});

app.post("/auth/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ message: "Username, email, and password are required" });
  }

  if (findUserByEmail(email)) {
    return res
      .status(409)
      .json({ message: "An account with that email already exists" });
  }

  const id = `user-${crypto.randomBytes(8).toString("hex")}`;
  const user = {
    id,
    username,
    email,
    password,
    githubUsername: "",
    githubToken: "",
    openaiKey: "",
    totalJobs: 0,
    successfulPRs: 0,
  };
  data.users.push(user);

  const token = createToken();
  data.sessions[token] = { userId: id, createdAt: new Date().toISOString() };
  await saveData(data);

  return res.json({
    token,
    user: normalizeUser(user),
    githubUsername: undefined,
    githubToken: undefined,
  });
});

app.get("/auth/me", authMiddleware, (req, res) => {
  return res.json(normalizeUser(req.user));
});

app.get("/settings", authMiddleware, (req, res) => {
  return res.json(getUserSettings(req.user));
});

app.put("/settings", authMiddleware, async (req, res) => {
  const { githubUsername, githubToken, openaiKey } = req.body;

  if (githubUsername !== undefined) {
    req.user.githubUsername = String(githubUsername || "");
  }

  if (githubToken !== undefined) {
    req.user.githubToken = String(githubToken || "");
  }

  if (openaiKey !== undefined) {
    req.user.openaiKey = String(openaiKey || "");
  }

  await saveData(data);
  return res.json(getUserSettings(req.user));
});

app.get("/auth/github", (req, res) => {
  if (!githubClientId || !githubClientSecret) {
    return res
      .status(500)
      .send(
        "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      );
  }

  const redirectUri = String(req.query.redirect_uri || "");
  const state = String(req.query.state || "");
  if (!redirectUri || !state) {
    return res.status(400).send("redirect_uri and state are required");
  }

  const params = new URLSearchParams({
    client_id: githubClientId,
    redirect_uri: redirectUri,
    scope: githubScope,
    state,
    allow_signup: "true",
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

app.post("/auth/github/callback", async (req, res) => {
  if (!githubClientId || !githubClientSecret) {
    return res.status(500).json({ message: "GitHub OAuth is not configured." });
  }

  const { code, redirectUri } = req.body;
  if (!code || !redirectUri) {
    return res
      .status(400)
      .json({ message: "code and redirectUri are required" });
  }

  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: githubClientId,
        client_secret: githubClientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    },
  );

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    return res.status(400).json({
      message:
        tokenData.error_description ||
        tokenData.error ||
        "Failed to exchange GitHub code",
    });
  }

  const accessToken = tokenData.access_token;
  const githubResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "RepoMind-Frontend",
    },
  });

  if (!githubResponse.ok) {
    return res
      .status(502)
      .json({ message: "Failed to fetch GitHub user profile" });
  }

  const githubProfile = await githubResponse.json();
  let email = githubProfile.email;
  if (!email) {
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "RepoMind-Frontend",
      },
    });

    if (emailsResponse.ok) {
      const emails = await emailsResponse.json();
      const primary = emails.find(
        (item) => item.primary && item.verified && item.email,
      );
      email = primary?.email || emails.find((item) => item.verified)?.email;
    }
  }

  const githubUsername = githubProfile.login;
  const normalizedEmail = email || `${githubUsername}@users.noreply.github.com`;

  let user =
    findUserByGithubUsername(githubUsername) ||
    findUserByEmail(normalizedEmail);
  if (!user) {
    const id = `user-${crypto.randomBytes(8).toString("hex")}`;
    user = {
      id,
      username: githubUsername,
      email: normalizedEmail,
      password: "",
      githubUsername,
      githubToken: accessToken,
      openaiKey: "",
      totalJobs: 0,
      successfulPRs: 0,
    };
    data.users.push(user);
  } else {
    user.githubUsername = githubUsername;
    user.githubToken = accessToken;
    user.email = normalizedEmail;
  }

  const token = createToken();
  data.sessions[token] = {
    userId: user.id,
    createdAt: new Date().toISOString(),
  };
  await saveData(data);

  return res.json({
    token,
    user: normalizeUser(user),
    githubUsername,
    githubToken: accessToken,
  });
});

app.get("/health", (_req, res) => {
  res.send("ok");
});

app.listen(port, () => {
  console.log(`Auth server listening on http://localhost:${port}`);
  console.log(
    "Use GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable GitHub OAuth.",
  );
});
