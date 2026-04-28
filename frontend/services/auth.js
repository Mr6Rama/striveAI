let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

export function initAuth(config) {
  if (!config?.firebaseConfigured || !config?.firebaseConfig) {
    throw new Error('Firebase is not configured on server.');
  }
  if (!window.firebase?.initializeApp) {
    throw new Error('Firebase SDK not loaded.');
  }
  firebaseApp = (firebase.apps && firebase.apps.length)
    ? firebase.app()
    : firebase.initializeApp(config.firebaseConfig);
  firebaseAuth = firebase.auth();
  firebaseDb = firebase.firestore();
  return { auth: firebaseAuth, db: firebaseDb, app: firebaseApp };
}

export function onAuthChanged(handler) {
  if (!firebaseAuth) throw new Error('Auth not initialized');
  return firebaseAuth.onAuthStateChanged(handler);
}

export async function signIn(email, password) {
  if (!firebaseAuth) throw new Error('Auth not initialized');
  return firebaseAuth.signInWithEmailAndPassword(email, password);
}

export async function signUp(email, password) {
  if (!firebaseAuth) throw new Error('Auth not initialized');
  return firebaseAuth.createUserWithEmailAndPassword(email, password);
}

export async function signOut() {
  if (!firebaseAuth) return;
  await firebaseAuth.signOut();
}

export function authErrorMessage(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-email')) return 'Invalid email format.';
  if (code.includes('user-not-found')) return 'User not found.';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Invalid email or password.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Try later.';
  return String(error?.message || 'Authentication failed.');
}

export function getDb() {
  return firebaseDb;
}
