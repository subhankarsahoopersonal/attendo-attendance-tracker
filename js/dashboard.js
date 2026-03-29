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

  // SVG icons used in swipe indicators
  _ICONS: {
    check: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>`,
    cross: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>`
  },

  // Swipe threshold in pixels
  SWIPE_THRESHOLD: 80,

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
      el.className = `class-item swipeable ${slot.status ? 'marked' : ''}`;

      el.innerHTML = `
        <div class="swipe-indicator swipe-indicator-right">
          ${this._ICONS.check}
          <span style="margin-left: var(--space-sm)">Attended</span>
        </div>
        <div class="swipe-indicator swipe-indicator-left">
          <span style="margin-right: var(--space-sm)">Missed</span>
          ${this._ICONS.cross}
        </div>
        <div class="swipe-content">
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
        </div>
      `;

      // Store slot data for swipe handler
      el.dataset.slotId = slot.id;
      el.dataset.subjectId = subject.id;

      container.appendChild(el);
    });

    // Attach swipe handlers
    this.setupSwipeHandlers();

    // Auto-animated swipe demo once per session (touch devices only)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice && !localStorage.getItem('swipeDemoShown') && classes.length > 0) {
      localStorage.setItem('swipeDemoShown', '1');
      setTimeout(() => {
        // Query DOM inside timeout so we get the final rendered elements
        // (renderToday can be called twice during init, destroying earlier elements)
        const firstItem = container.querySelector('.class-item.swipeable');
        if (!firstItem) return;
        const demoContent = firstItem.querySelector('.swipe-content');
        const demoRight = firstItem.querySelector('.swipe-indicator-right');
        const demoLeft = firstItem.querySelector('.swipe-indicator-left');
        if (!demoContent) return;

        // Slide right — show "Attended"
        demoContent.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        demoContent.style.transform = 'translateX(90px)';
        if (demoRight) demoRight.classList.add('visible');

        setTimeout(() => {
          // Slide left — show "Missed"
          demoContent.style.transform = 'translateX(-90px)';
          if (demoRight) demoRight.classList.remove('visible');
          if (demoLeft) demoLeft.classList.add('visible');

          setTimeout(() => {
            // Snap back to center
            demoContent.style.transform = '';
            if (demoLeft) demoLeft.classList.remove('visible');

            // Clean up inline transition
            setTimeout(() => {
              demoContent.style.transition = '';
            }, 400);
          }, 700);
        }, 700);
      }, 800);
    }
  },

  /**
   * Set up touch swipe handlers on all swipeable class items
   */
  setupSwipeHandlers() {
    const items = document.querySelectorAll('.class-item.swipeable');

    items.forEach(item => {
      const content = item.querySelector('.swipe-content');
      const indicatorRight = item.querySelector('.swipe-indicator-right');
      const indicatorLeft = item.querySelector('.swipe-indicator-left');
      if (!content) return;

      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let isTracking = false;
      let directionLocked = false;
      let isHorizontal = false;

      const onTouchStart = (e) => {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        currentX = 0;
        isTracking = true;
        directionLocked = false;
        isHorizontal = false;
        content.classList.add('swiping');
      };

      const onTouchMove = (e) => {
        if (!isTracking) return;
        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        // Lock direction after 10px of movement
        if (!directionLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
          directionLocked = true;
          isHorizontal = Math.abs(dx) > Math.abs(dy);
          if (!isHorizontal) {
            // Vertical scroll — bail out
            isTracking = false;
            content.classList.remove('swiping');
            content.style.transform = '';
            indicatorRight.classList.remove('visible');
            indicatorLeft.classList.remove('visible');
            return;
          }
        }

        if (!isHorizontal) return;

        // Prevent vertical scrolling while swiping horizontally
        e.preventDefault();

        // Apply resistance: diminishing returns past threshold
        const maxDrag = 200;
        const ratio = Math.min(Math.abs(dx) / maxDrag, 1);
        currentX = maxDrag * ratio * Math.sign(dx);

        content.style.transform = `translateX(${currentX}px)`;

        // Show/hide indicators
        const pastThreshold = Math.abs(currentX) >= this.SWIPE_THRESHOLD;
        if (currentX > 0) {
          indicatorRight.classList.toggle('visible', pastThreshold);
          indicatorLeft.classList.remove('visible');
        } else if (currentX < 0) {
          indicatorLeft.classList.toggle('visible', pastThreshold);
          indicatorRight.classList.remove('visible');
        }
      };

      const onTouchEnd = () => {
        if (!isTracking) return;
        isTracking = false;
        content.classList.remove('swiping');

        // If a horizontal swipe was detected, block the upcoming button click
        if (isHorizontal && directionLocked) {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
          }, { capture: true, once: true });
        }

        const slotId = item.dataset.slotId;
        const subjectId = item.dataset.subjectId;

        if (Math.abs(currentX) >= this.SWIPE_THRESHOLD) {
          // Threshold met — trigger action
          const action = currentX > 0 ? 'attended' : 'missed';

          // Slide off screen before marking
          content.style.transform = `translateX(${currentX > 0 ? '120%' : '-120%'})`;
          setTimeout(() => {
            this.mark(slotId, subjectId, action);
          }, 200);
        } else {
          // Snap back
          content.style.transform = '';
          indicatorRight.classList.remove('visible');
          indicatorLeft.classList.remove('visible');
        }
      };

      item.addEventListener('touchstart', onTouchStart, { passive: true });
      item.addEventListener('touchmove', onTouchMove, { passive: false });
      item.addEventListener('touchend', onTouchEnd, { passive: true });
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
    // 1. Save to your local cache instantly (Instant UI response)
    StorageManager.markAttendance(slotId, subjectId, status);

    // Refresh UI immediately so the user feels no lag
    this.renderToday();
    this.renderSubjectStats();
    App.checkAttendanceWarnings();

    // 2. ⚡ FEED THE FIREBASE QUEUE!
    // We get the current user ID, and tell Firebase to save the new state.
    const currentUser = firebase.auth().currentUser;
    if (currentUser) {
      // If offline, Firebase catches this, queues it, and waits for internet!
      // We don't use 'await' here because we want it to happen silently in the background.
      FirestoreSync.pushAll(currentUser.uid).catch(err => {
        console.log("Offline mode: Firebase has queued your attendance mark.");
      });
    }
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

    // ==========================================
    // ANDROID WIDGET BRIDGE
    // ==========================================
    try {
      if (window.AttendoApp) {
        const cleanPercentage = String(overallPercentage || 0);
        let nextClassString = "No more classes today! 🥳";
        let upcomingNote = ""; // Moved up here so it exists globally

        // 1. Get all classes for today
        const todayClasses = StorageManager.getTodayClasses();

        // If we have classes, figure out which one is next
        if (todayClasses && todayClasses.length > 0) {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();

          let upcomingClass = null;

          for (const cls of todayClasses) {
            const timeMatch = (cls.time || "").match(/(\d+):(\d+)/);
            if (timeMatch) {
              let classHours = parseInt(timeMatch[1], 10);
              const classMins = parseInt(timeMatch[2], 10);

              const timeStr = cls.time.toLowerCase();
              if (timeStr.includes("pm") && classHours < 12) classHours += 12;
              if (timeStr.includes("am") && classHours === 12) classHours = 0;

              const classMinutesFromMidnight = (classHours * 60) + classMins;

              if (classMinutesFromMidnight > currentMinutes) {
                upcomingClass = cls;
                break;
              }
            }
          }

          if (upcomingClass && upcomingClass.subject) {
            nextClassString = `${upcomingClass.subject.name} (${upcomingClass.time})`;

            try {
              if (upcomingClass.noteText) {
                upcomingNote = upcomingClass.noteText;
              } else if (typeof StorageManager !== 'undefined' && upcomingClass.id) {
                const fetchedNote = StorageManager.getNote(upcomingClass.id);
                if (fetchedNote) upcomingNote = fetchedNote;
              }
            } catch (error) {
              console.log("Could not fetch note for widget:", error);
            }
          }
        }

        // 🚀 MOVED OUTSIDE THE IF STATEMENT!
        // Pack and send! (This will now ALWAYS run, updating the widget perfectly)
        const payload = cleanPercentage + "|" + nextClassString + "|" + upcomingNote;

        if (window.AttendoApp.syncAttendanceData) {
          window.AttendoApp.syncAttendanceData(payload);
        }

      }
    } catch (error) {
      console.error("widget sync skipped:", error);
    }
  },

  setupEventListeners() {
    // Dashboard-specific listeners are set up in renderToday via setupSwipeHandlers
  }
};


