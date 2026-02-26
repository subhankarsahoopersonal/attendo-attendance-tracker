/**
 * Main Application Controller
 * Handles initialization, navigation, and global events
 */

const App = {
    _initialized: false,
    _listenerController: null,

    // ========================================
    // Custom Dialog (WebView-safe confirm/alert)
    // ========================================

    showCustomConfirm(message) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('custom-dialog-overlay');
            const msgEl = document.getElementById('custom-dialog-message');
            const okBtn = document.getElementById('custom-dialog-ok');
            const cancelBtn = document.getElementById('custom-dialog-cancel');

            msgEl.textContent = message;
            cancelBtn.style.display = '';
            overlay.classList.add('active');

            const cleanup = () => {
                overlay.classList.remove('active');
                okBtn.replaceWith(okBtn.cloneNode(true));
                cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            };

            document.getElementById('custom-dialog-ok').addEventListener('click', () => { cleanup(); resolve(true); });
            document.getElementById('custom-dialog-cancel').addEventListener('click', () => { cleanup(); resolve(false); });
        });
    },

    showCustomAlert(message) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('custom-dialog-overlay');
            const msgEl = document.getElementById('custom-dialog-message');
            const okBtn = document.getElementById('custom-dialog-ok');
            const cancelBtn = document.getElementById('custom-dialog-cancel');

            msgEl.textContent = message;
            cancelBtn.style.display = 'none';
            overlay.classList.add('active');

            const cleanup = () => {
                overlay.classList.remove('active');
                okBtn.replaceWith(okBtn.cloneNode(true));
            };

            document.getElementById('custom-dialog-ok').addEventListener('click', () => { cleanup(); resolve(); });
        });
    },

    init() {
        // Abort any previous event listeners from a prior session
        if (this._listenerController) {
            this._listenerController.abort();
        }
        this._listenerController = new AbortController();

        this.setupNavigation();
        this.setupModal();
        this.setupChatbot();

        if (!this._initialized) {
            this._initialized = true;
            this.setupNotifications();
            // Global tick for time updates
            setInterval(() => this.updateTime(), 60000);
        }

        this.checkRoute();

        // Initial Render
        DashboardUI.init();
        this.updateTime();
    },

    // ========================================
    // Navigation
    // ========================================

    setupNavigation() {
        const signal = this._listenerController.signal;
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-target');
                this.navigate(target);
            }, { signal });
        });

        // Mobile hamburger
        const hamburger = document.querySelector('.hamburger');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        if (hamburger) {
            hamburger.addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                sidebar.classList.toggle('open');
                const isOpen = sidebar.classList.contains('open');
                if (sidebarOverlay) sidebarOverlay.classList.toggle('active', isOpen);
                // Lock/unlock body scroll
                document.body.style.overflow = isOpen ? 'hidden' : '';
                // Close chatbot if open
                document.querySelector('.chat-window').classList.remove('active');
                document.querySelector('.chat-fab').classList.remove('active');
            }, { signal });
        }

        // Close sidebar when tapping the overlay
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                document.querySelector('.sidebar').classList.remove('open');
                sidebarOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }, { signal });
        }
    },

    navigate(pageId) {
        // Hide all sections
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));

        // Show target
        const targetEl = document.getElementById(`${pageId}-section`);
        if (targetEl) targetEl.classList.remove('hidden');

        // Update nav active state
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-target="${pageId}"]`);
        if (navItem) navItem.classList.add('active');

        // Trigger page specific renders
        if (pageId === 'dashboard') DashboardUI.init();
        if (pageId === 'timetable') this.renderTimetablePage();
        if (pageId === 'settings') this.renderSettingsPage();

        // Close mobile menu and overlay if open
        document.querySelector('.sidebar').classList.remove('open');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    },

    checkRoute() {
        // Simple hash routing
        const hash = window.location.hash.slice(1) || 'dashboard';
        this.navigate(hash);
    },

    // ========================================
    // Timetable Page Logic
    // ========================================

    renderTimetablePage() {
        const grid = document.getElementById('timetable-grid-content');
        if (!grid) return;

        grid.innerHTML = '';
        const timetable = StorageManager.getTimetable();
        const subjects = StorageManager.getSubjects();

        TimetableManager.DAYS.forEach(day => {
            const dayColumn = document.createElement('div');
            dayColumn.className = 'timetable-day-column';
            // Style handled by CSS class now, but keeping essential layout props just in case
            // dayColumn.style.cssText = '...'; 

            // Drag & Drop Attributes
            dayColumn.setAttribute('ondragover', 'App.handleDragOver(event)');
            dayColumn.setAttribute('ondrop', `App.handleDrop(event, '${day}')`);
            dayColumn.setAttribute('ondragleave', 'App.handleDragLeave(event)');

            const dayClasses = StorageManager.getClassesForDay(day);

            const notes = StorageManager.getNotes();
            let classesHtml = dayClasses.map(slot => {
                const hasNote = !!notes[slot.id];
                const noteText = notes[slot.id] || '';
                return `
        <div class="timetable-slot-item" style="display: flex; flex-wrap: wrap; background: var(--bg-card); padding: var(--space-sm) var(--space-md); margin-bottom: var(--space-sm); border-radius: var(--radius-md); border-left: 3px solid ${slot.subject ? slot.subject.color : '#666'}">
          <div style="display:flex; justify-content: space-between; align-items: center; width: 100%;">
            <div style="display:flex; flex-direction:column;">
              <span class="slot-time" style="font-size: var(--font-size-xs); color: var(--text-muted);">${slot.time}${slot.endTime ? ' - ' + slot.endTime : ''}</span>
              <span class="slot-subject" style="font-weight: 500;">${slot.subject ? slot.subject.name : 'Unknown Subject'}</span>
            </div>
            <div style="display:flex; align-items:center; gap: 4px;">
              <button class="btn-note ${hasNote ? 'has-note' : ''}" onclick="App.toggleSlotNote('${slot.id}')" title="${hasNote ? 'Edit note' : 'Add note'}">📝</button>
              <button class="btn-icon-sm" style="background:none; border:none; color:var(--text-muted); cursor:pointer;" onclick="App.deleteSlot('${day}', '${slot.id}')">×</button>
            </div>
          </div>
          <div class="slot-note-editor" id="note-editor-${slot.id}" style="display:none; width:100%;">
            <textarea class="slot-note-textarea" id="note-textarea-${slot.id}" placeholder="Add a recurring note for this class…" onblur="App.saveSlotNote('${slot.id}')">${noteText}</textarea>
          </div>
          ${hasNote ? `<div class="slot-note-preview" onclick="App.toggleSlotNote('${slot.id}')" title="Click to edit">📌 ${noteText}</div>` : ''}
        </div>
      `;
            }).join('');

            dayColumn.innerHTML = `
        <div class="day-header" style="text-transform: uppercase; font-size: var(--font-size-sm); font-weight: 600; color: var(--text-secondary); margin-bottom: var(--space-md); display:flex; justify-content:space-between; align-items:center;">
          ${day}
          <button class="btn-add-slot" style="background:var(--bg-card); border:none; border-radius:50%; width:24px; height:24px; cursor:pointer;" onclick="App.openAddSlotModal('${day}')">+</button>
        </div>
        <div class="day-slots">
          ${classesHtml}
        </div>
      `;
            grid.appendChild(dayColumn);
        });

        // Style the grid container
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-lg);';

        // Manage Subjects Section (Appending to bottom)
        let manageSection = document.getElementById('manage-subjects-section');
        if (!manageSection) {
            manageSection = document.createElement('div');
            manageSection.id = 'manage-subjects-section';
            manageSection.style.marginTop = 'var(--space-xl)';
            grid.parentElement.appendChild(manageSection);
        }

        manageSection.innerHTML = `
      <h3 style="margin-bottom: var(--space-md)">Manage Subjects (Drag & Drop to Schedule)</h3>
      <div id="manage-subjects-list" style="display: flex; flex-wrap: wrap; gap: var(--space-md);">
        ${subjects.map(sub => `
          <div class="manage-subject-item" draggable="true" ondragstart="App.handleDragStart(event, '${sub.id}')" style="background: var(--bg-glass); padding: var(--space-sm) var(--space-md); border-radius: var(--radius-full); display: flex; align-items: center; gap: var(--space-sm); border: 1px solid var(--border-color); cursor: grab;">
            <span class="subject-color-dot" style="width: 10px; height: 10px; border-radius: 50%; background:${sub.color}"></span>
            <span>${sub.name}</span>
            <button onclick="App.deleteSubject('${sub.id}')" style="background: none; border: none; color: var(--color-danger); cursor: pointer; margin-left: var(--space-sm);">×</button>
          </div>
        `).join('')}
      </div>
    `;
    },

    // ========================================
    // Drag & Drop Handlers
    // ========================================

    handleDragStart(e, subjectId) {
        e.dataTransfer.setData('text/plain', subjectId);
        e.dataTransfer.effectAllowed = 'copy';
    },

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        e.currentTarget.classList.add('drag-over');
    },

    handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    },

    handleDrop(e, day) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const subjectId = e.dataTransfer.getData('text/plain');
        if (subjectId) {
            this.openAddSlotModal(day, subjectId);
        }
    },

    // ========================================
    // Modal System
    // ========================================

    setupModal() {
        const signal = this._listenerController.signal;
        const modal = document.querySelector('.modal-overlay');
        const closeBtn = document.querySelector('.modal-close');

        if (modal && closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
            }, { signal });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            }, { signal });
        }
    },

    openModal(title, content) {
        const modal = document.querySelector('.modal-overlay');
        document.querySelector('.modal-title').textContent = title;
        document.querySelector('.modal-body').innerHTML = content;
        modal.classList.add('active');
    },

    // ========================================
    // Subject Attendance History
    // ========================================

    _historyMonth: null,
    _historyYear: null,
    _historySubjectId: null,

    openSubjectHistoryModal(subjectId) {
        const subject = StorageManager.getSubjectById(subjectId);
        if (!subject) return;

        // Default to current month
        const now = new Date();
        this._historyMonth = now.getMonth();
        this._historyYear = now.getFullYear();
        this._historySubjectId = subjectId;

        this.openModal(`${subject.name} — Attendance History`, '');
        this.renderSubjectHistory();
    },

    renderSubjectHistory() {
        const modalBody = document.querySelector('.modal-body');
        if (!modalBody) return;

        const subject = StorageManager.getSubjectById(this._historySubjectId);
        if (!subject) return;

        const history = StorageManager.getHistory().filter(h => h.subjectId === this._historySubjectId);
        const month = this._historyMonth;
        const year = this._historyYear;

        // Build date map for quick lookup: date => status
        const dateMap = {};
        history.forEach(h => {
            // If multiple entries same date, last one wins
            dateMap[h.date] = h.status;
        });

        // Month name
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        // Calendar heatmap
        const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = getLocalDateString();

        let calendarCells = '';

        // Day headers
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => {
            calendarCells += `<div class="cal-day-header">${d}</div>`;
        });

        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) {
            calendarCells += '<div class="cal-cell empty"></div>';
        }

        // Day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const status = dateMap[dateStr] || '';
            const isToday = dateStr === today;
            let statusClass = '';
            let tooltip = '';

            if (status === 'attended') {
                statusClass = 'attended';
                tooltip = 'Attended';
            } else if (status === 'missed') {
                statusClass = 'missed';
                tooltip = 'Missed';
            } else if (status === 'cancelled') {
                statusClass = 'cancelled';
                tooltip = 'Cancelled';
            }

            calendarCells += `<div class="cal-cell ${statusClass} ${isToday ? 'today' : ''}" title="${tooltip}">${day}</div>`;
        }

        // Build log entries (sorted newest first)
        const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date));

        let logHtml = '';
        if (sortedHistory.length === 0) {
            logHtml = '<div class="history-empty"><p class="text-muted">No attendance records yet.</p></div>';
        } else {
            logHtml = sortedHistory.map(entry => {
                const d = new Date(entry.date + 'T00:00:00');
                const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                let icon = '', statusLabel = '', statusClass = '';

                if (entry.status === 'attended') {
                    icon = '✅'; statusLabel = 'Attended'; statusClass = 'safe';
                } else if (entry.status === 'missed') {
                    icon = '❌'; statusLabel = 'Missed'; statusClass = 'danger';
                } else if (entry.status === 'cancelled') {
                    icon = '🟡'; statusLabel = 'Cancelled'; statusClass = 'warning';
                }

                return `
                    <div class="history-log-item">
                        <span class="history-log-date">${dateLabel}</span>
                        <span class="history-log-status ${statusClass}">${icon} ${statusLabel}</span>
                    </div>
                `;
            }).join('');
        }

        // Stats summary
        const attended = history.filter(h => h.status === 'attended').length;
        const missed = history.filter(h => h.status === 'missed').length;
        const cancelled = history.filter(h => h.status === 'cancelled').length;

        modalBody.innerHTML = `
            <div class="history-modal-content">
                <!-- Stats summary -->
                <div class="history-stats-row">
                    <div class="history-stat safe">
                        <span class="history-stat-num">${attended}</span>
                        <span class="history-stat-label">Attended</span>
                    </div>
                    <div class="history-stat danger">
                        <span class="history-stat-num">${missed}</span>
                        <span class="history-stat-label">Missed</span>
                    </div>
                    <div class="history-stat warning">
                        <span class="history-stat-num">${cancelled}</span>
                        <span class="history-stat-label">Cancelled</span>
                    </div>
                </div>

                <!-- Calendar Heatmap -->
                <div class="history-calendar">
                    <div class="cal-nav">
                        <button class="btn btn-ghost" onclick="App.changeHistoryMonth(-1)">◀</button>
                        <span class="cal-month-label">${monthNames[month]} ${year}</span>
                        <button class="btn btn-ghost" onclick="App.changeHistoryMonth(1)">▶</button>
                    </div>
                    <div class="cal-grid">
                        ${calendarCells}
                    </div>
                    <div class="cal-legend">
                        <span class="cal-legend-item"><span class="cal-dot attended"></span> Attended</span>
                        <span class="cal-legend-item"><span class="cal-dot missed"></span> Missed</span>
                        <span class="cal-legend-item"><span class="cal-dot cancelled"></span> Cancelled</span>
                    </div>
                </div>

                <!-- Log -->
                <div class="history-log">
                    <h4 class="history-log-title">All Records</h4>
                    <div class="history-log-list">
                        ${logHtml}
                    </div>
                </div>
            </div>
        `;
    },

    changeHistoryMonth(delta) {
        this._historyMonth += delta;
        if (this._historyMonth > 11) {
            this._historyMonth = 0;
            this._historyYear++;
        } else if (this._historyMonth < 0) {
            this._historyMonth = 11;
            this._historyYear--;
        }
        this.renderSubjectHistory();
    },

    openAddSubjectModal() {
        const formHtml = `
      <div class="form-group">
        <label class="form-label">Subject Name</label>
        <input type="text" id="new-subject-name" class="form-input" placeholder="e.g. Physics">
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-picker">
          ${['#6366f1', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'].map(c =>
            `<div class="color-option" style="background:${c}" onclick="App.selectColor(this, '${c}')"></div>`
        ).join('')}
        </div>
        <input type="hidden" id="new-subject-color" value="#6366f1">
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="App.saveNewSubject()">Create Subject</button>
      </div>
    `;
        this.openModal('Add New Subject', formHtml);
    },

    openAddSlotModal(day, preSelectedSubjectId = null) {
        const subjects = StorageManager.getSubjects();
        if (subjects.length === 0) {
            this.showCustomAlert("Please create a subject first!");
            this.openAddSubjectModal();
            return;
        }

        const options = subjects.map(s =>
            `<option value="${s.id}" ${s.id === preSelectedSubjectId ? 'selected' : ''}>${s.name}</option>`
        ).join('');

        const content = `
      <div class="form-group">
        <label class="form-label">Subject</label>
        <select id="slot-subject" class="form-input" style="color: var(--text-primary);">
          ${options}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Start Time</label>
        <input type="time" id="slot-time" class="form-input" value="09:30">
      </div>
       <div class="form-group">
        <label class="form-label">End Time (Optional)</label>
        <input type="time" id="slot-end-time" class="form-input">
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="App.saveTimeSlot('${day}')">Add to ${day}</button>
      </div>
    `;
        this.openModal(`Add Class for ${day}`, content);
    },

    openPastAttendanceModal() {
        // Default to yesterday (using local date to avoid UTC timezone issues)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const defaultDate = getLocalDateString(yesterday);

        const todayStr = getLocalDateString();

        const content = `
            <div class="form-group">
                <label class="form-label">Select Date</label>
                <input type="date" id="past-date-picker" class="form-input" 
                       value="${defaultDate}" max="${todayStr}"
                       onchange="App.renderPastClasses(this.value)">
            </div>
            <div id="past-classes-list" class="past-classes-list" style="margin-top: var(--space-md); min-height: 100px;">
                <!-- Classes will be injected here -->
            </div>
        `;

        this.openModal('Log Past Attendance', content);

        // Initial render for default date
        setTimeout(() => this.renderPastClasses(defaultDate), 100);
    },

    renderPastClasses(dateString) {
        const container = document.getElementById('past-classes-list');
        if (!container) return;

        const date = new Date(dateString);
        const dayName = TimetableManager.DAYS[date.getDay()];
        // Get classes for this date (recurring + extra)
        const schedule = StorageManager.getClassesForDate(dayName, dateString);

        // Get history for this specific date
        const history = StorageManager.getHistory().filter(h => h.date === dateString);

        // Build class list HTML
        let html = '';

        if (schedule.length === 0) {
            html = `
                <div class="empty-state" style="padding: var(--space-md); background: var(--bg-card);">
                    <p class="text-muted">No classes scheduled on ${dayName}s</p>
                </div>
            `;
        } else {
            html = schedule.map(slot => {
                const historyEntry = history.find(h => h.slotId === slot.id);
                const status = historyEntry ? historyEntry.status : null;
                const extraBadge = slot.isExtra ? '<span style="font-size: var(--font-size-xs); background: var(--accent-primary); color: white; padding: 2px 6px; border-radius: var(--radius-full); margin-left: var(--space-sm);">Extra</span>' : '';

                return `
                    <div class="class-item" style="border-bottom: 1px solid var(--border-color); padding: var(--space-sm) 0;">
                        <div class="class-info">
                            <div class="class-time">
                                <span>${slot.time}</span>
                            </div>
                            <div class="class-name">
                                 <span class="subject-color" style="background: ${slot.subject.color}"></span>
                                 ${slot.subject.name}${extraBadge}
                            </div>
                        </div>
                        <div class="class-actions">
                            <button class="btn btn-attended ${status === 'attended' ? 'active' : ''}" 
                                    onclick="App.markPastAttendance('${slot.id}', '${slot.subjectId}', 'attended', '${dateString}')"
                                    title="Attended">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </button>
                            <button class="btn btn-missed ${status === 'missed' ? 'active' : ''}" 
                                    onclick="App.markPastAttendance('${slot.id}', '${slot.subjectId}', 'missed', '${dateString}')"
                                    title="Missed">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                            <button class="btn btn-cancelled ${status === 'cancelled' ? 'active' : ''}" 
                                    onclick="App.markPastAttendance('${slot.id}', '${slot.subjectId}', 'cancelled', '${dateString}')"
                                    title="Cancelled">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Add "Add Extra Class" button at the bottom
        html += `
            <div style="margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid var(--border-color);">
                <button class="btn btn-secondary" onclick="App.openExtraClassModal('${dateString}')">
                    ➕ Add Extra Class for this date
                </button>
            </div>
        `;

        container.innerHTML = html;
    },

    markPastAttendance(slotId, subjectId, status, date) {
        StorageManager.markAttendance(slotId, subjectId, status, date);
        // Re-render to show active state
        this.renderPastClasses(date);

        // Always refresh dashboard stats since subject counts change regardless of date
        DashboardUI.renderSubjectStats();

        // If we modified today's data, also refresh today's class buttons
        const today = getLocalDateString();
        if (date === today) {
            DashboardUI.renderToday();
        }
    },

    // ========================================
    // Extra Class (One-time classes)
    // ========================================

    openExtraClassModal(preSelectedDate = null) {
        const subjects = StorageManager.getSubjects();
        if (subjects.length === 0) {
            this.showCustomAlert("Please create a subject first!");
            this.openAddSubjectModal();
            return;
        }

        const defaultDate = preSelectedDate || getLocalDateString();
        const options = subjects.map(s =>
            `<option value="${s.id}">${s.name}</option>`
        ).join('');

        const content = `
            <div class="form-group">
                <label class="form-label">Date</label>
                <input type="date" id="extra-class-date" class="form-input" value="${defaultDate}">
            </div>
            <div class="form-group">
                <label class="form-label">Subject</label>
                <select id="extra-class-subject" class="form-input" style="color: var(--text-primary);">
                    ${options}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Start Time</label>
                <input type="time" id="extra-class-time" class="form-input" value="10:00">
            </div>
            <div class="form-group">
                <label class="form-label">End Time (Optional)</label>
                <input type="time" id="extra-class-end-time" class="form-input">
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary" onclick="App.saveExtraClass()">Add Extra Class</button>
            </div>
        `;
        this.openModal('Add Extra Class', content);
    },

    saveExtraClass() {
        const date = document.getElementById('extra-class-date').value;
        const subjectId = document.getElementById('extra-class-subject').value;
        const time = document.getElementById('extra-class-time').value;
        const endTime = document.getElementById('extra-class-end-time').value;

        if (!date || !subjectId || !time) {
            this.showCustomAlert('Please fill in date, subject, and start time.');
            return;
        }

        StorageManager.addExtraClass(date, subjectId, time, endTime || null);
        document.querySelector('.modal-overlay').classList.remove('active');

        // Refresh relevant UI
        const today = getLocalDateString();
        if (date === today) {
            DashboardUI.init();
        }

        // If Log Past modal is open, refresh it
        const pastClassesList = document.getElementById('past-classes-list');
        if (pastClassesList) {
            this.renderPastClasses(date);
        }
    },

    selectColor(el, color) {
        document.querySelectorAll('.color-option').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        document.getElementById('new-subject-color').value = color;
    },

    saveNewSubject() {
        const name = document.getElementById('new-subject-name').value;
        const color = document.getElementById('new-subject-color').value;

        if (name) {
            StorageManager.addSubject({ name, color });
            document.querySelector('.modal-overlay').classList.remove('active');

            const activePage = document.querySelector('.nav-item.active').getAttribute('data-target');
            if (activePage === 'dashboard') DashboardUI.init();
            if (activePage === 'timetable') this.renderTimetablePage();
        }
    },

    saveTimeSlot(day) {
        const subjectId = document.getElementById('slot-subject').value;
        const time = document.getElementById('slot-time').value;
        const endTime = document.getElementById('slot-end-time').value;

        if (subjectId && time) {
            TimetableManager.addClass(day, subjectId, time, endTime);
            document.querySelector('.modal-overlay').classList.remove('active');
            this.renderTimetablePage();
        }
    },

    deleteSlot(day, slotId) {
        this.showCustomConfirm('Remove this class?').then(confirmed => {
            if (confirmed) {
                TimetableManager.removeClass(day, slotId);
                this.renderTimetablePage();
            }
        });
    },

    deleteSubject(id) {
        this.showCustomConfirm('Delete subject? This will remove all history and stats.').then(confirmed => {
            if (confirmed) {
                StorageManager.deleteSubject(id);
                this.renderTimetablePage();
                DashboardUI.init();
            }
        });
    },

    // ========================================
    // Slot Notes
    // ========================================

    toggleSlotNote(slotId) {
        const editor = document.getElementById(`note-editor-${slotId}`);
        if (!editor) return;
        const isVisible = editor.style.display !== 'none';
        editor.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            const textarea = document.getElementById(`note-textarea-${slotId}`);
            if (textarea) textarea.focus();
        }
    },

    saveSlotNote(slotId) {
        const textarea = document.getElementById(`note-textarea-${slotId}`);
        if (!textarea) return;
        StorageManager.setNote(slotId, textarea.value);
        // Re-render to update preview and icon state
        this.renderTimetablePage();
    },

    // ========================================
    // Chatbot Integration
    // ========================================

    setupChatbot() {
        const signal = this._listenerController.signal;
        const fab = document.querySelector('.chat-fab');
        const chatWin = document.querySelector('.chat-window');
        const close = document.querySelector('.chat-minimize');
        const input = document.getElementById('chat-input');
        const send = document.getElementById('chat-send');

        fab.addEventListener('click', () => {
            chatWin.classList.toggle('active');
            fab.classList.toggle('active');
            // Lock/unlock body scroll
            document.body.style.overflow = chatWin.classList.contains('active') ? 'hidden' : '';
            // Close sidebar if open
            document.querySelector('.sidebar').classList.remove('open');
            const sidebarOverlay = document.getElementById('sidebar-overlay');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        }, { signal });

        if (close) {
            close.addEventListener('click', () => {
                chatWin.classList.remove('active');
                fab.classList.remove('active');
                document.body.style.overflow = '';
            }, { signal });
        }

        const sendMessage = () => {
            const msg = input.value;
            if (!msg) return;

            this.addChatMessage(msg, 'user');
            input.value = '';

            setTimeout(() => {
                const response = Chatbot.process(msg);
                this.addChatMessage(response.text, 'bot');
            }, 600);
        };

        send.addEventListener('click', sendMessage, { signal });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        }, { signal });
    },

    addChatMessage(text, sender) {
        const container = document.querySelector('.chat-messages');
        const div = document.createElement('div');
        div.className = `chat-message ${sender}`;
        div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    // ========================================
    // Notifications & Settings
    // ========================================

    setupNotifications() {
        if ('Notification' in window) {
            if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                setTimeout(() => {
                    Notification.requestPermission();
                }, 5000);
            }
        }
        setInterval(() => this.checkNotificationSchedule(), 60000);
    },

    renderSettingsPage() {
        // We don't dynamically render settings yet, they are static in HTML
        // But we might want to populate values
        const settings = StorageManager.getSettings();
        // Implementation needed if we want to bind inputs to settings
    },

    // ========================================
    // Notifications
    // ========================================

    _notifiedSlots: new Set(),
    _notifiedAttendanceWarnings: new Set(),

    setupNotifications() {
        const settings = StorageManager.getSettings();
        if (!settings.notificationsEnabled) return;

        // Request permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        // Check every minute
        setInterval(() => this.checkNotificationSchedule(), 60000);
        // Run once on load
        setTimeout(() => {
            this.checkNotificationSchedule();
            this.checkAttendanceWarnings();
        }, 3000);
    },

    checkNotificationSchedule() {
        const settings = StorageManager.getSettings();
        if (!settings.notificationsEnabled) return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const todayKey = getLocalDateString(now);

        // --- Class reminders (30 min before) ---
        const classes = StorageManager.getTodayClasses();

        classes.forEach(slot => {
            if (!slot.subject || !slot.time) return;

            const notifKey = `${todayKey}_${slot.id}`;
            if (this._notifiedSlots.has(notifKey)) return;

            // Parse slot time "HH:MM"
            const [h, m] = slot.time.split(':').map(Number);
            const slotMinutes = h * 60 + m;
            const diff = slotMinutes - currentMinutes;

            // Notify if class is 25-35 minutes away (to allow for the 1-min check interval)
            if (diff > 0 && diff <= 35 && diff >= 25) {
                this._notifiedSlots.add(notifKey);
                this.sendNotification(
                    `📚 ${slot.subject.name} in 30 min!`,
                    `Your ${slot.subject.name} class is at ${slot.time}. Get ready!`
                );
            }
        });

        // --- Daily attendance reminder ---
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (currentTime === settings.notificationTime) {
            const notifKey = `${todayKey}_daily`;
            if (!this._notifiedSlots.has(notifKey)) {
                this._notifiedSlots.add(notifKey);
                this.sendNotification("AttenDO", "Don't forget to mark your attendance for today!");
            }
        }
    },

    checkAttendanceWarnings() {
        const settings = StorageManager.getSettings();
        if (!settings.notificationsEnabled) return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const subjects = StorageManager.getSubjects();
        const target = settings.targetAttendance || 75;
        const todayKey = getLocalDateString();

        subjects.forEach(subject => {
            if (subject.totalHeld === 0) return;

            const warnKey = `${todayKey}_warn_${subject.id}`;
            if (this._notifiedAttendanceWarnings.has(warnKey)) return;

            const percentage = AttendanceCalculator.getRawPercentage(subject);
            const margin = percentage - target;

            // Warn if attendance is within 5% of threshold (but still above)
            if (margin > 0 && margin <= 5) {
                this._notifiedAttendanceWarnings.add(warnKey);
                this.sendNotification(
                    `⚠️ ${subject.name} attendance dropping!`,
                    `${subject.name} is at ${percentage.toFixed(1)}% — only ${margin.toFixed(1)}% above your ${target}% target. Be careful!`
                );
            }
            // Warn if already below threshold
            else if (margin <= 0 && percentage > 0) {
                this._notifiedAttendanceWarnings.add(warnKey);
                const needed = AttendanceCalculator.getClassesToAttend(subject, target);
                this.sendNotification(
                    `🚨 ${subject.name} below target!`,
                    `${subject.name} is at ${percentage.toFixed(1)}%. Attend ${needed} more class${needed === 1 ? '' : 'es'} to recover.`
                );
            }
        });
    },

    sendNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body,
                icon: 'assets/icon.png',
                badge: 'assets/icon.png',
                vibrate: [200, 100, 200],
                tag: title // Prevent duplicate system notifications
            });
        }
    },

    // ========================================
    // Quick Setup Wizard
    // ========================================

    _quickSetupState: null,
    _quickSetupColors: ['#6366f1', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16'],
    _quickSetupDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],

    openQuickSetupWizard() {
        this._quickSetupState = {
            step: 1,
            subjects: [],
            selectedColor: this._quickSetupColors[0],
            slots: {}
        };
        // Pre-fill days
        this._quickSetupDays.forEach(d => this._quickSetupState.slots[d] = []);

        this.openModal('⚡ Quick Setup', '');
        this.renderQuickSetup();
    },

    renderQuickSetup() {
        const modalBody = document.querySelector('.modal-body');
        if (!modalBody || !this._quickSetupState) return;
        const state = this._quickSetupState;
        const step = state.step;

        // Stepper
        const stepLabels = ['Subjects', 'Timetable', 'Review'];
        const stepperHtml = `
          <div class="qs-stepper">
            ${stepLabels.map((label, i) => {
            const num = i + 1;
            const cls = num < step ? 'completed' : (num === step ? 'active' : '');
            return `
                <div class="qs-step ${cls}">
                  <span class="qs-step-num">${num < step ? '✓' : num}</span>
                  <span>${label}</span>
                </div>
                ${i < stepLabels.length - 1 ? `<div class="qs-step-line ${num < step ? 'completed' : ''}"></div>` : ''}
              `;
        }).join('')}
          </div>
        `;

        let bodyHtml = '';

        // === STEP 1: Subjects ===
        if (step === 1) {
            const colorDots = this._quickSetupColors.map(c =>
                `<div class="qs-color-dot ${c === state.selectedColor ? 'selected' : ''}" style="background:${c}" onclick="App.quickSetupSelectColor('${c}')"></div>`
            ).join('');

            const chips = state.subjects.map((s, i) =>
                `<div class="qs-chip">
                    <span class="qs-chip-color" style="background:${s.color}"></span>
                    <span>${s.name}</span>
                    <button class="qs-chip-del" onclick="App.quickSetupRemoveSubject(${i})">×</button>
                </div>`
            ).join('');

            bodyHtml = `
              <div class="qs-subject-form">
                <div class="form-group" style="flex:1">
                  <label class="form-label">Subject Name</label>
                  <input type="text" id="qs-subject-name" class="form-input" placeholder="e.g. Physics" onkeydown="if(event.key==='Enter'){event.preventDefault();App.quickSetupAddSubject()}">
                </div>
                <div class="form-group">
                  <label class="form-label">Color</label>
                  <div class="qs-color-row">${colorDots}</div>
                </div>
                <button class="btn btn-primary" onclick="App.quickSetupAddSubject()" style="height:38px;margin-bottom:0;">Add</button>
              </div>
              <div class="qs-chips">${chips}</div>
              <p class="qs-hint">${state.subjects.length === 0 ? 'Add at least one subject to continue' : `${state.subjects.length} subject${state.subjects.length > 1 ? 's' : ''} added — add more or click Next`}</p>
            `;
        }

        // === STEP 2: Timetable Grid ===
        else if (step === 2) {
            const subjectOptions = state.subjects.map((s, i) =>
                `<option value="${i}">${s.name}</option>`
            ).join('');

            const dayColumns = this._quickSetupDays.map(day => {
                const daySlots = state.slots[day];
                let slotsHtml = '';

                if (daySlots.length === 0) {
                    slotsHtml = `<div class="qs-day-empty">No classes — click + to add</div>`;
                } else {
                    slotsHtml = daySlots.map((slot, idx) => `
                      <div class="qs-slot-row">
                        <select onchange="App.quickSetupUpdateSlot('${day}',${idx},'subjectIdx',this.value)">
                          ${state.subjects.map((s, si) =>
                        `<option value="${si}" ${si === slot.subjectIdx ? 'selected' : ''}>${s.name}</option>`
                    ).join('')}
                        </select>
                        <input type="time" value="${slot.startTime}" onchange="App.quickSetupUpdateSlot('${day}',${idx},'startTime',this.value)">
                        <input type="time" value="${slot.endTime || ''}" onchange="App.quickSetupUpdateSlot('${day}',${idx},'endTime',this.value)" placeholder="End">
                        <button class="qs-slot-del" onclick="App.quickSetupRemoveSlot('${day}',${idx})">×</button>
                      </div>
                    `).join('');
                }

                return `
                  <div class="qs-day-col">
                    <div class="qs-day-header">
                      <span>${day.slice(0, 3)}</span>
                      <button class="qs-day-add" onclick="App.quickSetupAddSlot('${day}')">+</button>
                    </div>
                    ${slotsHtml}
                  </div>
                `;
            }).join('');

            bodyHtml = `
              <div class="qs-grid">${dayColumns}</div>
              <p class="qs-hint">Click + on each day to add classes. You can skip days with no classes.</p>
            `;
        }

        // === STEP 3: Review ===
        else if (step === 3) {
            const subjectChips = state.subjects.map(s =>
                `<div class="qs-chip"><span class="qs-chip-color" style="background:${s.color}"></span><span>${s.name}</span></div>`
            ).join('');

            const totalSlots = Object.values(state.slots).reduce((sum, arr) => sum + arr.length, 0);

            let scheduleHtml = '';
            const hasAnySlots = totalSlots > 0;

            if (!hasAnySlots) {
                scheduleHtml = `<div class="qs-review-empty">No classes scheduled. You can add them later from the timetable page.</div>`;
            } else {
                this._quickSetupDays.forEach(day => {
                    const daySlots = state.slots[day];
                    if (daySlots.length === 0) return;

                    const slotRows = daySlots.map(slot => {
                        const subj = state.subjects[slot.subjectIdx];
                        return `
                          <div class="qs-review-slot">
                            <span class="qs-chip-color" style="background:${subj.color}"></span>
                            <span>${subj.name}</span>
                            <span style="color:var(--text-muted)">•</span>
                            <span style="color:var(--text-muted)">${slot.startTime}${slot.endTime ? ' – ' + slot.endTime : ''}</span>
                          </div>
                        `;
                    }).join('');

                    scheduleHtml += `
                      <div class="qs-review-day">
                        <div class="qs-review-day-name">${day}</div>
                        ${slotRows}
                      </div>
                    `;
                });
            }

            bodyHtml = `
              <div class="qs-review">
                <div class="qs-review-section">
                  <div class="qs-review-title">📚 ${state.subjects.length} Subject${state.subjects.length > 1 ? 's' : ''}</div>
                  <div class="qs-review-subjects">${subjectChips}</div>
                </div>
                <div class="qs-review-section">
                  <div class="qs-review-title">📅 ${totalSlots} Class${totalSlots !== 1 ? 'es' : ''} / Week</div>
                  ${scheduleHtml}
                </div>
              </div>
            `;
        }

        // Footer navigation
        const footerHtml = `
          <div class="qs-footer">
            ${step > 1 ? `<button class="btn btn-ghost" onclick="App.quickSetupPrevStep()">← Back</button>` : `<div></div>`}
            ${step < 3
                ? `<button class="btn btn-primary" onclick="App.quickSetupNextStep()" ${step === 1 && state.subjects.length === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>Next →</button>`
                : `<button class="btn btn-primary" onclick="App.quickSetupSave()">🚀 Save & Start</button>`
            }
          </div>
        `;

        modalBody.innerHTML = stepperHtml + bodyHtml + footerHtml;

        // Auto-focus the subject name input on step 1
        if (step === 1) {
            setTimeout(() => {
                const input = document.getElementById('qs-subject-name');
                if (input) input.focus();
            }, 100);
        }
    },

    quickSetupSelectColor(color) {
        if (!this._quickSetupState) return;
        this._quickSetupState.selectedColor = color;
        // Update dots without full re-render for snappiness
        document.querySelectorAll('.qs-color-dot').forEach(dot => {
            dot.classList.toggle('selected', dot.style.background === color || dot.style.backgroundColor === color);
        });
    },

    quickSetupAddSubject() {
        if (!this._quickSetupState) return;
        const input = document.getElementById('qs-subject-name');
        const name = input ? input.value.trim() : '';
        if (!name) return;

        // Check duplicate
        if (this._quickSetupState.subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
            input.style.borderColor = 'var(--color-danger)';
            setTimeout(() => input.style.borderColor = '', 1000);
            return;
        }

        this._quickSetupState.subjects.push({
            name,
            color: this._quickSetupState.selectedColor
        });

        // Auto-cycle to next color
        const currentIdx = this._quickSetupColors.indexOf(this._quickSetupState.selectedColor);
        this._quickSetupState.selectedColor = this._quickSetupColors[(currentIdx + 1) % this._quickSetupColors.length];

        this.renderQuickSetup();
    },

    quickSetupRemoveSubject(index) {
        if (!this._quickSetupState) return;
        this._quickSetupState.subjects.splice(index, 1);

        // Also remove any slots referencing this subject and adjust indexes
        this._quickSetupDays.forEach(day => {
            this._quickSetupState.slots[day] = this._quickSetupState.slots[day]
                .filter(slot => slot.subjectIdx !== index)
                .map(slot => ({
                    ...slot,
                    subjectIdx: slot.subjectIdx > index ? slot.subjectIdx - 1 : slot.subjectIdx
                }));
        });

        this.renderQuickSetup();
    },

    quickSetupNextStep() {
        if (!this._quickSetupState) return;
        if (this._quickSetupState.step === 1 && this._quickSetupState.subjects.length === 0) return;
        this._quickSetupState.step = Math.min(3, this._quickSetupState.step + 1);
        this.renderQuickSetup();
    },

    quickSetupPrevStep() {
        if (!this._quickSetupState) return;
        this._quickSetupState.step = Math.max(1, this._quickSetupState.step - 1);
        this.renderQuickSetup();
    },

    quickSetupAddSlot(day) {
        if (!this._quickSetupState) return;
        this._quickSetupState.slots[day].push({
            subjectIdx: 0,
            startTime: '09:30',
            endTime: ''
        });
        this.renderQuickSetup();
    },

    quickSetupUpdateSlot(day, index, field, value) {
        if (!this._quickSetupState) return;
        const slot = this._quickSetupState.slots[day][index];
        if (!slot) return;
        if (field === 'subjectIdx') {
            slot.subjectIdx = parseInt(value);
        } else {
            slot[field] = value;
        }
    },

    quickSetupRemoveSlot(day, index) {
        if (!this._quickSetupState) return;
        this._quickSetupState.slots[day].splice(index, 1);
        this.renderQuickSetup();
    },

    quickSetupSave() {
        if (!this._quickSetupState) return;
        const state = this._quickSetupState;

        // 1. Create all subjects and map temp index → real ID
        const idMap = {};
        state.subjects.forEach((sub, idx) => {
            const created = StorageManager.addSubject({ name: sub.name, color: sub.color });
            idMap[idx] = created.id;
        });

        // 2. Create all timetable slots
        this._quickSetupDays.forEach(day => {
            state.slots[day].forEach(slot => {
                const realSubjectId = idMap[slot.subjectIdx];
                if (realSubjectId && slot.startTime) {
                    TimetableManager.addClass(day, realSubjectId, slot.startTime, slot.endTime || null);
                }
            });
        });

        // 3. Close and refresh
        this._quickSetupState = null;
        document.querySelector('.modal-overlay').classList.remove('active');
        this.renderTimetablePage();
        DashboardUI.init();
    },

    // ========================================
    // Utils
    // ========================================

    updateTime() {
        const el = document.getElementById('current-date');
        if (el) {
            const options = { weekday: 'long', month: 'short', day: 'numeric' };
            el.textContent = new Date().toLocaleDateString('en-US', options);
        }
    },

    exportData() {
        const data = StorageManager.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `attendo-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    },

    triggerImport() {
        document.getElementById('import-file').click();
    },

    handleImportFile(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const success = StorageManager.importData(e.target.result);
            if (success) {
                this.showCustomAlert('Data imported successfully!').then(() => location.reload());
            } else {
                this.showCustomAlert('Failed to import data. Invalid file.');
            }
        };
        reader.readAsText(file);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AuthManager.init();
});
