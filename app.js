const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
let dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

let initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3001, () => {
      console.log("Server Running at http://localhost:3001");
      console.log("Database Connected Successfully");
    });
  } catch (error) {
    console.log(console.error.message);
  }
};

initializeDbAndServer();

let convertStateObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

let convertDistrictObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeaders = req.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  }
};

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const selectUserQuery = `select * from user where username=?`;
  let dbUser = await db.get(selectUserQuery, username);
  if (dbUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (!isPasswordMatched) {
      res.status(400);
      res.send("Invalid password");
    } else {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "MY_SECRET_TOKEN");
      res.send({ jwtToken });
    }
  }
});

//Returns a list of all states in the state table

app.get("/states/", authenticateToken, async (req, res) => {
  const selectStateQuery = `select * from state`;
  let states = await db.all(selectStateQuery);
  res.send(states.map((each) => convertStateObject(each)));
});

//Returns a state based on the state ID

app.get("/states/:stateId/", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const selectStateQuery = `select * from state where state_id=?`;
  let state = await db.get(selectStateQuery, stateId);
  res.send(convertStateObject(state));
});

//Create a district in the district table, district_id is auto-incremented

app.post("/districts/", authenticateToken, async (req, res) => {
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const postQuery = `insert into district(district_name,state_id,cases,cured,active,deaths) values(?,?,?,?,?,?)`;
  const dbRes = await db.run(postQuery, [
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  ]);
  res.send("District Successfully Added");
  console.log(dbRes.lastID);
});

//Returns a district based on the district ID

app.get("/districts/:districtId", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const getDistrictQuery = `select * from district where district_id=?`;
  let district = await db.get(getDistrictQuery, districtId);
  res.send(convertDistrictObject(district));
});

//Deletes a district from the district table based on the district ID

app.delete("/districts/:districtId", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const deleteQuery = `delete from district where district_id=?`;
  await db.run(deleteQuery, districtId);
  res.send("District Removed");
});

//Updates the details of a specific district based on the district ID

app.put("/districts/:districtId", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const updateQuery = `update district set district_name=?,state_id=?,cases=?,cured=?,active=?,deaths=? where district_id=?`;
  await db.run(updateQuery, [
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
    districtId,
  ]);
  res.send("District Details Updated");
});

//Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID

app.get("/states/:stateId/stats/", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getStats = `select sum(district.cases) as totalCases,sum(district.cured) as totalCured,sum(district.active) as totalActive,sum(district.deaths) as totalDeaths from district natural join state where state_id=? group by state_id`;
  let stats = await db.get(getStats, stateId);
  res.send(stats);
});

module.exports = app;
