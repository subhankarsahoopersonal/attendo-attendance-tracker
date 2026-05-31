/**
 * parseTimetable.js — Netlify Serverless Function
 * 
 * Secure proxy for the Gemini Vision API.
 * - Verifies Firebase auth tokens (only logged-in users can call)
 * - Holds the GEMINI_API_KEY server-side (never exposed to the browser)
 * - Retries across multiple Gemini models for resilience
 */

const admin = require("firebase-admin");
const fetch = require("node-fetch");

// ── Firebase Admin initialization ──────────────────────────────────
// Netlify is NOT part of GCP, so we must provide explicit credentials.
// The service account JSON is stored as a base64-encoded env var.
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString()
    );
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

// ── Constants ──────────────────────────────────────────────────────
const GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash",
];

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

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await fetch(modelUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                if (response.ok) {
                    const data = await response.json();
                    const rawText = data.candidates[0].content.parts[0].text;
                    const cleanJson = rawText
                        .replace(/```json/g, "")
                        .replace(/```/g, "")
                        .trim();
                    return JSON.parse(cleanJson);
                }

                const errBody = await response.text();
                console.warn(
                    `${model} attempt ${attempt} failed (${response.status}):`,
                    errBody.substring(0, 200)
                );
                lastErrorMsg = `HTTP ${response.status}: ${errBody.substring(0, 150)}`;

                if (response.status === 503) {
                    await sleep(3000 * attempt);
                    continue; // retry same model
                }
                if (response.status === 429) {
                    break; // skip to next model
                }
                // Other errors (404, 400, etc.) — skip to next model
                break;
            } catch (error) {
                console.warn(`${model} attempt ${attempt} network error:`, error.message);
                lastErrorMsg = `Network Error: ${error.message}`;
                await sleep(2000);
            }
        }
    }

    throw new Error(`All Gemini models failed. Last error: ${lastErrorMsg}`);
}

// ── Main handler ───────────────────────────────────────────────────
exports.handler = async (event) => {
    // ── CORS headers (allow your domain + localhost dev) ────────
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    // Handle preflight
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers, body: "" };
    }

    // Only accept POST
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
        const { base64Image, mimeType } = JSON.parse(event.body);
        if (!base64Image || !mimeType) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Missing base64Image or mimeType in request body" }),
            };
        }

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
