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
  if (code.includes('invalid-email'))         return 'That email doesn’t look right.';
  if (code.includes('email-already-in-use'))  return 'This email is already registered. Try signing in instead.';
  if (code.includes('weak-password'))         return 'Password is too short. Use at least 6 characters.';
  if (code.includes('user-not-found'))        return 'No account with this email. Create one?';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Wrong email or password.';
  if (code.includes('too-many-requests'))     return 'Too many attempts. Wait a minute and try again.';
  if (code.includes('network-request-failed')) return 'Network hiccup. Check your connection and retry.';
  if (code.includes('user-disabled'))         return 'This account has been disabled.';
  return 'Could not sign you in. Try again, or use Forgot password.';
}

export async function sendPasswordReset(email) {
  if (!firebaseAuth) throw new Error('Auth not initialized');
  return firebaseAuth.sendPasswordResetEmail(email);
}

export function getDb() {
  return firebaseDb;
}

// Returns a fresh Firebase ID token for the signed-in user, or '' if signed out.
export async function getAuthToken() {
  const user = firebaseAuth?.currentUser;
  if (!user) return '';
  try {
    return await user.getIdToken();
  } catch (_e) {
    return '';
  }
}
