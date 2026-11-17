import React, { useEffect, useState } from 'react';
import {
  User as FirebaseAuthUser,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
} from 'firebase/auth';
import { Eye, EyeOff, Mail, Lock, ArrowLeft, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';
import { auth, googleProvider } from '../../lib/firebase';
import { useApp } from '../../context/AppContext';
import { MobileDownloadModal } from '../common/MobileDownloadModal';
import { Footer } from '../layout/Footer';

type AuthMode = 'login' | 'forgot';

export const AuthScreen: React.FC = () => {
  const { firebaseUser, refreshAuthUser, signOut } = useApp();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  const isUnverifiedUser = Boolean(firebaseUser && !firebaseUser.emailVerified);

  // Automatically check on focus/return and every 4 seconds while waiting for account activation
  useEffect(() => {
    if (!isUnverifiedUser) return;
    let active = true;
    const checkNow = async () => {
      if (!active) return;
      try {
        await refreshAuthUser();
      } catch {
        // Ignore transient polling errors
      }
    };
    const timer = window.setInterval(checkNow, 4000);
    const onFocus = () => {
      checkNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkNow();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isUnverifiedUser]);

  const sendActivationEmail = async (user: FirebaseAuthUser) => {
    try {
      await sendEmailVerification(user, { url: window.location.origin });
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
        await sendEmailVerification(user);
        return;
      }
      throw err;
    }
  };

  const mapAuthError = (err: any): string => {
    const code = err?.code || '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      return 'Email/Password sign-in is not enabled in Firebase Console yet. Click "Continue with Gmail" below to sign in.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (code === 'auth/invalid-email') {
      return 'Please enter a valid email address.';
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return 'Sign-in window was closed before completing. Please try again.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'This domain is not authorized for Google Sign-In yet. Add this app domain in Firebase Console → Authentication → Settings → Authorized domains.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network error while contacting authentication service. Please check your internet connection.';
    }
    return err?.message || 'Authentication failed. Please try again.';
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Please enter your registered email address.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice('Password reset instructions have been sent to your email.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await sendActivationEmail(auth.currentUser);
      setNotice('Activation email resent. Please check your inbox and Spam/Junk folder.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // Account activation gate if user registered with email/password (not Gmail OAuth) and hasn't activated yet
  if (firebaseUser && !firebaseUser.emailVerified) {
    return (
      <div className="min-h-[100dvh] w-full overflow-x-hidden bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 flex items-center justify-center text-white">
              <Mail className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Activate your account</h1>
            <p className="text-sm text-slate-600 break-words">
              We sent an account activation link to{' '}
              <span className="font-semibold text-slate-900 break-all">{firebaseUser.email}</span>. Open the link in your inbox (or Spam/Junk folder) to activate your account. Once activated, SphereCall opens automatically — or tap Continue below.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={async () => {
                setError(null);
                setNotice(null);
                setLoading(true);
                try {
                  const verified = await refreshAuthUser();
                  if (!verified) {
                    setError('Your account is not activated yet. Please click the activation link sent to your email (check Spam/Junk too), then tap Continue.');
                  }
                } catch (err) {
                  setError(mapAuthError(err));
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {loading ? 'Checking activation...' : "I've Activated My Account — Continue"}
            </button>

            <button
              onClick={handleResendVerification}
              disabled={loading}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors"
            >
              Resend Activation Email
            </button>

            <button
              onClick={signOut}
              className="w-full min-h-[44px] py-2 text-xs text-slate-500 hover:text-slate-800 font-medium"
            >
              Back to Sign In
            </button>
          </div>
        </div>
        <Footer className="mt-6 rounded-2xl border border-slate-200 max-w-md" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 space-y-6">
        {/* Centered Logo & Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          <div className="w-14 h-14 rounded-2xl bg-sky-600 flex items-center justify-center text-white shadow-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-7 h-7"
              aria-hidden="true"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">SphereCall</h1>
          <p className="text-sm text-slate-500">
            {mode === 'login' && 'Sign in to connect with your team'}
            {mode === 'forgot' && 'Reset your account password'}
          </p>
        </div>

        {/* Feedback Banners */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        {/* 1. Sign In Mode */}
        {mode === 'login' && (
          <div className="space-y-5">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl pl-10 pr-11 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1.5 p-2 text-slate-400 hover:text-slate-700 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-xs text-slate-400 font-medium shrink-0">or</span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            {/* Gmail / Google Login */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>Continue with Gmail</span>
            </button>

            {/* Below: Forgot Password */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-center text-xs">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setNotice(null);
                  setMode('forgot');
                }}
                className="min-h-[40px] px-2 text-slate-600 hover:text-sky-600 font-medium transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </div>
        )}

        {/* 2. Forgot Password Mode */}
        {mode === 'forgot' && (
          <div className="space-y-4">
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/15"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setMode('login');
              }}
              className="w-full min-h-[40px] flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setDownloadModalOpen(true)}
        className="mt-4 min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors"
      >
        <Smartphone className="w-4 h-4 text-sky-600" />
        <span>Download App to Laptop or Phone</span>
      </button>

      <MobileDownloadModal isOpen={downloadModalOpen} onClose={() => setDownloadModalOpen(false)} />
      <Footer className="mt-6 rounded-2xl border border-slate-200 max-w-md" />
    </div>
  );
};
