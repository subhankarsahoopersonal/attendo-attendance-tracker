/**
 * Attendance Calculator - The "Math Brain" of AttenDO
 * Handles all logic for 75% attendance criteria
 */

const AttendanceCalculator = {

    /**
     * Calculate current attendance percentage
     * @param {number} attended - Classes attended
     * @param {number} total - Total classes held
     * @returns {string} Formatted percentage (e.g. "75.0%")
     */
    calculatePercentage(attended, total) {
        if (total === 0) return "100%";
        return ((attended / total) * 100).toFixed(1) + "%";
    },

    /**
     * Get raw percentage value
     * @param {Object} subject 
     * @returns {number} Percentage value (0-100)
     */
    getRawPercentage(subject) {
        if (subject.totalHeld === 0) return 100;
        return (subject.attended / subject.totalHeld) * 100;
    },

    /**
     * Calculate safe zone stats (How many can I skip?)
     * logic: (Attended) / (Total + X) >= 0.75
     * @param {Object} subject 
     * @param {number} target - Target percentage (default 75)
     * @returns {number} Number of classes skidpable
     */
    getClassesToSkip(subject, target = 75) {
        const targetRatio = target / 100;
        const { attended, totalHeld } = subject;

        // If not enough data, return 0
        if (totalHeld === 0) return 0;

        // Formula derived: X = (Attended / Target) - Total
        const maxTotal = attended / targetRatio;
        const canSkip = Math.floor(maxTotal - totalHeld);

        return Math.max(0, canSkip);
    },

    /**
     * Calculate danger zone stats (How many must I attend?)
     * logic: (Attended + Y) / (Total + Y) >= 0.75
     * @param {Object} subject 
     * @param {number} target - Target percentage (default 75)
     * @returns {number} Number of classes needed
     */
    getClassesToAttend(subject, target = 75) {
        const targetRatio = target / 100;
        const { attended, totalHeld } = subject;

        // If already above target, return 0
        if (this.getRawPercentage(subject) >= target) return 0;

        // Formula derived: Y = (Target * Total - Attended) / (1 - Target)
        const numerator = (targetRatio * totalHeld) - attended;
        const denominator = 1 - targetRatio;
        const needed = Math.ceil(numerator / denominator);

        return Math.max(0, needed);
    },

    /**
     * Get status object for UI display
     * @param {Object} subject 
     * @param {number} target - Target percentage
     * @returns {Object} { status: 'safe'|'warning'|'danger', message: string, color: string }
     */
    getStatus(subject, target = 75) {
        const percentage = this.getRawPercentage(subject);

        if (percentage >= target) {
            const skippable = this.getClassesToSkip(subject, target);
            if (skippable > 0) {
                return {
                    status: 'safe',
                    message: `You can bunk ${skippable} more class${skippable === 1 ? '' : 'es'}`,
                    color: 'var(--color-safe)'
                };
            } else {
                return {
                    status: 'warning',
                    message: 'Borderline! Don\'t miss the next class.',
                    color: 'var(--color-warning)'
                };
            }
        } else {
            const needed = this.getClassesToAttend(subject, target);
            return {
                status: 'danger',
                message: `Attend next ${needed} class${needed === 1 ? '' : 'es'} to recover`,
                color: 'var(--color-danger)'
            };
        }
    },

    /**
     * Simulate "What if?" scenario
     * @param {Object} subject 
     * @param {string} action - 'skip' (miss next) or 'attend' (attend next)
     * @returns {Object} Prediction result
     */
    simulate(subject, action) {
        const simulated = { ...subject };

        if (action === 'skip') {
            simulated.totalHeld += 1;
        } else if (action === 'attend') {
            simulated.attended += 1;
            simulated.totalHeld += 1;
        }

        const oldPct = this.getRawPercentage(subject).toFixed(1);
        const newPct = this.getRawPercentage(simulated).toFixed(1);

        return {
            oldPercentage: oldPct,
            newPercentage: newPct,
            dropped: parseFloat(newPct) < parseFloat(oldPct),
            breakThreshold: parseFloat(newPct) < 75 && parseFloat(oldPct) >= 75
        };
    }
};
