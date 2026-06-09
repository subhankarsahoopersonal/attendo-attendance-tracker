/**
 * parseTimetable.js — Netlify Serverless Function
 * 
 * Secure proxy for the Gemini Vision API.
 * - Verifies Firebase auth tokens (only logged-in users can call)
 * - Holds the GEMINI_API_KEY server-side (never exposed to the browser)
 * - Retries across proven Gemini models with smart backoff
 * - Robust JSON parsing with fallback regex extraction
 */

const admin = require("firebase-admin");
const fetch = require("node-fetch");

// ── Firebase Admin initialization ──────────────────────────────────
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString()
    );
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

// ── Constants ──────────────────────────────────────────────────────
// Models ordered by preference — newest first, each has separate quota pools
const GEMINI_MODELS = [
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
];

const MAX_RETRIES_PER_MODEL = 2;

const EXTRACTION_PROMPT =
    "Extract the class schedule from this timetable image. Return ONLY a valid JSON array of objects. " +
    "Do not include markdown formatting or backticks. " +
    "Schema: [{ 'day': 'monday', 'subject': 'Electronics Devices', 'startTime': '09:30', 'endTime': '10:30', 'room': 'KE-03-PP' }]. " +
    "CRITICAL RULES: " +
    "1) Each column in the timetable represents a 1-hour slot. If a subject spans multiple columns (e.g. 2 hours from 09:30 to 11:30), " +
    "you MUST output SEPARATE entries for each hour (e.g. one at 09:30-10:30 and another at 10:30-11:30) with the SAME subject name. " +
    "2) If a cell contains '/' between two subject names (e.g. 'JOB READINESS/ENGLISH'), use ONLY the first name before the '/' (e.g. 'JOB READINESS'). " +
    "3) If a cell contains '&' in the subject name (e.g. 'Differential Equation & Linear Algebra'), keep it as ONE subject — do NOT split it. " +
    "4) Extract the room number or location and format it cleanly. " +
    "5) Convert all times to 24-hour HH:MM format (e.g. 9.30AM -> 09:30, 1.30PM -> 13:30). " +
    "6) Ignore breaks, lunches, and empty slots.";

// ── Helper: sleep ──────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Helper: robust JSON extraction ─────────────────────────────────
function extractScheduleJSON(rawText) {
    // 1. Clean markdown fences
    let cleaned = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

    // 2. Try direct parse
    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
        // Sometimes the AI wraps in an object like { schedule: [...] }
        if (parsed && typeof parsed === "object") {
            const keys = Object.keys(parsed);
            for (const key of keys) {
                if (Array.isArray(parsed[key])) return parsed[key];
            }
        }
    } catch (e) {
        // Fall through to regex fallback
    }

    // 3. Regex fallback: find the outermost JSON array in the text
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        try {
            const parsed = JSON.parse(arrayMatch[0]);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            // Fall through
        }
    }

    throw new Error("Could not extract valid JSON array from AI response");
}

// ── Helper: validate schedule shape ────────────────────────────────
function validateSchedule(schedule) {
    if (!Array.isArray(schedule) || schedule.length === 0) {
        throw new Error("Schedule is empty or not an array");
    }

    // Check at least the first entry has required fields
    const requiredFields = ["day", "subject", "startTime"];
    const first = schedule[0];
    for (const field of requiredFields) {
        if (!first[field]) {
            throw new Error(`Schedule entry missing required field: ${field}`);
        }
    }

    return schedule;
}

// ── Helper: call Gemini API with retry & model fallback ────────────
async function callGeminiAPI(base64Image, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    const payload = {
        contents: [
            {
                parts: [
                    { text: EXTRACTION_PROMPT },
                    { inline_data: { mime_type: mimeType, data: base64Image } },
                ],
            },
        ],
    };

    let lastErrorMsg = "";

    for (const model of GEMINI_MODELS) {
        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
            try {
                console.log(`Trying ${model} (attempt ${attempt}/${MAX_RETRIES_PER_MODEL})...`);

                const response = await fetch(modelUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                if (response.ok) {
                    const data = await response.json();

                    // Guard against empty/blocked responses
                    if (
                        !data.candidates ||
                        !data.candidates[0] ||
                        !data.candidates[0].content ||
                        !data.candidates[0].content.parts ||
                        !data.candidates[0].content.parts[0].text
                    ) {
                        lastErrorMsg = "Gemini returned empty or blocked response";
                        console.warn(`${model} attempt ${attempt}: empty/blocked response`);
                        await sleep(1500);
                        continue;
                    }

                    const rawText = data.candidates[0].content.parts[0].text;
                    const schedule = extractScheduleJSON(rawText);
                    return validateSchedule(schedule);
                }

                const errBody = await response.text();
                console.warn(
                    `${model} attempt ${attempt} failed (${response.status}):`,
                    errBody.substring(0, 200)
                );
                lastErrorMsg = `HTTP ${response.status}: ${errBody.substring(0, 150)}`;

                if (response.status === 503 || response.status === 500) {
                    // Server overloaded — retry with backoff
                    await sleep(1500 * attempt);
                    continue;
                }
                if (response.status === 429) {
                    // Check if quota is fully exhausted (limit: 0) vs temporary rate limit
                    if (errBody.includes("limit: 0") || errBody.includes("exceeded your current quota")) {
                        console.warn(`${model}: quota exhausted, skipping to next model`);
                        break; // Skip to next model — retrying won't help
                    }
                    // Temporary rate limit — wait and retry
                    await sleep(2000 * attempt);
                    continue;
                }
                // Other errors (404, 400, 403) — skip to next model
                break;
            } catch (error) {
                console.warn(`${model} attempt ${attempt} error:`, error.message);
                lastErrorMsg = `Error: ${error.message}`;
                await sleep(1500);
            }
        }
    }

    throw new Error(`All models failed. ${lastErrorMsg}`);
}

// ── Main handler ───────────────────────────────────────────────────
exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    }

    try {
        // ── 1. Verify Firebase auth token ──────────────────────
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: "Missing or invalid Authorization header" }),
            };
        }

        const idToken = authHeader.split("Bearer ")[1];
        try {
            await admin.auth().verifyIdToken(idToken);
        } catch (authError) {
            console.error("Token verification failed:", authError.message);
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ error: "Invalid or expired authentication token" }),
            };
        }

        // ── 2. Parse request body ──────────────────────────────
        let { base64Image, mimeType } = JSON.parse(event.body);
        if (!base64Image || !mimeType) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Missing base64Image or mimeType in request body" }),
            };
        }

        // ── 2b. Sanitize "Dirty Base64" ─────────────────────────
        // Android WebViews can send the full data URI prefix (e.g.
        // "data:image/jpeg;base64,/9j/4AAQ...") instead of raw base64.
        // Gemini API chokes on this prefix, causing a 30-second timeout.
        const dataUriMatch = base64Image.match(
            /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s
        );
        if (dataUriMatch) {
            console.log(
                `Stripped dirty base64 prefix. Detected MIME: ${dataUriMatch[1]}, Using MIME: ${mimeType}`
            );
            base64Image = dataUriMatch[2];
        }

        // Also strip any stray whitespace/newlines that some encoders inject
        base64Image = base64Image.replace(/\s/g, "");

        // ── 3. Call Gemini API ──────────────────────────────────
        const schedule = await callGeminiAPI(base64Image, mimeType);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ schedule }),
        };
    } catch (error) {
        console.error("parseTimetable error:", error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
