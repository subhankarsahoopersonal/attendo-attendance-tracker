/**
 * Dashboard UI Manager
 * Handles rendering of the main dashboard components
 */

const DashboardUI = {

  init() {
    this.renderToday();
    this.renderSubjectStats();
    this.setupEventListeners();
  },

  /**
   * Render "Today's Classes" section
   */
  renderToday() {
    const container = document.getElementById('today-classes-list');
    if (!container) return;

    container.innerHTML = '';
    const classes = StorageManager.getTodayClasses();

    if (classes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">😴</div>
          <h3>No classes today</h3>
          <p>Enjoy your free time!</p>
        </div>
      `;
      return;
    }

    classes.forEach(slot => {
      const subject = slot.subject;
      if (!subject) return;

      const noteText = StorageManager.getNote(slot.id);
      const el = document.createElement('div');
      el.className = `class-item ${slot.status ? 'marked' : ''}`;
      el.innerHTML = `
        <div class="class-info">
          <div class="class-time">
            <span>${slot.time}</span>
            ${slot.endTime ? `<span class="text-muted text-xs">-${slot.endTime}</span>` : ''}
          </div>
          <div>
            <div class="class-name">
              <span class="subject-color" style="background: ${subject.color}"></span>
              ${subject.name}
            </div>
            ${noteText ? `<div class="class-note-display">📌 ${noteText}</div>` : ''}
          </div>
        </div>
        <div class="class-actions">
          <button class="btn btn-attended ${slot.status === 'attended' ? 'active' : ''}" 
                  onclick="DashboardUI.mark('${slot.id}', '${subject.id}', 'attended')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Attended
          </button>
          <button class="btn btn-missed ${slot.status === 'missed' ? 'active' : ''}" 
                  onclick="DashboardUI.mark('${slot.id}', '${subject.id}', 'missed')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            Missed
          </button>
          <button class="btn btn-cancelled ${slot.status === 'cancelled' ? 'active' : ''}" 
                  onclick="DashboardUI.mark('${slot.id}', '${subject.id}', 'cancelled')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
          </button>
        </div>
      `;
      container.appendChild(el);
    });
  },

  /**
   * Render Subject Cards
   */
  renderSubjectStats() {
    const container = document.getElementById('subject-stats-grid');
    if (!container) return;

    container.innerHTML = '';
    const subjects = StorageManager.getSubjects();
    const settings = StorageManager.getSettings();

    if (subjects.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1">
          <h3>No subjects added yet</h3>
          <p>Go to the Timetable tab to set up your subjects.</p>
        </div>
      `;
      return;
    }

    subjects.forEach(subject => {
      const percentage = AttendanceCalculator.getRawPercentage(subject);
      const status = AttendanceCalculator.getStatus(subject, settings.targetAttendance);

      const el = document.createElement('div');
      el.className = 'subject-card';
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => App.openSubjectHistoryModal(subject.id));
      el.innerHTML = `
        <div class="subject-header">
          <div class="subject-name">
            <span class="subject-color" style="background: ${subject.color}"></span>
            ${subject.name}
          </div>
          <div class="subject-percentage ${status.status}">
            ${percentage.toFixed(1)}%
          </div>
        </div>
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill ${status.status}" style="width: ${percentage}%"></div>
          </div>
          <div class="progress-stats">
            <span>${subject.attended} / ${subject.totalHeld} classes</span>
            <span>Target: ${settings.targetAttendance}%</span>
          </div>
        </div>
        <div class="bunk-budget ${status.status}">
          <span>${status.status === 'safe' ? '🎯' : '⚠️'}</span>
          ${status.message}
        </div>
      `;
      container.appendChild(el);
    });

    // Update Quick Stats Overview if present
    this.updateQuickStats();
  },

  /**
   * Handle attendance marking
   */
  mark(slotId, subjectId, status) {
    StorageManager.markAttendance(slotId, subjectId, status);

    // Refresh UI
    this.renderToday();
    this.renderSubjectStats();

    // Check if attendance dropped near threshold
    App.checkAttendanceWarnings();
  },

  updateQuickStats() {
    const subjects = StorageManager.getSubjects();
    const totalSubjects = subjects.length;
    let safeSubjects = 0;
    let totalClasses = 0;
    let totalAttended = 0;

    subjects.forEach(sub => {
      if (AttendanceCalculator.getRawPercentage(sub) >= 75) safeSubjects++;
      totalClasses += sub.totalHeld;
      totalAttended += sub.attended;
    });

    const overallPercentage = totalClasses > 0 ? ((totalAttended / totalClasses) * 100).toFixed(1) : 0;

    const elSafe = document.getElementById('qs-safe-count');
    const elTotal = document.getElementById('qs-total-subjects');
    const elAttended = document.getElementById('qs-total-classes');
    const elOverall = document.getElementById('qs-overall-percentage');

    if (elSafe) elSafe.textContent = safeSubjects;
    if (elTotal) elTotal.textContent = totalSubjects;
    if (elAttended) elAttended.textContent = totalClasses;
    if (elOverall) elOverall.textContent = `${overallPercentage}%`;
  },

  setupEventListeners() {
    // Add any dashboard-specific listeners here
  }
};
