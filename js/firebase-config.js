/**
 * Firebase Configuration
 * Initializes Firebase App, Auth, and Firestore
 */

const firebaseConfig = {
    apiKey: "AIzaSyC_I9-dTBLKHVun1f-sVpW0KyREPKvj4WI",
    authDomain: "attendo-attendance-tracker.firebaseapp.com",
    projectId: "attendo-attendance-tracker",
    storageBucket: "attendo-attendance-tracker.firebasestorage.app",
    messagingSenderId: "818593184287",
    appId: "1:818593184287:web:e8bd1fe02965d91481332a",
    measurementId: "G-KRH6H1K32Q"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export references
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence for Firestore
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not available in this browser');
    }
});
