const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

// convertion
const convertTweetDbToResponse = (obj) => {
  return {
    username: obj.username,
    tweet: obj.tweet,
    dateTime: obj.date_time,
  };
};
const convertTweetCountDbToResponse = (obj) => {
  return {
    tweet: obj.tweet,
    likes: obj.likes,
    replies: obj.replies,
    dateTime: obj.date_time,
  };
};
const sendReplies = (obj) => {
  return {
    replies: obj,
  };
};
const sendLikes = (obj) => {
  return {
    likes: obj,
  };
};
// verify token

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const verfyToken = jwt.verify(
      jwtToken,
      "my_secret_code",
      async (error, payLoad) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payLoad.username;
          next();
        }
      }
    );
  }
};

// registration
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const getUserQuery = `SELECT * FROM user WHERE username = "${username}"`;
  let dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const query = `INSERT INTO user (name,username,password,gender)
              VALUES ("${name}", "${username}", "${hashedPassword}", "${gender}")`;
      await db.run(query);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = "${username}"`;
  let dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch) {
      let payLoad = { username: username };
      let jwtToken = jwt.sign(payLoad, "my_secret_code");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// get tweets
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const query = `SELECT u.username, t.tweet, t.date_time FROM user u 
    JOIN tweet t ON u.user_id = t.user_id
    ORDER BY t.date_time DESC LIMIT 4`;
  const tweetsArray = await db.all(query);
  response.send(tweetsArray.map((each) => convertTweetDbToResponse(each)));
});

// get followin
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;

  let userIdQuery = `SELECT user_id FROM user WHERE username="${username}"`;
  const userIdDb = await db.get(userIdQuery);

  const query = `SELECT DISTINCT u.name
    FROM user u JOIN follower f ON u.user_id = f.following_user_id
    WHERE u.user_id = ${userIdDb.user_id}`;
  const tweetsArray = await db.all(query);
  response.send(tweetsArray);
});

// get follower
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;

  let userIdQueryy = `SELECT user_id FROM user WHERE username="${username}"`;
  const userIdDb = await db.get(userIdQueryy);

  const query = `SELECT DISTINCT u.name
    FROM user u JOIN follower f ON u.user_id = f.follower_user_id
    WHERE u.user_id = ${userIdDb.user_id}`;
  const tweetsArray = await db.all(query);
  response.send(tweetsArray);
});

// get tweet detail user following
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  let userIdQuery = `SELECT user_id FROM user WHERE username="${username}"`;
  const userIdDb = await db.get(userIdQuery);
  let followingQuery = `SELECT u.user_id FROM user u
     JOIN tweet t ON u.user_id = t.user_id
     WHERE t.tweet_id = ${tweetId}`;
  const followingOrNotDb = await db.get(followingQuery);
  if (userIdDb.user_id !== followingOrNotDb.user_id) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const query = `SELECT t.tweet, COUNT(l.like_id) likes, COUNT(r.reply_id) replies, t.date_time
        FROM user u 
        JOIN tweet t ON u.user_id = t.user_id
        JOIN like l ON t.tweet_id = l.tweet_id
        JOIN reply r ON t.tweet_id = r.tweet_id
        WHERE t.tweet_id = ${tweetId}`;
    const tweetsArray = await db.get(query);
    response.send(convertTweetCountDbToResponse(tweetsArray));
  }
});

// get liked usernames
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    let userIdQuery = `SELECT user_id FROM user WHERE username="${username}"`;
    const userIdDb = await db.get(userIdQuery);
    let followingQuery = `SELECT u.user_id FROM user u
     JOIN tweet t ON u.user_id = t.user_id
     WHERE t.tweet_id = ${tweetId}`;
    const followingOrNotDb = await db.get(followingQuery);
    if (userIdDb.user_id !== followingOrNotDb.user_id) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const query = `SELECT u.name
        FROM user u 
        JOIN tweet t ON u.user_id = t.user_id
        JOIN like l ON t.tweet_id = l.tweet_id
        WHERE t.tweet_id = ${tweetId} `;
      const tweetsArray = await db.all(query);
      response.send(sendLikes(tweetsArray));
    }
  }
);

// get replied username
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    let userIdQuery = `SELECT user_id FROM user WHERE username="${username}"`;
    const userIdDb = await db.get(userIdQuery);
    let followingQuery = `SELECT u.user_id FROM user u
     JOIN tweet t ON u.user_id = t.user_id
     WHERE t.tweet_id = ${tweetId}`;
    const followingOrNotDb = await db.get(followingQuery);
    if (userIdDb.user_id !== followingOrNotDb.user_id) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const query = `SELECT u.name, r.reply
        FROM user u JOIN reply r ON u.user_id = r.user_id
        WHERE r.tweet_id = ${tweetId} `;
      const tweetsArray = await db.all(query);
      response.send(sendReplies(tweetsArray));
    }
  }
);

// get tweet details of user

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  let userIdQuery = `SELECT user_id FROM user WHERE username="${username}"`;
  const userIdDb = await db.get(userIdQuery);
  const query = `SELECT t.tweet, COUNT(l.like_id) likes, COUNT(r.reply_id) replies, t.date_time
    FROM user u JOIN tweet t ON u.user_id = t.user_id
    JOIN like l ON t.tweet_id = l.tweet_id 
    JOIN reply r ON t.tweet_id = r.tweet_id
    WHERE u.user_id = ${userIdDb.user_id}
    GROUP BY t.tweet_id`;
  const tweetsArray = await db.all(query);
  response.send(tweetsArray.map((each) => convertTweetCountDbToResponse(each)));
});

// post tweet
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;

  let userIdquery = `SELECT user_id FROM user WHERE username="${username}"`;
  const userIdDb = await db.get(userIdquery);
  let t = new Date();
  const todayFormat = `${t.getFullYear()}-${
    t.getMonth() + 1
  }-${t.getDate()} ${t.getHours()}:${t.getMinutes()}:${t.getSeconds()}`;
  const query = `INSERT INTO tweet(tweet, user_id, date_time)
  VALUES ("${tweet}", ${userIdDb.user_id}, "${todayFormat}")
  `;
  await db.run(query);
  response.send("Created a Tweet");
});

// delete
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    let userIdQuery = `SELECT user_id FROM user WHERE username="${username}"`;
    const userIdDb = await db.get(userIdQuery);
    let requestUserQuery = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId}`;
    const requestUserIdDb = await db.get(requestUserQuery);

    if (userIdDb.user_id !== requestUserIdDb.user_id) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const query = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
      const res = await db.run(query);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