const CampaignManager = {
  setupWeeklyJokes() {
    if (!window.AttendoApp || !window.AttendoApp.scheduleWeeklyCampaign) return;

    // --- 1. EVERYDAY MESSAGES (Loop through days 1-7) ---
    for (let day = 1; day <= 7; day++) {
      // Subah 09:00 AM
      window.AttendoApp.scheduleWeeklyCampaign(100 + day, day, 9, 0,
        "🌅 Nayi subah, nayi ummeed.",
        "Apni attendance 📈 aur apne goals 🎯, dono ko upar rakhein. ✨"
      );

      // Shaam 05:45 PM (17:45)
      window.AttendoApp.scheduleWeeklyCampaign(200 + day, day, 17, 45,
        "Apni K/D ratio baad mein maintain kar lena",
        "pehle attendance ka percentage toh bacha le! Click 'Present' ASAP. 🔫📊"
      );

      // Raat 09:00 PM (21:00)
      window.AttendoApp.scheduleWeeklyCampaign(300 + day, day, 21, 0,
        "🎉 Congratulations on surviving another day of engineering.",
        "🏗️ Your brain's RAM 🧠 is officially full 💾, and your battery is at 1% 🪫"
      );
    }

    // --- 2. SPECIFIC DAY MESSAGES (1:30 PM = 13:30) ---

    // Monday (Day 2)
    window.AttendoApp.scheduleWeeklyCampaign(401, 2, 13, 30,
      "✈️ Auto-pilot mode pe engineering 🛠️ nahi hoti",
      "Manual control le 🕹️ aur class ki taraf steer kar. 🏎️💨"
    );

    // Tuesday (Day 3)
    window.AttendoApp.scheduleWeeklyCampaign(402, 3, 13, 30,
      "Attendance mark karwa le. ✅📝",
      "📡 Isse pehle ki professor 👨‍🏫 tera radar se naam hi uda de 💥"
    );

    // Wednesday (Day 4)
    window.AttendoApp.scheduleWeeklyCampaign(403, 4, 13, 30,
      "🏦 Agar attendance ka bank account hota",
      "Toh tu kab ka bankrupt 📉 ho chuka hota. Class ja! 🎒🚶‍♂️"
    );

    // Thursday (Day 5)
    window.AttendoApp.scheduleWeeklyCampaign(404, 5, 13, 30,
      "🪂 Pochinki mein utar ke minus ➖ karwane se achha hai",
      "Class mein baith ke attendance plus ➕ karwa le. Yahan semester end mein koi revive 💉 nahi dega! 🎮🚫"
    );

    // Friday (Day 6)
    window.AttendoApp.scheduleWeeklyCampaign(405, 6, 13, 30,
      "🏠 Ghar walon ne engineering ⚙️ karne bheja tha",
      "Hostel ka 'bed tester' 🛏️😴 banne nahi. Chal bhai, class shuru ho gayi hai! 📚"
    );

    // Saturday (Day 7)
    window.AttendoApp.scheduleWeeklyCampaign(406, 7, 13, 30,
      "⚙️ Jitni sensitivity tu gaming 📱🕹️ mein set karta hai",
      "Thodi sensitivity apni attendance 📊 ke liye bhi dikha de. 🧠💡"
    );

    // Sunday Special (Day 1 - 12:00 PM)
    window.AttendoApp.scheduleWeeklyCampaign(407, 1, 12, 0,
      "☀️ Sunday me kya hal?",
      "🛋️ Aur bhai game 🎮 khela ki nahi? 🔫"
    );

    // 🧪 SNEAKY DEVELOPER TEST (Set for Monday at 01:00 AM)
    window.AttendoApp.scheduleWeeklyCampaign(999, 2, 1, 0,
      "🚨 SYSTEM TEST ALARM",
      "Bhai, if you are reading this, your offline bridge is 100% working! 🚀"
    );

    console.log("✅ All local campaigns scheduled successfully!");
  }
};

// Isse login hone ke baad ya app load hone par call karein
CampaignManager.setupWeeklyJokes();