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
        NOTES: 'bunkManager_notes'
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
            time: classData.time
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
        });
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
     * Clear all data
     */
    clearAllData() {
        Object.values(this.KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        this.init();
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
})();
