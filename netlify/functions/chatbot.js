/**
 * chatbot.js — Netlify Serverless Function
 *
 * RAG-powered AI chatbot proxy for AttenDO.
 * - Verifies Firebase auth tokens (only logged-in users can call)
 * - Fetches user data from Firestore server-side (no client context spoofing)
 * - Builds a minified context payload (Fix 2: aggregate stats only)
 * - Calls Gemini 1.5 Flash with a carefully crafted system prompt
 * - Returns AI response or signals the client to fallback to LogicBot
 */

const admin = require("firebase-admin");
const fetch = require("node-fetch");

// ── Firebase Admin initialization (same pattern as parseTimetable.js) ──
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString()
    );
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}
const db = admin.firestore();

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_RETRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Build minified context from Firestore data ──────────────────────
// Fix 10: Defensive — normalizes Array/Object subjects, resolves slot names
// Fix 6: Uses localDate from client (not server UTC) to determine today
function buildContext(subjects, timetable, settings, extraClasses, notes, localDate) {
    // Determine day name from client's local date (Fix 6: avoids UTC bug)
    const dayName = new Date(localDate + "T12:00:00")
        .toLocaleDateString("en-US", { weekday: "long" })
        .toLowerCase();
    const target = (settings && settings.targetAttendance) || 75;

    // Fix 10: Normalize subjects — handles Array, Object map, or {items: [...]} wrapper
    // Firestore stores as { items: [...] } (see storage.js pushAll, line 1080-1082)
    const rawSubjects = Array.isArray(subjects.items)
        ? subjects.items
        : Array.isArray(subjects)
        ? subjects
        : Object.values(subjects.items || subjects || {});

    const targetRatio = target / 100; // e.g., 0.75

    const subjectList = rawSubjects.map((s) => {
        const attended = s.attended || 0;
        const total = s.totalHeld || 0;
        const cancelled = s.cancelled || 0;
        const pct = total > 0 ? ((attended / total) * 100).toFixed(1) + "%" : "100%";

        // Pre-calculate max safe bunks (Fix: LLMs can't do math reliably)
        // Formula: floor((attended - target * total) / target)
        let maxSafeBunks = 0;
        if (total > 0 && (attended / total) >= targetRatio) {
            maxSafeBunks = Math.floor((attended - (targetRatio * total)) / targetRatio);
        }

        return {
            id: s.id || s.name,
            name: s.name,
            attended,
            total,
            cancelled,
            pct,
            maxSafeBunks: Math.max(0, maxSafeBunks),
        };
    });

    // Parse today's schedule — resolve slot objects to readable strings
    // Room numbers are stored as notes keyed by slot ID
    const daySlots = timetable[dayName] || [];
    const todaySlots = daySlots.map((slot) => {
        if (typeof slot === "string") return slot;
        const sub = subjectList.find(
            (s) => s.id === slot.subjectId || s.name === slot.subjectName
        );
        const room = (notes && slot.id) ? (notes[slot.id] || "") : "";
        const name = sub ? sub.name : slot.subjectName || "Class";
        return `${name} ${slot.time || ""}${room ? " (Room: " + room + ")" : ""}`.trim();
    });

    // Build weekly overview (compact — only days with classes)
    const weeklyOverview = {};
    const weekdays = [
        "monday", "tuesday", "wednesday", "thursday",
        "friday", "saturday", "sunday",
    ];
    weekdays.forEach((day) => {
        const slots = timetable[day] || [];
        if (slots.length > 0) {
            weeklyOverview[day] = slots.map((slot) => {
                if (typeof slot === "string") return slot;
                const sub = subjectList.find(
                    (s) => s.id === slot.subjectId || s.name === slot.subjectName
                );
                const room = (notes && slot.id) ? (notes[slot.id] || "") : "";
                const name = sub ? sub.name : slot.subjectName || "Class";
                return `${name} ${slot.time || ""}${room ? " (Room: " + room + ")" : ""}`.trim();
            });
        }
    });

    return {
        target,
        today: localDate,
        dayName,
        subjects: subjectList,
        todaySchedule: todaySlots,
        weeklyTimetable: weeklyOverview,
    };
}

