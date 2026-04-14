const crypto = require("crypto");

const MODEM_IP = "192.168.0.1";
const MODEM_PASS = process.env.MODEM_PASSWORD; // <-- NOW LOADED FROM .ENV
let stokCookie = "";
let isPolling = false;

// ZTE specific hashing: SHA256(Password) then SHA256(Hash + LD)
function generateZTEPassword(password, ld) {
  const hash1 = crypto
    .createHash("sha256")
    .update(password)
    .digest("hex")
    .toUpperCase();
  const hash2 = crypto
    .createHash("sha256")
    .update(hash1 + ld)
    .digest("hex")
    .toUpperCase();
  return hash2;
}

async function authenticateModem() {
  console.log("\n--- STARTING MODEM AUTHENTICATION ---");

  if (!MODEM_PASS) {
    console.error(
      "❌ Modem Auth Error: MODEM_PASSWORD is not set in your .env file.",
    );
    console.log("---------------------------------------\n");
    return false;
  }

  try {
    // 1. Fetch the LD (Challenge Salt)
    const ldUrl = `http://${MODEM_IP}/goform/goform_get_cmd_process?isTest=false&cmd=LD&_=${Date.now()}`;
    console.log(`[Modem] GET Request to: ${ldUrl}`);

    const ldRes = await fetch(ldUrl, {
      headers: {
        Referer: `http://${MODEM_IP}/index.html`,
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
    });

    const ldText = await ldRes.text();
    const ldData = JSON.parse(ldText);

    if (!ldData || !ldData.LD)
      throw new Error("Parsed JSON did not contain 'LD' property.");

    console.log(`[Modem] LD Challenge Received: ${ldData.LD}`);

    // 2. Generate the hashed password payload
    const hashedPassword = generateZTEPassword(MODEM_PASS, ldData.LD);
    const body = new URLSearchParams({
      isTest: "false",
      goformId: "LOGIN",
      password: hashedPassword,
    });

    console.log(`[Modem] POSTing Login Payload...`);

    // 3. Post the login request
    const loginRes = await fetch(
      `http://${MODEM_IP}/goform/goform_set_cmd_process`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Referer: `http://${MODEM_IP}/index.html`,
        },
        body: body.toString(),
      },
    );

    // 4. Extract the 'stok' cookie from headers
    const setCookie = loginRes.headers.get("set-cookie");

    if (setCookie) {
      const match = setCookie.match(/stok="([^"]+)"/);
      if (match) {
        stokCookie = match[0]; // Saves as stok="xxxx"
        console.log("✅ ZTE Modem Authenticated Successfully.");
        console.log("---------------------------------------\n");
        return true;
      }
    }
    throw new Error("Failed to extract stok cookie from headers.");
  } catch (error) {
    console.error("❌ Modem Auth Error:", error.message);
    console.log("---------------------------------------\n");
    return false;
  }
}

async function pollModem(io, state) {
  if (!stokCookie) {
    const success = await authenticateModem();
    if (!success) return;
  }

  try {
    const queryCmd = "battery_vol_percent,signalbar,battery_charging";
    const url = `http://${MODEM_IP}/goform/goform_get_cmd_process?multi_data=1&isTest=false&cmd=${queryCmd}&_=${Date.now()}`;

    const res = await fetch(url, {
      headers: {
        Cookie: stokCookie,
        Referer: `http://${MODEM_IP}/index.html`,
      },
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Failed to parse JSON. Raw body: ${text}`);
    }

    if (data.error || data.result === "failure") {
      stokCookie = "";
      return;
    }

    // Update global state
    const modemData = {
      battery: parseInt(data.battery_vol_percent, 10) || 0,
      charging: data.battery_charging === "1",
      signal: parseInt(data.signalbar, 10) || 0,
    };

    state.modem = modemData;
    io.emit("modem-update", modemData);
  } catch (error) {
    // Only log polling errors if we actually care (e.g. modem turned off)
    // console.error("❌ Modem Polling Error:", error.message);
    stokCookie = ""; // Reset token on hard fail
  }
}

function initModem(io, state) {
  state.modem = { battery: 0, charging: false, signal: 0 };

  if (!isPolling) {
    isPolling = true;
    setTimeout(() => pollModem(io, state), 1000);
    setInterval(() => pollModem(io, state), 5000);
  }
}

module.exports = { initModem };
