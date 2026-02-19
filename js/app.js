/**
 * Main Application Controller
 * Handles initialization, navigation, and global events
 */

const App = {
    _initialized: false,

    init() {
        if (this._initialized) {
            // Already initialized — just refresh data
            DashboardUI.init();
            return;
        }
        this._initialized = true;

        this.setupNavigation();
        this.setupModal();
        this.setupChatbot();
        this.setupNotifications();
        this.checkRoute();

        // Initial Render
        DashboardUI.init();

        // Global tick for time updates
        setInterval(() => this.updateTime(), 60000);
        this.updateTime();
    },

    // ========================================
    // Navigation
    // ========================================

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-target');
                this.navigate(target);
            });
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
            });
        }

        // Close sidebar when tapping the overlay
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                document.querySelector('.sidebar').classList.remove('open');
                sidebarOverlay.classList.remove('active');
                document.body.style.overflow = '';
            });
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

            let classesHtml = dayClasses.map(slot => `
        <div class="timetable-slot-item" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); padding: var(--space-sm) var(--space-md); margin-bottom: var(--space-sm); border-radius: var(--radius-md); border-left: 3px solid ${slot.subject ? slot.subject.color : '#666'}">
          <div style="display:flex; flex-direction:column;">
            <span class="slot-time" style="font-size: var(--font-size-xs); color: var(--text-muted);">${slot.time}${slot.endTime ? ' - ' + slot.endTime : ''}</span>
            <span class="slot-subject" style="font-weight: 500;">${slot.subject ? slot.subject.name : 'Unknown Subject'}</span>
          </div>
          <button class="btn-icon-sm" style="background:none; border:none; color:var(--text-muted); cursor:pointer;" onclick="App.deleteSlot('${day}', '${slot.id}')">×</button>
        </div>
      `).join('');

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
        const modal = document.querySelector('.modal-overlay');
        const closeBtn = document.querySelector('.modal-close');

        if (modal && closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
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
        const today = new Date().toISOString().split('T')[0];

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
            alert("Please create a subject first!");
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
        // Default to yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const defaultDate = yesterday.toISOString().split('T')[0];

        const content = `
            <div class="form-group">
                <label class="form-label">Select Date</label>
                <input type="date" id="past-date-picker" class="form-input" 
                       value="${defaultDate}" max="${new Date().toISOString().split('T')[0]}"
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

        // If we modified today's data (edge case where user selects today in date picker), update dashboard
        const today = new Date().toISOString().split('T')[0];
        if (date === today) {
            DashboardUI.init();
        }
    },

    // ========================================
    // Extra Class (One-time classes)
    // ========================================

    openExtraClassModal(preSelectedDate = null) {
        const subjects = StorageManager.getSubjects();
        if (subjects.length === 0) {
            alert("Please create a subject first!");
            this.openAddSubjectModal();
            return;
        }

        const defaultDate = preSelectedDate || new Date().toISOString().split('T')[0];
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
            alert('Please fill in date, subject, and start time.');
            return;
        }

        StorageManager.addExtraClass(date, subjectId, time, endTime || null);
        document.querySelector('.modal-overlay').classList.remove('active');

        // Refresh relevant UI
        const today = new Date().toISOString().split('T')[0];
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
        if (confirm('Remove this class?')) {
            TimetableManager.removeClass(day, slotId);
            this.renderTimetablePage();
        }
    },

    deleteSubject(id) {
        if (confirm('Delete subject? This will remove all history and stats.')) {
            StorageManager.deleteSubject(id);
            this.renderTimetablePage();
            DashboardUI.init();
        }
    },

    // ========================================
    // Chatbot Integration
    // ========================================

    setupChatbot() {
        const fab = document.querySelector('.chat-fab');
        const window = document.querySelector('.chat-window');
        const close = document.querySelector('.chat-minimize');
        const input = document.getElementById('chat-input');
        const send = document.getElementById('chat-send');

        fab.addEventListener('click', () => {
            window.classList.toggle('active');
            fab.classList.toggle('active');
            // Lock/unlock body scroll
            document.body.style.overflow = window.classList.contains('active') ? 'hidden' : '';
            // Close sidebar if open
            document.querySelector('.sidebar').classList.remove('open');
            const sidebarOverlay = document.getElementById('sidebar-overlay');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        });

        if (close) {
            close.addEventListener('click', () => {
                window.classList.remove('active');
                fab.classList.remove('active');
                document.body.style.overflow = '';
            });
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

        send.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
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
        const todayKey = now.toISOString().split('T')[0];

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
        const todayKey = new Date().toISOString().split('T')[0];

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
                alert('Data imported successfully!');
                location.reload();
            } else {
                alert('Failed to import data. Invalid file.');
            }
        };
        reader.readAsText(file);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AuthManager.init();
});
