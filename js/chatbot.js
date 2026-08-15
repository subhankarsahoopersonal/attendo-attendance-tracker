/**
 * Logic-Based Chatbot (formerly "Chatbot")
 * Handles natural language queries using pattern matching.
 * Renamed to LogicBot to distinguish from the AI-powered AIChatbot wrapper.
 */

const LogicBot = {

    /**
     * Process user message
     * @param {string} message 
     * @returns {Object} Response object { text, type, metadata }
     */
    process(message) {
        const cleanMsg = message.toLowerCase().trim();

        // Pattern 1: "I bunked [Subject]" or "I missed [Subject]" (Priority: Action)
        if ((cleanMsg.includes('missed') || cleanMsg.includes('bunked')) && !cleanMsg.includes('can i')) {
            const subject = this.extractSubject(cleanMsg);
            if (subject) {
                return this.handleMarkAttendance(subject, 'missed');
            }
        }

        // Pattern 2: "I attended [Subject]" (Priority: Action)
        if (cleanMsg.includes('attended') || cleanMsg.includes('went to')) {
            const subject = this.extractSubject(cleanMsg);
            if (subject) {
                return this.handleMarkAttendance(subject, 'attended');
            }
        }

        // Pattern 3: "How many [Subject] classes can I miss?" (Priority: Specific Question)
        // Specific check for "how many" to return bunk budget directly
        if (cleanMsg.includes('how many') && (cleanMsg.includes('miss') || cleanMsg.includes('skip') || cleanMsg.includes('bunk'))) {
            const subject = this.extractSubject(cleanMsg);
            if (subject) {
                // Just return the status which contains the bunk budget
                return this.handleStatusQuery(subject);
            }
        }

        // Pattern 4: "Can I bunk today?" (no specific subject — show all today's classes)
        if ((cleanMsg.includes('bunk today') || cleanMsg.includes('skip today') || cleanMsg.includes('miss today')) && !this.extractSubject(cleanMsg)) {
            return this.handleBunkToday();
        }

        // Pattern 5: "Can I skip [Subject]?" (Priority: General Advice)
        // Matches "skip", "bunk", "miss" but only if not caught by above patterns
        // Focuses on advice and simulation
        if (cleanMsg.includes('skip') || cleanMsg.includes('bunk') || cleanMsg.includes('miss') || cleanMsg.includes('can i')) {
            const subject = this.extractSubject(cleanMsg);
            if (subject) {
                return this.handleSkipQuery(subject);
            }
            if (cleanMsg.includes('can i')) {
                return this.response("Which subject? (e.g., 'Can I skip Physics?')\n\nOr try: **'Can I bunk today?'** for a full overview.");
            }
        }

        // Pattern 5: Assessment/Status
        if (cleanMsg.includes('status') || cleanMsg.includes('attendance') || cleanMsg.includes('percentage')) {
            const subject = this.extractSubject(cleanMsg);
            if (subject) {
                return this.handleStatusQuery(subject);
            }
            return this.handleOverallStatus();
        }

        // Pattern 6: "Class cancelled" or "[Subject] cancelled"
        if (cleanMsg.includes('cancelled') || cleanMsg.includes('canceled')) {
            const subject = this.extractSubject(cleanMsg);
            if (subject) {
                return this.handleMarkAttendance(subject, 'cancelled');
            }
        }

        // Default fallback / Help
        return this.response(
            "**I didn't catch that. Here's what I can do:**\n\n" +
            "1. **Mark Attendance:**\n" +
            "   - 'I bunked Physics'\n" +
            "   - 'I attended Math'\n" +
            "   - 'Physics class cancelled'\n\n" +
            "2. **Check Status:**\n" +
            "   - 'What is my status?'\n" +
            "   - 'How many Physics classes can I miss?'\n\n" +
            "3. **Ask for Advice:**\n" +
            "   - 'Can I skip Chemistry?'\n" +
            "   - **'Can I bunk today?'**"
        );
    },

    /**
     * Helper: Extract subject name from text
     */
    extractSubject(text) {
        const subjects = StorageManager.getSubjects();
        // Sort by length desc to match longer names first ("Math II" before "Math")
        subjects.sort((a, b) => b.name.length - a.name.length);

        for (const sub of subjects) {
            if (text.includes(sub.name.toLowerCase())) {
                return sub;
            }
        }
        return null;
    },

    /**
     * Handler: Skip Query
     */
    handleSkipQuery(subject) {
        const pct = AttendanceCalculator.calculatePercentage(subject.attended, subject.totalHeld);
        const safeToSkip = AttendanceCalculator.getClassesToSkip(subject);

        // Check if scheduled tomorrow/next
        const nextClass = TimetableManager.getNextClass(subject.id);
        const nextText = nextClass ?
            (nextClass.daysFromNow === 0 ? "You have class today." :
                nextClass.daysFromNow === 1 ? "You have class tomorrow." :
                    `Next class is on ${nextClass.day}.`) :
            "No upcoming classes found.";

        let response = "";

        if (safeToSkip > 0) {
            response = `✅ **Yes, you are safe!**\n\nCurrent attendance: ${pct}.\nYou can skip **${safeToSkip}** more classes without dropping below 75%.\n${nextText}`;
            if (nextClass && nextClass.daysFromNow <= 1) {
                const sim = AttendanceCalculator.simulate(subject, 'skip');
                response += `\nIf you skip, you'll drop to ${sim.newPercentage}%`;
            }
        } else {
            const needed = AttendanceCalculator.getClassesToAttend(subject);
            const sim = AttendanceCalculator.simulate(subject, 'skip');
            response = `⛔ **No! Don't do it!**\n\nCurrent attendance: ${pct}.\nYou need to attend the next **${needed}** classes to be safe.\nIf you skip, you'll drop to ${sim.newPercentage}%!`;
        }

        return this.response(response);
    },

    /**
     * Handler: Status Query
     */
    handleStatusQuery(subject) {
        const stats = AttendanceCalculator.getStatus(subject);
        const pct = AttendanceCalculator.getRawPercentage(subject).toFixed(1);
        return this.response(`**${subject.name}**: ${pct}%\n${stats.message}`);
    },

    /**
     * Handler: Overall Status
     */
    handleOverallStatus() {
        const subjects = StorageManager.getSubjects();
        if (subjects.length === 0) return this.response("You haven't added any subjects yet.");

        let msg = "**Overall Status:**\n";
        let safeCount = 0;

        subjects.forEach(sub => {
            const pct = AttendanceCalculator.getRawPercentage(sub).toFixed(1);
            const icon = pct >= 75 ? "✅" : "⚠️";
            msg += `\n${icon} ${sub.name}: ${pct}%`;
            if (pct >= 75) safeCount++;
        });

        msg += `\n\nYou are safe in ${safeCount}/${subjects.length} subjects.`;
        return this.response(msg);
    },

    /**
     * Handler: Mark Attendance via Chat
     */
    handleMarkAttendance(subject, status) {
        // This assumes marking for *today*. 
        // Ideally we'd match a specific slot, but for chatbot simplicity we might just log it
        // or tell the user to use the dashboard if there are multiple slots.

        // Use StorageManager.getTodayClasses() to include extra classes
        const todaySchedule = StorageManager.getTodayClasses();
        const relevantSlots = todaySchedule.filter(s => s.subjectId === subject.id);

        if (relevantSlots.length === 0) {
            return this.response(`You don't have ${subject.name} in your timetable today.`);
        }

        if (relevantSlots.length > 1) {
            return this.response(`You have multiple ${subject.name} classes today. Please use the dashboard to mark the specific one.`);
        }

        // Mark the single slot
        StorageManager.markAttendance(relevantSlots[0].id, subject.id, status, null, relevantSlots[0].time);
        const newStats = AttendanceCalculator.getRawPercentage(StorageManager.getSubjectById(subject.id)).toFixed(1);

        return this.response(`Done! Marked **${subject.name}** as ${status}.\nNew Attendance: ${newStats}%`);
    },

    /**
     * Helper: Response formatter
     */
    response(text) {
        return {
            text,
            timestamp: new Date().toISOString(),
            sender: 'bot'
        };
    },

    /**
     * Handler: "Can I Bunk Today?" — overview of all today's classes
     */
    handleBunkToday() {
        const classes = StorageManager.getTodayClasses();
        const settings = StorageManager.getSettings();
        const target = settings.targetAttendance || 75;

        if (classes.length === 0) {
            return this.response("😴 **No classes today — you're free!**\n\nEnjoy your day off!");
        }

        let msg = "🤔 **Can I Bunk Today?**\n";
        const seenSubjects = new Set();
        let safeCount = 0;
        let totalCount = 0;

        classes.forEach(slot => {
            if (!slot.subject || seenSubjects.has(slot.subjectId)) return;
            seenSubjects.add(slot.subjectId);
            totalCount++;

            const subject = slot.subject;
            const skippable = AttendanceCalculator.getClassesToSkip(subject, target);
            const percentage = AttendanceCalculator.getRawPercentage(subject).toFixed(1);

            if (skippable > 0) {
                msg += `\n✅ **${subject.name}** (${percentage}%) — Safe! ${skippable} bunk${skippable === 1 ? '' : 's'} left`;
                safeCount++;
            } else if (parseFloat(percentage) >= target) {
                msg += `\n⚠️ **${subject.name}** (${percentage}%) — Borderline, don't risk it`;
            } else {
                const needed = AttendanceCalculator.getClassesToAttend(subject, target);
                msg += `\n⛔ **${subject.name}** (${percentage}%) — No! Attend next ${needed} class${needed === 1 ? '' : 'es'}`;
            }
        });

        msg += `\n\n**Summary:** ${safeCount}/${totalCount} subjects safe to skip.`;

        return this.response(msg);
    }
};


