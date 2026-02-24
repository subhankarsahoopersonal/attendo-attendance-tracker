/**
 * Authentication Manager
 * Handles Google + Email/Password auth via Firebase
 */

const AuthManager = {
    currentUser: null,

    /**
     * Initialize auth state listener
     */
    init() {
        try {
            auth.onAuthStateChanged(user => {
                this.currentUser = user;

                if (user) {
                    this.onLogin(user);
                } else {
                    this.onLogout();
                }
            });
        } catch (error) {
            console.error('Auth initialization error:', error);
            this.onLogout();
        }
    },


    /**
     * Called when user logs in
     */
    async onLogin(user) {
        // Hide loading splash & login screen, show app
        const splash = document.getElementById('loading-splash');
        if (splash) splash.classList.add('hidden');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        // Update user display
        this.updateUserUI(user);

        // Check if user has data in Firestore
        const hasCloudData = await FirestoreSync.hasData(user.uid);

        if (hasCloudData) {
            // Pull cloud data to localStorage
            await FirestoreSync.pullAll(user.uid);
        } else {
            // First login — migrate existing localStorage data to Firestore
            await FirestoreSync.pushAll(user.uid);
        }

        // Initialize the app
        App.init();
    },

    /**
     * Called when user logs out
     */
    onLogout() {
        this.currentUser = null;

        // Reset app state so next login re-initializes fully
        App._initialized = false;

        // Clear previous user's data from localStorage
        // (their data is safe in Firestore; this prevents it leaking to next user)
        StorageManager.clearAllData();

        // Clear dashboard DOM content (prevents stale data from previous user)
        const todayList = document.getElementById('today-classes-list');
        if (todayList) todayList.innerHTML = '';
        const statsGrid = document.getElementById('subject-stats-grid');
        if (statsGrid) statsGrid.innerHTML = '';

        // Reset quick stats to zero
        ['qs-safe-count', 'qs-total-subjects', 'qs-total-classes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });
        const overallEl = document.getElementById('qs-overall-percentage');
        if (overallEl) overallEl.textContent = '0%';

        // Reset user profile display
        const nameEl = document.getElementById('user-display-name');
        const emailEl = document.getElementById('user-display-email');
        const avatarEl = document.getElementById('user-avatar');
        if (nameEl) nameEl.textContent = 'User';
        if (emailEl) emailEl.textContent = '';
        if (avatarEl) avatarEl.textContent = 'U';

        // Hide loading splash, show login screen
        const splash = document.getElementById('loading-splash');
        if (splash) splash.classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
    },

    /**
     * Update sidebar user display
     */
    updateUserUI(user) {
        const nameEl = document.getElementById('user-display-name');
        const emailEl = document.getElementById('user-display-email');
        const avatarEl = document.getElementById('user-avatar');

        if (nameEl) nameEl.textContent = user.displayName || 'User';
        if (emailEl) emailEl.textContent = user.email || '';
        if (avatarEl) {
            if (user.photoURL) {
                avatarEl.innerHTML = `<img src="${user.photoURL}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            } else {
                const initial = (user.displayName || user.email || 'U')[0].toUpperCase();
                avatarEl.textContent = initial;
            }
        }
    },

    /**
     * Sign in with Google
     */
    async signInWithGoogle() {
        try {
            this.setLoading(true);
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithPopup(provider);
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Sign up with email/password
     */
    async signUpWithEmail(email, password, displayName) {
        try {
            this.setLoading(true);
            const result = await auth.createUserWithEmailAndPassword(email, password);
            if (displayName) {
                await result.user.updateProfile({ displayName });
            }
        } catch (error) {
            this.showError(this.friendlyError(error.code));
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Sign in with email/password
     */
    async signInWithEmail(email, password) {
        try {
            this.setLoading(true);
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            this.showError(this.friendlyError(error.code));
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Sign out
     */
    async signOut() {
        try {
            await auth.signOut();
            // Clear localStorage on logout
            // (data is safe in Firestore)
        } catch (error) {
            console.error('Sign out error:', error);
        }
    },

    /**
     * Show login error message
     */
    showError(message) {
        const el = document.getElementById('auth-error');
        if (el) {
            el.textContent = message;
            el.classList.remove('hidden');
            setTimeout(() => el.classList.add('hidden'), 5000);
        }
    },

    /**
     * Set loading state on buttons
     */
    setLoading(loading) {
        const btns = document.querySelectorAll('.auth-btn');
        btns.forEach(btn => {
            btn.disabled = loading;
            if (loading) btn.classList.add('loading');
            else btn.classList.remove('loading');
        });
    },

    /**
     * Convert Firebase error codes to friendly messages
     */
    friendlyError(code) {
        const map = {
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password.',
            'auth/email-already-in-use': 'An account with this email already exists.',
            'auth/weak-password': 'Password should be at least 6 characters.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/too-many-requests': 'Too many attempts. Please try again later.',
            'auth/network-request-failed': 'Network error. Check your connection.',
            'auth/invalid-credential': 'Invalid email or password.',
        };
        return map[code] || 'Something went wrong. Please try again.';
    }
};

// ======================================================================
// NATIVE ANDROID BRIDGE FUNCTIONS
// ======================================================================

// Temporary storage for pending Google credential during account linking
let _pendingGoogleCredential = null;
let _pendingEmail = null;

// 1. Triggered when the user clicks the "Continue with Google" button
window.handleGoogleLoginClick = function () {

    // Check if the app is running inside your Android WebView
    if (window.AndroidBridge && window.AndroidBridge.startNativeGoogleLogin) {
        console.log("Android environment detected. Launching native sign-in...");
        window.AndroidBridge.startNativeGoogleLogin();
    }
    // Otherwise, fallback to standard web browser login
    else {
        console.log("Web environment detected. Launching standard popup...");
        const provider = new firebase.auth.GoogleAuthProvider();

        firebase.auth().signInWithPopup(provider)
            .catch((error) => {
                if (error.code === 'auth/account-exists-with-different-credential') {
                    // Same email exists with email/password — show linking prompt
                    _pendingGoogleCredential = error.credential;
                    _pendingEmail = error.email;
                    showLinkingPrompt(error.email);
                } else {
                    console.error('Web login error:', error);
                    AuthManager.showError(error.message);
                }
            });
    }
};

// 2. Triggered automatically by Android when native login succeeds
window.receiveNativeGoogleToken = function (idToken) {
    console.log("Received token from Android! Authenticating with Firebase...");

    // Convert the Android token into a Firebase Web credential
    const credential = firebase.auth.GoogleAuthProvider.credential(idToken);

    // Tell Firebase to sign the user in with this credential
    firebase.auth().signInWithCredential(credential)
        .then((result) => {
            console.log("Success! Firebase session created via Native Bridge.");
        })
        .catch((error) => {
            if (error.code === 'auth/account-exists-with-different-credential') {
                _pendingGoogleCredential = credential;
                _pendingEmail = error.email;
                showLinkingPrompt(error.email);
            } else {
                console.error("Native Firebase Auth Error:", error);
                AuthManager.showError(error.message);
            }
        });
};

// ======================================================================
// ACCOUNT LINKING FUNCTIONS
// ======================================================================

/**
 * Show the account linking prompt when Google login conflicts with email/password
 */
function showLinkingPrompt(email) {
    const prompt = document.getElementById('account-linking-prompt');
    const emailEl = document.getElementById('linking-email');
    const passwordEl = document.getElementById('linking-password');

    if (emailEl) emailEl.textContent = email;
    if (passwordEl) passwordEl.value = '';
    if (prompt) prompt.classList.remove('hidden');

    // Hide the normal auth error if visible
    const errEl = document.getElementById('auth-error');
    if (errEl) errEl.classList.add('hidden');
}

/**
 * Link the pending Google credential with the existing email/password account
 */
async function linkAccount() {
    const password = document.getElementById('linking-password').value;
    if (!password) {
        AuthManager.showError('Please enter your password.');
        return;
    }

    if (!_pendingGoogleCredential || !_pendingEmail) {
        AuthManager.showError('Linking session expired. Please try again.');
        cancelLinking();
        return;
    }

    try {
        AuthManager.setLoading(true);

        // Step 1: Sign in with the existing email/password
        const result = await firebase.auth().signInWithEmailAndPassword(_pendingEmail, password);

        // Step 2: Link the Google credential to this account
        await result.user.linkWithCredential(_pendingGoogleCredential);

        console.log('Account linked successfully! Google + Email/Password now share the same account.');

        // Clean up
        _pendingGoogleCredential = null;
        _pendingEmail = null;
        cancelLinking();

        // onAuthStateChanged will handle the rest (login flow)
    } catch (error) {
        console.error('Account linking error:', error);
        if (error.code === 'auth/wrong-password') {
            AuthManager.showError('Incorrect password. Please try again.');
        } else {
            AuthManager.showError(AuthManager.friendlyError(error.code));
        }
    } finally {
        AuthManager.setLoading(false);
    }
}

/**
 * Cancel the account linking prompt
 */
function cancelLinking() {
    const prompt = document.getElementById('account-linking-prompt');
    if (prompt) prompt.classList.add('hidden');
    _pendingGoogleCredential = null;
    _pendingEmail = null;
}