// ── Call Gemini 1.5 Flash ───────────────────────────────────────────
// Fix 12: System prompt reminds user to mark attendance via app buttons
async function callGemini(message, context) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");

    const systemPrompt = `You are AttenDO, a helpful attendance advisor for a college student.

Rules:
- You can ONLY read data. Never say you modified, marked, or updated anything.
- If the student mentions bunking/attending a class AND asks about its impact, calculate the projected stats for them, but always remind them: "Don't forget to mark it in the app using the dashboard buttons!"
- CRITICAL: ALWAYS use the pre-calculated "maxSafeBunks" field from the data below when telling users how many classes they can miss. Do NOT recalculate this number yourself. The app has already computed it mathematically.
- CRITICAL: A percentage that is >= the target is SAFE, not a fail. Double-check before saying something is "below target".
- If asked about cancelled classes for "this week", "today", or a specific date range: state clearly that you only have overall total cancelled counts, NOT date-specific cancellation logs. Do NOT list total lifetime cancellations as if they happened in the requested timeframe.
- Ensure every sentence is grammatically complete. Write "You can safely miss 3 more classes", never omit verbs or numbers.
- Keep responses under 150 words.
- Use **bold** and emojis for formatting.
- If the data doesn't contain enough info to answer, say so honestly.
- The student's target attendance is ${context.target}%.
- Today is ${context.dayName}, ${context.today}.

Student's attendance data:
${JSON.stringify(context.subjects, null, 1)}

Today's schedule: ${context.todaySchedule.join(", ") || "No classes today"}

Weekly timetable: ${JSON.stringify(context.weeklyTimetable)}`;

    const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: message }] }],
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`Gemini attempt ${attempt}/${MAX_RETRIES}...`);

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) {
                    console.warn("Gemini returned empty/blocked response");
                    if (attempt < MAX_RETRIES) {
                        await sleep(1500);
                        continue;
                    }
                    return null;
                }
                return text;
            }

            const errBody = await res.text();
            console.warn(`Gemini attempt ${attempt} failed (${res.status}):`, errBody.substring(0, 200));

            if (res.status === 429) {
                // Rate limited — signal client to fallback immediately
                return null;
            }
            if (res.status >= 500) {
                // Server overloaded — retry with backoff
                await sleep(1500 * attempt);
                continue;
            }
            // 4xx client error — don't retry
            break;
        } catch (err) {
            console.warn(`Gemini attempt ${attempt} error:`, err.message);
            if (attempt < MAX_RETRIES) {
                await sleep(1500);
            }
        }
    }
    return null; // All retries failed → signal fallback
}

// ── Main handler ────────────────────────────────────────────────────
exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
    
    console.log("[Chatbot] Request received. Starting execution...");
    const startTime = Date.now();

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    }

    try {
        // 1. Verify Auth
        console.log("[Chatbot] Step 1: Verifying Auth Token...");
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader) throw new Error("No Auth Header");
        const decoded = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
        const uid = decoded.uid;
        console.log(`[Chatbot] Auth passed for UID: ${uid} (Took ${Date.now() - startTime}ms)`);

        // 2. Parse request
        const { message, localDate } = JSON.parse(event.body);

        // 3. Fetch Firestore Data
        console.log("[Chatbot] Step 2: Fetching Firestore Data...");
        const fsStart = Date.now();
        const [subSnap, ttSnap, setSnap, exSnap, notesSnap] = await Promise.all([
            db.collection("users").doc(uid).collection("data").doc("subjects").get(),
            db.collection("users").doc(uid).collection("data").doc("timetable").get(),
            db.collection("users").doc(uid).collection("data").doc("settings").get(),
            db.collection("users").doc(uid).collection("data").doc("extraClasses").get(),
            db.collection("users").doc(uid).collection("data").doc("notes").get(),
        ]);
        console.log(`[Chatbot] Firestore fetch complete! (Took ${Date.now() - fsStart}ms)`);

        const subjects = subSnap.exists ? subSnap.data() : { items: [] };
        const timetable = ttSnap.exists ? ttSnap.data() : {};
        const settings = setSnap.exists ? setSnap.data() : { targetAttendance: 75 };
        const extraClasses = exSnap.exists ? exSnap.data() : { items: [] };
        const notes = notesSnap.exists ? notesSnap.data() : {};

        // 4. Build Context & Call Gemini
        console.log("[Chatbot] Step 3: Calling Gemini API...");
        const geminiStart = Date.now();
        const context = buildContext(subjects, timetable, settings, extraClasses, notes, localDate);
        const aiResponse = await callGemini(message, context);
        console.log(`[Chatbot] Gemini API complete! (Took ${Date.now() - geminiStart}ms)`);

        if (aiResponse === null) {
            return { statusCode: 200, headers, body: JSON.stringify({ fallback: true, reason: "rate_limited" }) };
        }

        console.log(`[Chatbot] Success! Total time: ${Date.now() - startTime}ms`);
        return { statusCode: 200, headers, body: JSON.stringify({ response: aiResponse, source: "ai" }) };

    } catch (err) {
        console.error("[Chatbot] ERROR CAUGHT:", err.message);
        return { statusCode: 200, headers, body: JSON.stringify({ fallback: true, reason: "error" }) };
    }
};
