/**
 * Timetable Manager
 * Handles schedule management with custom time slots
 */

const TimetableManager = {

    /**
     * days mapping
     */
    DAYS: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],

    /**
     * Add a class to the timetable with custom time
     * @param {string} day 
     * @param {string} subjectId 
     * @param {string} startTime - HH:MM format
     * @param {string} endTime - HH:MM format (optional)
     */
    addClass(day, subjectId, startTime, endTime = null) {
        if (!subjectId || !startTime) return false;

        // Validate time format
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime)) return false;

        StorageManager.addToTimetable(day, {
            subjectId,
            time: startTime,
            endTime
        });
        return true;
    },

    /**
     * Remove class from timetable
     */
    removeClass(day, slotId) {
        StorageManager.removeFromTimetable(day, slotId);
    },

    /**
     * Get formatted schedule for a day
     * @param {string} day 
     */
    getScheduleForDay(day) {
        return StorageManager.getClassesForDay(day);
    },

    /**
     * Get sorted schedule for today
     */
    getTodaySchedule() {
        const todayIndex = new Date().getDay();
        const todayName = this.DAYS[todayIndex];
        return this.getScheduleForDay(todayName);
    },

    /**
     * Check if a subject exists in today's schedule
     * @param {string} subjectId 
     */
    isSubjectScheduledToday(subjectId) {
        const schedule = this.getTodaySchedule();
        return schedule.some(slot => slot.subjectId === subjectId);
    },

    /**
     * Get next occurrence of a subject
     * @param {string} subjectId 
     * @returns {Object|null} { day, time, daysFromNow }
     */
    getNextClass(subjectId) {
        const todayIndex = new Date().getDay();

        // Check next 7 days
        for (let i = 0; i < 7; i++) {
            const dayIndex = (todayIndex + i) % 7;
            const dayName = this.DAYS[dayIndex];
            const schedule = StorageManager.getClassesForDay(dayName);

            const found = schedule.find(slot => slot.subjectId === subjectId);

            if (found) {
                // If it's today, check if time has passed
                if (i === 0) {
                    const now = new Date();
                    const [hours, minutes] = found.time.split(':');
                    const classTime = new Date();
                    classTime.setHours(hours, minutes, 0);

                    if (classTime < now) continue; // Skip passed classes
                }

                return {
                    day: dayName,
                    time: found.time,
                    daysFromNow: i
                };
            }
        }
        return null;
    }
};
