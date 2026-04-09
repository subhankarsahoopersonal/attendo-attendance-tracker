/**
 * Utility: Get local date as YYYY-MM-DD string (avoids UTC timezone bug with toISOString)
 * @param {Date} [d] - Optional date, defaults to now
 * @returns {string}
 */
function getLocalDateString(d) {
    const date = d || new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Storage Manager - LocalStorage Data Layer
 * Handles all data persistence for AttenDO
 */

const StorageManager = {
    KEYS: {
        SUBJECTS: 'bunkManager_subjects',
        TIMETABLE: 'bunkManager_timetable',
        HISTORY: 'bunkManager_history',
        SETTINGS: 'bunkManager_settings',
        EXTRA_CLASSES: 'bunkManager_extraClasses',
        NOTES: 'bunkManager_notes',
        SEMESTER_ARCHIVES: 'bunkManager_semesterArchives'
    },

    // Default settings
    DEFAULT_SETTINGS: {
        notificationsEnabled: true,
        notificationTime: '17:00',
        morningReminderEnabled: false,
        morningReminderTime: '08:00',
        targetAttendance: 75
    },

    /**
     * Initialize storage with default values if empty
     */
    init() {
        if (!this.getSubjects().length) {
            this.setSubjects([]);
        }
        if (!this.getTimetable()) {
            this.setTimetable({
                monday: [],
                tuesday: [],
                wednesday: [],
                thursday: [],
                friday: [],
                saturday: [],
                sunday: []
            });
        }
        if (!this.getHistory().length) {
            this.setHistory([]);
        }
        if (!this.getSettings()) {
            this.setSettings(this.DEFAULT_SETTINGS);
        }
        if (!this.getExtraClasses().length) {
            this.setExtraClasses([]);
        }
        if (!this.getNotes() || typeof this.getNotes() !== 'object') {
            this.setNotes({});
        }
    },

    // ========================================
    // Subject Management
    // ========================================

    /**
     * Get all subjects
     * @returns {Array} List of subjects
     */
    getSubjects() {
        try {
            return JSON.parse(localStorage.getItem(this.KEYS.SUBJECTS)) || [];
        } catch {
            return [];
        }
    },

    /**
     * Save subjects array
     * @param {Array} subjects 
     */
    setSubjects(subjects) {
        localStorage.setItem(this.KEYS.SUBJECTS, JSON.stringify(subjects));
    },

    /**
     * Add a new subject
     * @param {Object} subject - { name, color }
     * @returns {Object} Created subject with id
     */
    addSubject(subject) {
        const subjects = this.getSubjects();
        const newSubject = {
            id: this.generateId(),
            name: subject.name,
            color: subject.color,
            attended: 0,
            totalHeld: 0,
            cancelled: 0,
            createdAt: new Date().toISOString()
        };
        subjects.push(newSubject);
        this.setSubjects(subjects);
        return newSubject;
    },

    /**
     * Update a subject
     * @param {string} id 
     * @param {Object} updates 
     */
    updateSubject(id, updates) {
        const subjects = this.getSubjects();
        const index = subjects.findIndex(s => s.id === id);
        if (index !== -1) {
            subjects[index] = { ...subjects[index], ...updates };
            this.setSubjects(subjects);
        }
    },

    /**
     * Delete a subject and its related data
     * @param {string} id 
     */
    deleteSubject(id) {
        // Remove from subjects
        const subjects = this.getSubjects().filter(s => s.id !== id);
        this.setSubjects(subjects);

        // Remove from timetable
        const timetable = this.getTimetable();
        Object.keys(timetable).forEach(day => {
            timetable[day] = timetable[day].filter(slot => slot.subjectId !== id);
        });
        this.setTimetable(timetable);

        // Remove from history
        const history = this.getHistory().filter(h => h.subjectId !== id);
        this.setHistory(history);
    },

    /**
     * Get a single subject by ID
     * @param {string} id 
     * @returns {Object|null}
     */
    getSubjectById(id) {
        return this.getSubjects().find(s => s.id === id) || null;
    },

    /**
     * Get subject by name (case insensitive)
     * @param {string} name 
     * @returns {Object|null}
     */
    getSubjectByName(name) {
        if (!name) return null;
        const lowerName = name.toLowerCase();
        return this.getSubjects().find(s => s.name.toLowerCase() === lowerName) || null;
    },

    // ========================================
    // Timetable Management
    // ========================================

    /**
     * Get timetable
     * @returns {Object} Timetable by day
     */
    getTimetable() {
        try {
            return JSON.parse(localStorage.getItem(this.KEYS.TIMETABLE)) || {};
        } catch {
            return {};
        }
    },

    /**
     * Save timetable
     * @param {Object} timetable 
     */
    setTimetable(timetable) {
        localStorage.setItem(this.KEYS.TIMETABLE, JSON.stringify(timetable));
    },

    /**
     * Add a class to timetable
     * @param {string} day - monday, tuesday, etc.
     * @param {Object} classData - { subjectId, time }
     */
    addToTimetable(day, classData) {
        const timetable = this.getTimetable();
        if (!timetable[day]) {
            timetable[day] = [];
        }
        timetable[day].push({
            id: this.generateId(),
            subjectId: classData.subjectId,
            time: classData.time,
            endTime: classData.endTime || null
        });
        // Sort by time
        timetable[day].sort((a, b) => a.time.localeCompare(b.time));
        this.setTimetable(timetable);
    },

    /**
     * Remove a class from timetable
     * @param {string} day 
     * @param {string} slotId 
     */
    removeFromTimetable(day, slotId) {
        const timetable = this.getTimetable();
        if (timetable[day]) {
            timetable[day] = timetable[day].filter(slot => slot.id !== slotId);
            this.setTimetable(timetable);
        }
    },

    /**
     * Get today's classes (combines recurring + extra classes)
     * @returns {Array} Today's class schedule with subject details
     */
    getTodayClasses() {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = days[new Date().getDay()];
        const todayDate = getLocalDateString();
        const timetable = this.getTimetable();
        const todaySlots = timetable[today] || [];
        const subjects = this.getSubjects();
        const todayHistory = this.getTodayHistory();

        // Map recurring classes
        const recurringClasses = todaySlots.map(slot => {
            const subject = subjects.find(s => s.id === slot.subjectId);
            const historyEntry = todayHistory.find(h => h.slotId === slot.id);
            return {
                ...slot,
                subject: subject,
                status: historyEntry ? historyEntry.status : null,
                isExtra: false
            };
        });

        // Map extra classes for today
        const extraClasses = this.getExtraClassesForDate(todayDate).map(slot => {
            const subject = subjects.find(s => s.id === slot.subjectId);
            const historyEntry = todayHistory.find(h => h.slotId === slot.id);
            return {
                ...slot,
                subject: subject,
                status: historyEntry ? historyEntry.status : null,
                isExtra: true
            };
        });

        // Combine and sort by time
        return [...recurringClasses, ...extraClasses].sort((a, b) => a.time.localeCompare(b.time));
    },

    /**
     * Get classes for a specific day
     * @param {string} day 
     * @returns {Array}
     */
    getClassesForDay(day) {
        const timetable = this.getTimetable();
        const subjects = this.getSubjects();
        const slots = timetable[day] || [];

        return slots.map(slot => {
            const subject = subjects.find(s => s.id === slot.subjectId);
            return {
                ...slot,
                subject: subject
            };
        }).sort((a, b) => a.time.localeCompare(b.time));
    },

    /**
     * Get classes for a specific date (combines recurring + extra classes)
     * @param {string} day - Day name (e.g., 'monday')
     * @param {string} date - ISO date string (e.g., '2026-02-04')
     * @returns {Array}
     */
    getClassesForDate(day, date) {
        const subjects = this.getSubjects();

        // Get recurring classes for the day
        const timetable = this.getTimetable();
        const recurringSlots = (timetable[day] || []).map(slot => {
            const subject = subjects.find(s => s.id === slot.subjectId);
            return {
                ...slot,
                subject: subject,
                isExtra: false
            };
        });

        // Get extra classes for this specific date
        const extraSlots = this.getExtraClassesForDate(date).map(slot => {
            const subject = subjects.find(s => s.id === slot.subjectId);
            return {
                ...slot,
                subject: subject,
                isExtra: true
            };
        });

        // Combine and sort by time
        return [...recurringSlots, ...extraSlots].sort((a, b) => a.time.localeCompare(b.time));
    },

    // ========================================
    // Extra Classes (One-time, date-specific)
    // ========================================

    /**
     * Get all extra classes
     * @returns {Array}
     */
    getExtraClasses() {
        try {
            return JSON.parse(localStorage.getItem(this.KEYS.EXTRA_CLASSES)) || [];
        } catch {
            return [];
        }
    },

    /**
     * Save extra classes
     * @param {Array} extraClasses
     */
    setExtraClasses(extraClasses) {
        localStorage.setItem(this.KEYS.EXTRA_CLASSES, JSON.stringify(extraClasses));
    },

    /**
     * Add a one-time extra class for a specific date
     * @param {string} date - ISO date string (e.g., '2026-02-04')
     * @param {string} subjectId
     * @param {string} time - HH:MM format
     * @param {string} endTime - HH:MM format (optional)
     * @returns {Object} Created extra class entry
     */
    addExtraClass(date, subjectId, time, endTime = null) {
        const extraClasses = this.getExtraClasses();
        const newEntry = {
            id: this.generateId(),
            date: date,
            subjectId: subjectId,
            time: time,
            endTime: endTime,
            isExtra: true,
            createdAt: new Date().toISOString()
        };
        extraClasses.push(newEntry);
        this.setExtraClasses(extraClasses);
        return newEntry;
    },

    /**
     * Delete an extra class
     * @param {string} id
     */
    deleteExtraClass(id) {
        const extraClasses = this.getExtraClasses().filter(e => e.id !== id);
        this.setExtraClasses(extraClasses);
    },

    /**
     * Get extra classes for a specific date
     * @param {string} date - ISO date string
     * @returns {Array}
     */
    getExtraClassesForDate(date) {
        return this.getExtraClasses().filter(e => e.date === date);
    },

    // ========================================
    // Notes (Recurring per-slot)
    // ========================================

    /**
     * Get all notes
     * @returns {Object} { slotId: "note text", ... }
     */
    getNotes() {
        try {
            return JSON.parse(localStorage.getItem(this.KEYS.NOTES)) || {};
        } catch {
            return {};
        }
    },

    /**
     * Save notes object
     * @param {Object} notes
     */
    setNotes(notes) {
        localStorage.setItem(this.KEYS.NOTES, JSON.stringify(notes));
    },

    /**
     * Get note for a specific slot
     * @param {string} slotId
     * @returns {string}
     */
    getNote(slotId) {
        const notes = this.getNotes();
        return notes[slotId] || '';
    },

    /**
     * Set note for a specific slot (deletes key if text is empty)
     * @param {string} slotId
     * @param {string} text
     */
    setNote(slotId, text) {
        const notes = this.getNotes();
        if (text && text.trim()) {
            notes[slotId] = text.trim();
        } else {
            delete notes[slotId];
        }
        this.setNotes(notes);
    },

    // ========================================
    // Attendance History
    // ========================================

    /**
     * Get all history
     * @returns {Array}
     */
    getHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.KEYS.HISTORY)) || [];
        } catch {
            return [];
        }
    },

    /**
     * Save history
     * @param {Array} history 
     */
    setHistory(history) {
        localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
    },

    /**
     * Mark attendance for a class
     * @param {string} slotId 
     * @param {string} subjectId 
     * @param {string} status - 'attended', 'missed', 'cancelled'
     * @param {string} date - Optional, defaults to today
     */
    markAttendance(slotId, subjectId, status, date = null) {
        const today = date || getLocalDateString();
        const history = this.getHistory();

        // Check if already marked today for this slot
        const existingIndex = history.findIndex(
            h => h.slotId === slotId && h.date === today
        );

        const entry = {
            id: this.generateId(),
            slotId,
            subjectId,
            status,
            date: today,
            timestamp: new Date().toISOString()
        };

        if (existingIndex !== -1) {
            // Update existing entry - need to reverse the previous action
            const oldStatus = history[existingIndex].status;
            this.reverseAttendanceAction(subjectId, oldStatus);
            history[existingIndex] = entry;
        } else {
            history.push(entry);
        }

        this.setHistory(history);

        // Update subject stats
        this.applyAttendanceAction(subjectId, status);
    },

    /**
     * Apply attendance action to subject
     * @param {string} subjectId 
     * @param {string} status 
     */
    applyAttendanceAction(subjectId, status) {
        const subject = this.getSubjectById(subjectId);
        if (!subject) return;

        switch (status) {
            case 'attended':
                subject.attended += 1;
                subject.totalHeld += 1;
                break;
            case 'missed':
                subject.totalHeld += 1;
                break;
            case 'cancelled':
                subject.cancelled += 1;
                break;
        }

        this.updateSubject(subjectId, subject);
    },

    /**
     * Reverse attendance action (for corrections)
     * @param {string} subjectId 
     * @param {string} status 
     */
    reverseAttendanceAction(subjectId, status) {
        const subject = this.getSubjectById(subjectId);
        if (!subject) return;

        switch (status) {
            case 'attended':
                subject.attended = Math.max(0, subject.attended - 1);
                subject.totalHeld = Math.max(0, subject.totalHeld - 1);
                break;
            case 'missed':
                subject.totalHeld = Math.max(0, subject.totalHeld - 1);
                break;
            case 'cancelled':
                subject.cancelled = Math.max(0, subject.cancelled - 1);
                break;
        }

        this.updateSubject(subjectId, subject);
    },

    /**
     * Get today's history entries
     * @returns {Array}
     */
    getTodayHistory() {
        const today = getLocalDateString();
        return this.getHistory().filter(h => h.date === today);
    },

    // ========================================
    // Settings
    // ========================================

    /**
     * Get settings
     * @returns {Object}
     */
    getSettings() {
        try {
            return JSON.parse(localStorage.getItem(this.KEYS.SETTINGS)) || this.DEFAULT_SETTINGS;
        } catch {
            return this.DEFAULT_SETTINGS;
        }
    },

    /**
     * Save settings
     * @param {Object} settings 
     */
    setSettings(settings) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    },

    /**
     * Update specific setting
     * @param {string} key 
     * @param {any} value 
     */
    updateSetting(key, value) {
        const settings = this.getSettings();
        settings[key] = value;
        this.setSettings(settings);
    },

    // ========================================
    // Import/Export
    // ========================================

    /**
     * Export all data as JSON
     * @returns {string} JSON string of all data
     */
    exportData() {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            subjects: this.getSubjects(),
            timetable: this.getTimetable(),
            history: this.getHistory(),
            settings: this.getSettings(),
            notes: this.getNotes()
        };
        return JSON.stringify(data, null, 2);
    },

    /**
     * Import data from JSON
     * @param {string} jsonString 
     * @returns {boolean} Success status
     */
    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            // Validate structure
            if (!data.version || !data.subjects || !data.timetable) {
                throw new Error('Invalid backup file format');
            }

            // Import data
            if (data.subjects) this.setSubjects(data.subjects);
            if (data.timetable) this.setTimetable(data.timetable);
            if (data.history) this.setHistory(data.history);
            if (data.settings) this.setSettings({ ...this.DEFAULT_SETTINGS, ...data.settings });
            if (data.notes) this.setNotes(data.notes);

            return true;
        } catch (error) {
            console.error('Import failed:', error);
            return false;
        }
    },

    /**
     * Clear all data (preserves semester archives and settings)
     */
    clearAllData() {
        // Preserve archives and settings across clears
        const archives = localStorage.getItem(this.KEYS.SEMESTER_ARCHIVES);
        Object.values(this.KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        // Restore archives
        if (archives) localStorage.setItem(this.KEYS.SEMESTER_ARCHIVES, archives);
        this.init();
    },

    // ========================================
    // Semester Archives
    // ========================================

    /**
     * Get all semester archives
     * @returns {Array}
     */
    getSemesterArchives() {
        try {
            return JSON.parse(localStorage.getItem(this.KEYS.SEMESTER_ARCHIVES)) || [];
        } catch {
            return [];
        }
    },

    /**
     * Save semester archives
     * @param {Array} archives
     */
    setSemesterArchives(archives) {
        localStorage.setItem(this.KEYS.SEMESTER_ARCHIVES, JSON.stringify(archives));
    },

    /**
     * Archive the current semester and wipe all data
     * @param {string} semesterName - User-given name for this semester
     * @returns {Object} The created archive entry
     */
    archiveCurrentSemester(semesterName) {
        const archive = {
            id: this.generateId(),
            name: semesterName,
            archivedAt: new Date().toISOString(),
            subjects: this.getSubjects(),
            timetable: this.getTimetable(),
            history: this.getHistory(),
            extraClasses: this.getExtraClasses(),
            notes: this.getNotes(),
            settings: this.getSettings()
        };

        const archives = this.getSemesterArchives();
        archives.push(archive);
        this.setSemesterArchives(archives);

        // Full wipe (clearAllData preserves archives)
        this.clearAllData();

        return archive;
    },

    /**
     * Delete a semester archive by ID
     * @param {string} archiveId
     */
    deleteArchive(archiveId) {
        const archives = this.getSemesterArchives().filter(a => a.id !== archiveId);
        this.setSemesterArchives(archives);
    },

    /**
     * Generate CSV string from attendance data
     * @param {Object} data - { subjects, history } — pass current or archived data
     * @returns {string} CSV content
     */
    generateAttendanceCSV(data) {
        const subjects = data.subjects || [];
        const history = data.history || [];
        const settings = data.settings || this.getSettings();

        let csv = '\uFEFF'; // BOM for Excel Unicode support

        // === Section 1: Subject Summary ===
        csv += 'ATTENDANCE SUMMARY\r\n';
        csv += 'Subject,Attended,Total Held,Cancelled,Percentage,Target,Status\r\n';

        const target = settings.targetAttendance || 75;

        subjects.forEach(sub => {
            const pct = sub.totalHeld > 0 ? ((sub.attended / sub.totalHeld) * 100).toFixed(1) : '0.0';
            const status = parseFloat(pct) >= target ? 'Safe' : 'At Risk';
            csv += `"${sub.name}",${sub.attended},${sub.totalHeld},${sub.cancelled},${pct}%,${target}%,${status}\r\n`;
        });

        // Overall
        const totalAttended = subjects.reduce((s, sub) => s + sub.attended, 0);
        const totalHeld = subjects.reduce((s, sub) => s + sub.totalHeld, 0);
        const overallPct = totalHeld > 0 ? ((totalAttended / totalHeld) * 100).toFixed(1) : '0.0';
        csv += `\r\n"OVERALL",${totalAttended},${totalHeld},,${overallPct}%,,\r\n`;

        // === Section 2: Daily Log ===
        csv += '\r\n\r\nDAILY ATTENDANCE LOG\r\n';
        csv += 'Date,Subject,Status\r\n';

        // Sort history by date desc
        const subjectMap = {};
        subjects.forEach(s => subjectMap[s.id] = s.name);

        const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
        sorted.forEach(entry => {
            const subName = subjectMap[entry.subjectId] || 'Unknown';
            const statusLabel = entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
            const [y, m, d] = entry.date.split('-');
            csv += `${d}-${m}-${y.slice(2)},"${subName}",${statusLabel}\r\n`;
        });

        return csv;
    },

    /**
     * Generate a printable HTML report for PDF export
     * @param {Object} data - { subjects, history, name }
     * @returns {string} HTML string
     */
    generateAttendancePDFHtml(data) {
        const subjects = data.subjects || [];
        const history = data.history || [];
        const settings = data.settings || this.getSettings();
        const semesterName = data.name || 'Current Semester';
        const target = settings.targetAttendance || 75;

        const totalAttended = subjects.reduce((s, sub) => s + sub.attended, 0);
        const totalHeld = subjects.reduce((s, sub) => s + sub.totalHeld, 0);
        const totalCancelled = subjects.reduce((s, sub) => s + sub.cancelled, 0);
        const overallPct = totalHeld > 0 ? ((totalAttended / totalHeld) * 100).toFixed(1) : '0.0';
        const overallSafe = parseFloat(overallPct) >= target;

        // Build subject cards
        const subjectCards = subjects.map(sub => {
            const pct = sub.totalHeld > 0 ? ((sub.attended / sub.totalHeld) * 100).toFixed(1) : '0.0';
            const isSafe = parseFloat(pct) >= target;
            const barColor = isSafe ? '#10b981' : parseFloat(pct) >= 50 ? '#f59e0b' : '#ef4444';
            return `<div class="subject-card">
                <div class="subject-card-header">
                    <div class="subject-name-col"><span class="subject-dot" style="background:${sub.color}"></span><span class="subject-name">${sub.name}</span></div>
                    <span class="subject-pct" style="color:${barColor}">${pct}%</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${Math.min(parseFloat(pct), 100)}%;background:${barColor}"></div></div>
                <div class="subject-card-stats">
                    <span>Attended: ${sub.attended}</span><span>Total: ${sub.totalHeld}</span><span>Cancelled: ${sub.cancelled}</span>
                    <span class="status-badge" style="background:${isSafe ? '#ecfdf5' : '#fef2f2'};color:${isSafe ? '#059669' : '#dc2626'}">${isSafe ? 'Safe' : 'At Risk'}</span>
                </div>
            </div>`;
        }).join('');

        // Build history rows
        const subjectMap = {};
        subjects.forEach(s => subjectMap[s.id] = s.name);
        const extraClasses = data.extraClasses || [];
        const extraClassIds = new Set(extraClasses.map(e => e.id));
        const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
        const historyRows = sorted.map((entry, i) => {
            const subName = subjectMap[entry.subjectId] || 'Unknown';
            const isAttended = entry.status === 'attended';
            const isMissed = entry.status === 'missed';
            const statusColor = isAttended ? '#059669' : isMissed ? '#dc2626' : '#d97706';
            const statusBg = isAttended ? '#ecfdf5' : isMissed ? '#fef2f2' : '#fffbeb';
            const isExtra = extraClassIds.has(entry.slotId);
            const extraBadge = isExtra ? ' <span class="extra-badge">Extra</span>' : '';
            const [y, m, d] = entry.date.split('-');
            const formattedDate = `${d}-${m}-${y.slice(2)}`;
            return `<tr style="background:${i % 2 === 0 ? '#fff' : '#fafafe'}">
                <td style="font-weight:500">${formattedDate}</td>
                <td>${subName}${extraBadge}</td>
                <td><span class="log-badge" style="background:${statusBg};color:${statusColor}">${entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}</span></td>
            </tr>`;
        }).join('');

        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>AttenDO - ${semesterName} Report</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; color: #1e293b; background: #f8fafc; }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%); color: white; padding: 48px 40px 40px; text-align: center; }
        .header-badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 12px; text-transform: uppercase; }
        .header h1 { font-size: 28px; font-weight: 800; margin-bottom: 6px; letter-spacing: -0.5px; }
        .header p { font-size: 14px; opacity: 0.85; }
        .stats-bar { display: flex; gap: 0; margin: -24px 40px 32px; position: relative; z-index: 1; }
        .stat-card { flex: 1; background: white; padding: 24px 20px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .stat-card:first-child { border-radius: 12px 0 0 12px; }
        .stat-card:last-child { border-radius: 0 12px 12px 0; }
        .stat-card .stat-num { font-size: 32px; font-weight: 800; letter-spacing: -1px; }
        .stat-card .stat-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; font-weight: 600; }
        .stat-card.accent { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; }
        .stat-card.accent .stat-label { color: rgba(255,255,255,0.7); }
        .stat-card.green { border-top: 3px solid #10b981; }
        .stat-card.blue { border-top: 3px solid #6366f1; }
        .stat-card.orange { border-top: 3px solid #f59e0b; }
        .content { padding: 0 40px 40px; }
        .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6366f1; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 8px; }
        .section-title::before { content: ''; display: inline-block; width: 4px; height: 16px; background: linear-gradient(to bottom, #6366f1, #a855f7); border-radius: 2px; }
        .subject-card { background: white; border-radius: 10px; padding: 18px 20px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; }
        .subject-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .subject-name-col { display: flex; align-items: center; gap: 10px; }
        .subject-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .subject-name { font-weight: 700; font-size: 15px; }
        .subject-pct { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
        .progress-bar-bg { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
        .progress-bar-fill { height: 100%; border-radius: 4px; }
        .subject-card-stats { display: flex; gap: 16px; font-size: 12px; color: #64748b; flex-wrap: wrap; align-items: center; }
        .status-badge { padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: auto; }
        .log-table { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; margin-bottom: 8px; }
        .log-table th { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .log-table td { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .log-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .extra-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; background: #6366f1; color: white; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; }
        .footer { text-align: center; padding: 24px 40px; border-top: 2px solid #e2e8f0; margin-top: 20px; }
        .footer-brand { font-size: 16px; font-weight: 700; color: #6366f1; margin-bottom: 4px; }
        .footer-sub { color: #94a3b8; font-size: 11px; }
        .target-info { background: #f0f0ff; border: 1px solid #e0e0ff; border-radius: 8px; padding: 10px 16px; font-size: 12px; color: #4338ca; margin-bottom: 20px; font-weight: 500; }
        @media print { body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-badge">Attendance Report</div>
        <h1>AttenDO - ${semesterName}</h1>
        <p>Generated on ${dateStr}</p>
    </div>
    <div class="stats-bar">
        <div class="stat-card accent">
            <div class="stat-num">${overallPct}%</div>
            <div class="stat-label">Overall Attendance</div>
        </div>
        <div class="stat-card green">
            <div class="stat-num" style="color:#059669">${totalAttended}</div>
            <div class="stat-label">Classes Attended</div>
        </div>
        <div class="stat-card blue">
            <div class="stat-num" style="color:#4f46e5">${totalHeld}</div>
            <div class="stat-label">Total Classes</div>
        </div>
        <div class="stat-card orange">
            <div class="stat-num" style="color:#d97706">${subjects.length}</div>
            <div class="stat-label">Subjects</div>
        </div>
    </div>
    <div class="content">
        <div class="target-info">Target Attendance: <strong>${target}%</strong> ${overallSafe ? ' - You are meeting your target!' : ' - You are below your target.'}</div>
        <div class="section-title">Subject Breakdown</div>
        ${subjectCards}
        <div class="section-title">Attendance Log</div>
        <table class="log-table">
            <thead><tr><th>Date</th><th>Subject</th><th>Status</th></tr></thead>
            <tbody>${historyRows}</tbody>
        </table>

    </div>
    <div class="footer">
        <div class="footer-brand">AttenDO</div>
        <div class="footer-sub">Made with ❤️ by Subha - ${dateStr}</div>
    </div>
</body>
</html>`;
    },

    // ========================================
    // Utilities
    // ========================================

    /**
     * Generate unique ID
     * @returns {string}
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }
};

// Initialize on load
StorageManager.init();

// ========================================
// Firestore Sync Layer
// ========================================

const FirestoreSync = {
    _syncTimers: {},

    /**
     * Get user document reference
     */
    userRef(uid) {
        return db.collection('users').doc(uid);
    },

    /**
     * Check if user has data in Firestore
     */
    async hasData(uid) {
        try {
            const doc = await this.userRef(uid).collection('data').doc('subjects').get();
            return doc.exists;
        } catch (err) {
            console.error('Firestore hasData check failed:', err);
            return false;
        }
    },

    /**
     * Push all localStorage data to Firestore
     */
    async pushAll(uid) {
        if (!uid) return;

        try {
            const ref = this.userRef(uid).collection('data');
            const batch = db.batch();

            batch.set(ref.doc('subjects'), {
                items: StorageManager.getSubjects()
            });
            batch.set(ref.doc('timetable'), StorageManager.getTimetable());
            batch.set(ref.doc('history'), {
                items: StorageManager.getHistory()
            });
            batch.set(ref.doc('settings'), StorageManager.getSettings());
            batch.set(ref.doc('extraClasses'), {
                items: StorageManager.getExtraClasses()
            });
            batch.set(ref.doc('notes'), StorageManager.getNotes());
            batch.set(ref.doc('semesterArchives'), {
                items: StorageManager.getSemesterArchives()
            });

            await batch.commit();
            console.log('Data pushed to Firestore');
        } catch (err) {
            console.error('Firestore pushAll failed:', err);
        }
    },

    /**
     * Pull all data from Firestore into localStorage
     */
    async pullAll(uid) {
        if (!uid) return;

        try {
            const ref = this.userRef(uid).collection('data');
            const snapshot = await ref.get();

            snapshot.forEach(doc => {
                const data = doc.data();
                const key = doc.id;

                switch (key) {
                    case 'subjects':
                        StorageManager.setSubjects(data.items || [], true);
                        break;
                    case 'timetable':
                        // Remove Firestore metadata fields if any
                        const timetable = { ...data };
                        StorageManager.setTimetable(timetable, true);
                        break;
                    case 'history':
                        StorageManager.setHistory(data.items || [], true);
                        break;
                    case 'settings':
                        const settings = { ...StorageManager.DEFAULT_SETTINGS, ...data };
                        StorageManager.setSettings(settings, true);
                        break;
                    case 'extraClasses':
                        StorageManager.setExtraClasses(data.items || [], true);
                        break;
                    case 'notes':
                        StorageManager.setNotes(data || {}, true);
                        break;
                    case 'semesterArchives':
                        StorageManager.setSemesterArchives(data.items || [], true);
                        break;
                }
            });

            console.log('Data pulled from Firestore');
        } catch (err) {
            console.error('Firestore pullAll failed:', err);
        }
    },

    /**
     * Sync a specific key to Firestore (debounced)
     */
    syncKey(key) {
        if (!AuthManager || !AuthManager.currentUser) return;

        // Debounce — batch rapid writes
        clearTimeout(this._syncTimers[key]);
        this._syncTimers[key] = setTimeout(() => {
            this._doSync(key, AuthManager.currentUser.uid);
        }, 500);
    },

    async _doSync(key, uid) {
        try {
            const ref = this.userRef(uid).collection('data');
            let data;

            switch (key) {
                case 'subjects':
                    data = { items: StorageManager.getSubjects() };
                    break;
                case 'timetable':
                    data = StorageManager.getTimetable();
                    break;
                case 'history':
                    data = { items: StorageManager.getHistory() };
                    break;
                case 'settings':
                    data = StorageManager.getSettings();
                    break;
                case 'extraClasses':
                    data = { items: StorageManager.getExtraClasses() };
                    break;
                case 'notes':
                    data = StorageManager.getNotes();
                    break;
                case 'semesterArchives':
                    data = { items: StorageManager.getSemesterArchives() };
                    break;
                default:
                    return;
            }

            await ref.doc(key).set(data);
        } catch (err) {
            console.error(`Firestore sync failed for ${key}:`, err);
        }
    }
};

// ========================================
// Patch StorageManager setters for auto-sync
// ========================================

(function patchStorageForSync() {
    const original = {
        setSubjects: StorageManager.setSubjects.bind(StorageManager),
        setTimetable: StorageManager.setTimetable.bind(StorageManager),
        setHistory: StorageManager.setHistory.bind(StorageManager),
        setSettings: StorageManager.setSettings.bind(StorageManager),
        setExtraClasses: StorageManager.setExtraClasses.bind(StorageManager),
        setNotes: StorageManager.setNotes.bind(StorageManager),
        setSemesterArchives: StorageManager.setSemesterArchives.bind(StorageManager),
    };

    StorageManager.setSubjects = function (subjects, skipSync) {
        original.setSubjects(subjects);
        if (!skipSync) FirestoreSync.syncKey('subjects');
    };

    StorageManager.setTimetable = function (timetable, skipSync) {
        original.setTimetable(timetable);
        if (!skipSync) FirestoreSync.syncKey('timetable');
    };

    StorageManager.setHistory = function (history, skipSync) {
        original.setHistory(history);
        if (!skipSync) FirestoreSync.syncKey('history');
    };

    StorageManager.setSettings = function (settings, skipSync) {
        original.setSettings(settings);
        if (!skipSync) FirestoreSync.syncKey('settings');
    };

    StorageManager.setExtraClasses = function (extraClasses, skipSync) {
        original.setExtraClasses(extraClasses);
        if (!skipSync) FirestoreSync.syncKey('extraClasses');
    };

    StorageManager.setNotes = function (notes, skipSync) {
        original.setNotes(notes);
        if (!skipSync) FirestoreSync.syncKey('notes');
    };

    StorageManager.setSemesterArchives = function (archives, skipSync) {
        original.setSemesterArchives(archives);
        if (!skipSync) FirestoreSync.syncKey('semesterArchives');
    };
})();