// ========================================
// AI Chatbot Wrapper (RAG via Gemini 1.5 Flash)
// ========================================

/**
 * Fix 11: Manual YYYY-MM-DD formatter — safe on all Android WebViews.
 * toLocaleDateString('en-CA') is unreliable on older System WebViews.
 */
function getLocalDateISO() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const AIChatbot = {
    TIMEOUT_MS: 9000, // Changed from 30000 to 9000 (9 seconds)

    /**
     * Process user message — tries AI first, falls back to LogicBot.
     * @param {string} message
     * @returns {Promise<Object>} Response object { text, timestamp, sender, source }
     */
    async process(message) {
        const cleanMsg = message.toLowerCase().trim();

        // Action commands bypass AI entirely (read-only AI policy)
        if (this.isActionCommand(cleanMsg)) {
            return { ...LogicBot.process(message), source: 'logic' };
        }

        // Try AI with 30s hard timeout
        try {
            const user = firebase.auth().currentUser;
            if (!user) {
                // Not logged in — can't call backend
                return { ...LogicBot.process(message), source: 'logic' };
            }

            const token = await user.getIdToken();
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

            const res = await fetch('/.netlify/functions/chatbot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message,
                    localDate: getLocalDateISO(),          // Fix 11: always YYYY-MM-DD
                    timezoneOffset: new Date().getTimezoneOffset()
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            const data = await res.json();

            if (data.fallback) {
                return this.fallback(message, data.reason);
            }

            return {
                text: data.response,
                timestamp: new Date().toISOString(),
                sender: 'bot',
                source: 'ai'
            };
        } catch (e) {
            // Network error, timeout, or any failure → graceful fallback
            const reason = e.name === 'AbortError' ? 'timeout' : 'error';
            return this.fallback(message, reason);
        }
    },

    /**
     * Determines if a message is a direct action command (should go to LogicBot).
     * Question patterns are checked FIRST — if it looks like a question, always route to AI.
     * "Should I attend tomorrow?" → AI (starts with "should")
     * "I attended Physics" → LogicBot (imperative action, no question pattern)
     */
    isActionCommand(msg) {
        const cleanMsg = msg.toLowerCase().trim();

        // 1. If it ends with '?' or starts with a question/advisory word, ALWAYS route to AI
        const isQuestion = /\?$/.test(cleanMsg) ||
            /^(can|how|what|which|why|when|where|tell|show|did|do|does|is|are|should|would|could|will|am|if)/i.test(cleanMsg);

        if (isQuestion) return false; // Force route to AI

        // 2. Also check for question words anywhere in the sentence
        const hasQuestionWord = /(can i|how|what|which|why|when|where|tell|show|did|do|does|is|are|should|would|could)/i.test(cleanMsg);
        if (hasQuestionWord) return false;

        // 3. Direct imperative actions (e.g., "I bunked physics", "Cancel math", "Mark physics as attended")
        const hasActionKeyword = /(bunk|bunked|miss|missed|attend|attended|cancel|cancelled|canceled|mark|went to)/i.test(cleanMsg);

        return hasActionKeyword;
    },

    /**
     * Graceful fallback — delegates to LogicBot with a contextual note.
     */
    fallback(message, reason) {
        const response = LogicBot.process(message);
        const notes = {
            timeout: '⚡ AI was too slow — answered by Logic Bot',
            rate_limited: '⚡ AI is busy — answered by Logic Bot',
            error: '⚡ AI unavailable — answered by Logic Bot'
        };
        response.text += `\n\n_${notes[reason] || notes.error}_`;
        response.source = 'logic_fallback';
        return response;
    }
};
