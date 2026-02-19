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
